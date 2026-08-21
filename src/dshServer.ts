import { spawn, type ChildProcess } from 'child_process'
import * as http from 'http'
import * as net from 'net'

export interface DshServerOptions {
  dshBin: string
  host: string
  /** 0 => let the extension pick a free port. */
  port: number
  /** The dsh profile to boot (defaults to the web profile). */
  profile: string
}

export interface DshServerHandle {
  readonly port: number
  readonly child: ChildProcess
  stop(): Promise<void>
}

/** Ask the OS for a currently free loopback port. */
export function getFreePort(host = '127.0.0.1'): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    const done = (fn: () => void): void => {
      srv.close((err) => (err ? reject(err) : fn()))
    }
    srv.once('error', reject)
    srv.listen(0, host, () => {
      const address = srv.address()
      const port = address && typeof address === 'object' ? address.port : 0
      done(() => resolve(port))
    })
  })
}

/** Resolve the URL to a listening HTTP server; reject after `timeoutMs`. */
export function waitForServer(url: string, timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const attempt = (): void => {
      const req = http.get(url, (res) => {
        res.resume()
        resolve()
      })
      req.on('error', () => {
        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for ${url}`))
        } else {
          setTimeout(attempt, 250)
        }
      })
      req.setTimeout(2000, () => req.destroy())
    }
    attempt()
  })
}

function stopChild(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null || !child.pid) {
      resolve()
      return
    }
    child.once('exit', () => resolve())
    child.kill('SIGTERM')
    setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* already gone */
      }
    }, 3000)
  })
}

/**
 * Boot `dsh web` on a loopback host and wait until it is reachable.
 * The web profile is the DeepSeek Harness browser UI; `--no-open` keeps the
 * default browser from opening since we embed the UI in a webview.
 */
export async function startDshServer(
  options: DshServerOptions,
  onOutput: (chunk: string) => void,
): Promise<DshServerHandle> {
  const port = options.port > 0 ? options.port : await getFreePort(options.host)
  // Boot the configured profile (e.g. the dedicated web-vscode profile) and
  // hand it the web app flags. `dsh --profile <name>` forwards trailing
  // app flags to the booted profile's entrypoint (same as `dsh web ...`).
  const args = [
    '--profile',
    options.profile,
    '--no-open',
    '--host',
    options.host,
    '--port',
    String(port),
  ]

  const child = spawn(options.dshBin, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  })
  child.stdout?.on('data', (d: Buffer) => onOutput(d.toString()))
  child.stderr?.on('data', (d: Buffer) => onOutput(d.toString()))

  const url = `http://${options.host}:${port}/`

  // If the child dies before the server is reachable (e.g. the configured port
  // was already in use and another dsh instance is answering), fail loudly
  // rather than silently attaching to a foreign server.
  const exitedEarly = new Promise<never>((_resolve, reject) => {
    child.once('exit', (code) => {
      reject(new Error(`dsh web exited before becoming ready (code ${code ?? 'signal'})`))
    })
  })

  try {
    await Promise.race([waitForServer(url), exitedEarly])
  } catch (err) {
    stopChild(child)
    throw err
  }

  return {
    port,
    child,
    stop: () => stopChild(child),
  }
}
