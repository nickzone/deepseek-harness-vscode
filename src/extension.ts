import * as path from 'path'
import * as vscode from 'vscode'
import { readSettings } from './config'
import { startDshServer, type DshServerHandle } from './dshServer'
import {
  ensureMobileNav,
  ensureProfile,
  installMobileNav,
  installPlugin,
  isMobileNavInstalled,
} from './mobileNav'
import { openInSimpleBrowser } from './webview'
import { HarnessViewProvider } from './sidebar'

let server: DshServerHandle | undefined
let output: vscode.OutputChannel | undefined
let warnedMobileNavMissing = false
let provider: HarnessViewProvider | undefined
/** The dsh-mobile-nav copy bundled inside this extension. */
let bundledNavPath = ''

/** Profiles offered in the sidebar toolbar dropdown. */
const SIDEBAR_PROFILES = ['web', 'web-vscode']

function log(message: string): void {
  output?.appendLine(message)
}

/**
 * True when the extension owns/boosts this profile (boots it, provisions base
 * bundles, installs dsh-mobile-nav). The personal `web` profile is never
 * touched — when selected it is booted as-is, without provisioning.
 */
function isManagedProfile(profile: string): boolean {
  return profile !== 'web'
}

/** Profiles shown in the dropdown, always including the configured one. */
function sidebarProfiles(): string[] {
  const current = readSettings().profile
  return SIDEBAR_PROFILES.includes(current) ? SIDEBAR_PROFILES : [...SIDEBAR_PROFILES, current]
}

async function ensureServer(): Promise<number> {
  if (server && server.child.exitCode === null) {
    return server.port
  }
  const settings = readSettings()
  // The extension boots an independent, dedicated profile (not the user's
  // personal `web` profile) so the embedded instance only has the harness
  // bundles plus the narrow-screen plugin — nothing else. The personal `web`
  // profile is booted as-is and never provisioned.
  if (isManagedProfile(settings.profile)) {
    ensureProfile(settings.profile)
    // Narrow-screen source: the user's own checkout wins, otherwise the copy
    // bundled in this extension (extension-relative, portable across machines).
    await ensureMobileNav(settings.dshBin, settings.profile, settings.mobileNavPath || bundledNavPath)
  }
  server = await startDshServer(
    {
      dshBin: settings.dshBin,
      profile: settings.profile,
      host: settings.host,
      port: settings.port,
    },
    (chunk) => log(chunk),
  )
  log(`dsh [profile=${settings.profile}] listening at http://${settings.host}:${server.port}/`)
  server.child.on('exit', (code) => {
    log(`dsh web exited (${code ?? 'signal'})`)
    server = undefined
  })
  return server.port
}

async function harnessUrl(): Promise<string> {
  const settings = readSettings()
  const port = await ensureServer()
  return `http://${settings.host}:${port}/`
}

/**
 * Stop the running dsh server (if any) and boot it again, returning the new
 * URL. Used by the toolbar's restart action; the port can change when
 * `dshharness.port` is 0.
 */
async function restartServer(): Promise<string> {
  const settings = readSettings()
  if (server) {
    const current = server
    server = undefined
    await current.stop()
  }
  const port = await ensureServer()
  log(`dsh web restarted at http://${settings.host}:${port}/`)
  return `http://${settings.host}:${port}/`
}

/** Open a URL in the system's default browser. */
async function openExternal(url: string): Promise<void> {
  try {
    await vscode.env.openExternal(vscode.Uri.parse(url))
  } catch (error) {
    notifyError(error)
  }
}

/**
 * Switch the sidebar to another dsh profile: persist the setting, then reboot
 * the server so the new profile is loaded. Returns the new URL.
 */
async function switchProfile(profile: string): Promise<string> {
  const settings = readSettings()
  if (settings.profile === profile) {
    return harnessUrl()
  }
  const config = vscode.workspace.getConfiguration('dshharness')
  await config.update('profile', profile, vscode.ConfigurationTarget.Global)
  log(`switching sidebar profile to "${profile}"`)
  return restartServer()
}

async function revealSidebar(): Promise<void> {
  await harnessUrl()
  await vscode.commands.executeCommand(`${HarnessViewProvider.viewType}.focus`)
  log('DeepSeek Harness sidebar revealed')

  const settings = readSettings()
  if (settings.mobileNavPath && !warnedMobileNavMissing && !(await isMobileNavInstalled(settings.profile))) {
    warnedMobileNavMissing = true
    void vscode.window.showWarningMessage(
      `DeepSeek Harness: narrow-screen support (dsh-mobile-nav) is configured but not installed in the "${settings.profile}" profile. Run "Install Narrow-Screen Support" to apply the mobile layout when the panel is narrow.`,
    )
  }
}

function notifyError(error: unknown): void {
  log(String(error))
  const message = error instanceof Error ? error.message : String(error)
  void vscode.window.showErrorMessage(`DeepSeek Harness: ${message}`)
}

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel('DeepSeek Harness')
  context.subscriptions.push(output)

  bundledNavPath = path.join(context.extensionUri.fsPath, 'deps', 'dsh-mobile-nav')

  provider = new HarnessViewProvider(
    () => harnessUrl(),
    {
      restart: () => restartServer(),
      openExternal: (url) => void openExternal(url),
      switchProfile: (profile) => switchProfile(profile),
      getProfile: () => readSettings().profile,
      getProfiles: () => sidebarProfiles(),
    },
  )
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(HarnessViewProvider.viewType, provider),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('dshharness.open', async () => {
      try {
        await revealSidebar()
      } catch (error) {
        notifyError(error)
      }
    }),

    vscode.commands.registerCommand('dshharness.openInSimpleBrowser', async () => {
      try {
        await openInSimpleBrowser(await harnessUrl())
      } catch (error) {
        notifyError(error)
      }
    }),

    vscode.commands.registerCommand('dshharness.installPlugin', async () => {
      try {
        const settings = readSettings()
        const spec = await vscode.window.showInputBox({
          prompt: `dsh plugin spec to install into the "${settings.profile}" profile (e.g. package-name, link:/abs/path, or github:user/repo)`,
          ignoreFocusOut: true,
        })
        if (!spec) {
          return
        }
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Installing "${spec}" into ${settings.profile}…`,
          },
          () => installPlugin(settings.dshBin, settings.profile, spec),
        )
        log(`installed plugin "${spec}" into profile ${settings.profile}`)
        void vscode.window.showInformationMessage(
          `Installed "${spec}" into the "${settings.profile}" profile. Restart dsh web (Stop Server, then Open Panel) to apply.`,
        )
      } catch (error) {
        notifyError(error)
      }
    }),

    vscode.commands.registerCommand('dshharness.stopServer', async () => {
      if (!server) {
        void vscode.window.showInformationMessage('DeepSeek Harness: no server is running.')
        return
      }
      const current = server
      server = undefined
      await current.stop()
      log('dsh web stopped')
      void vscode.window.showInformationMessage('DeepSeek Harness: server stopped.')
    }),

    vscode.commands.registerCommand('dshharness.installMobileNav', async () => {
      try {
        const settings = readSettings()
        let mobileNavPath = settings.mobileNavPath
        if (!mobileNavPath) {
          const entered = await vscode.window.showInputBox({
            prompt: 'Absolute path to a dsh-mobile-nav checkout (optional; leave empty to use the copy bundled with this extension)',
            ignoreFocusOut: true,
          })
          if (entered === undefined) {
            return
          }
          mobileNavPath = entered.trim()
        }
        const source = mobileNavPath || bundledNavPath
        const config = vscode.workspace.getConfiguration('dshharness')
        await config.update('mobileNavPath', mobileNavPath, vscode.ConfigurationTarget.Global)
        const result = await installMobileNav(settings.dshBin, source, settings.profile)
        log(result)
        void vscode.window.showInformationMessage(
          `DeepSeek Harness: dsh-mobile-nav installed into the "${settings.profile}" profile. Restart dsh web (stop + open panel) to apply narrow-screen support.`,
        )
      } catch (error) {
        notifyError(error)
      }
    }),
  )
}

export function deactivate(): void {
  if (server) {
    const current = server
    server = undefined
    void current.stop()
  }
}
