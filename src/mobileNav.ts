import { spawn } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

/** The narrow-screen (dsh-mobile-nav) plugin package name. */
export const MOBILE_NAV_PACKAGE = '@dsh-external/dsh-mobile-nav'

/** Installation-owned bundles every web UI profile needs. */
export const WEB_BASE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']

const PROFILE_PATCH_TEMPLATE = `# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; \`!!js\` expressions allowed).
[]
`
const PROFILE_PNPM_WORKSPACE = `packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
`

/** DeepSeek Harness home; overridable through DSH_HOME like the dsh CLI. */
export function dshHome(): string {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

/** Directory where a named profile's plugins are installed. */
export function profileDir(profile = 'web'): string {
  return path.join(dshHome(), 'profiles', profile)
}

/** True when dsh-mobile-nav is declared as a dependency of the profile. */
export async function isMobileNavInstalled(profile = 'web'): Promise<boolean> {
  try {
    const pkg = JSON.parse(
      await fs.promises.readFile(path.join(profileDir(profile), 'package.json'), 'utf8'),
    ) as Record<string, unknown>
    const deps = {
      ...((pkg.dependencies as Record<string, string>) ?? {}),
      ...((pkg.devDependencies as Record<string, string>) ?? {}),
    }
    return MOBILE_NAV_PACKAGE in deps
  } catch {
    return false
  }
}

function runDsh(dshBin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(dshBin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout?.on('data', (d: Buffer) => (out += d))
    child.stderr?.on('data', (d: Buffer) => (out += d))
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve(out)
      else reject(new Error(`dsh ${args.join(' ')} exited with code ${code ?? 'signal'}\n${out}`))
    })
  })
}

/**
 * Install dsh-mobile-nav into the profile via `dsh plugin --profile <p> add
 * link:<absolutePath>`. `mobileNavPath` must be an absolute path to a
 * dsh-mobile-nav checkout (it ships committed build artifacts, so no prepare
 * build is required).
 */
export async function installMobileNav(
  dshBin: string,
  mobileNavPath: string,
  profile = 'web',
): Promise<string> {
  const abs = path.resolve(mobileNavPath)
  return runDsh(dshBin, ['plugin', '--profile', profile, 'add', `link:${abs}`])
}

/**
 * Install an arbitrary dsh plugin into the profile (package name, `link:<path>`,
 * or `github:user/repo`). This targets the dedicated sidebar profile, so the
 * user's personal `web` profile is never touched. Note git-hosted specs may
 * need a pnpm `allowBuilds` approval for their prepare build.
 */
export async function installPlugin(dshBin: string, profile: string, spec: string): Promise<string> {
  return runDsh(dshBin, ['plugin', '--profile', profile, 'add', spec])
}

/**
 * Ensure a dedicated browser profile exists with the base web bundles. This is
 * the independent profile the extension boots — it deliberately does NOT copy
 * the user's personal `web` profile plugins. `@deepseek-ai/dsh-base` and
 * `@deepseek-ai/dsh-web-app` resolve from the installation's flat
 * `profiles/node_modules` fallback (like the shipped `web` template), so they
 * are written into `dsh.profile.bundles` directly instead of pnpm-installed
 * (which would hit the registry and fail on unpublished deps).
 */
export function ensureProfile(profile: string): void {
  const dir = profileDir(profile)
  fs.mkdirSync(dir, { recursive: true })

  const manifestPath = path.join(dir, 'package.json')
  let manifest: Record<string, unknown> = { dependencies: {}, dsh: { profile: { bundles: [] } } }
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
  } catch {
    /* missing or corrupt — fall back to defaults */
  }

  const profileObj = (manifest.dsh as { profile?: { bundles?: string[] } } | undefined)?.profile
  const bundles = profileObj?.bundles ?? []
  let changed = false
  for (const base of WEB_BASE_BUNDLES) {
    if (!bundles.includes(base)) {
      bundles.push(base)
      changed = true
    }
  }
  manifest.name = manifest.name ?? `dsh-profile-${path.basename(dir)}`
  manifest.private = true
  manifest.dependencies = (manifest.dependencies as Record<string, string>) ?? {}
  manifest.dsh = { ...((manifest.dsh as object) ?? {}), profile: { ...(profileObj ?? {}), bundles } }
  if (changed || !fs.existsSync(manifestPath)) {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  }

  const patchPath = path.join(dir, 'cordis.patch.yml')
  if (!fs.existsSync(patchPath)) fs.writeFileSync(patchPath, PROFILE_PATCH_TEMPLATE)
  const workspacePath = path.join(dir, 'pnpm-workspace.yaml')
  if (!fs.existsSync(workspacePath)) fs.writeFileSync(workspacePath, PROFILE_PNPM_WORKSPACE)
}

/** Realpath of the installed mobile-nav symlink, or undefined if not installed. */
export async function mobileNavRealpath(profile = 'web'): Promise<string | undefined> {
  const link = path.join(profileDir(profile), 'node_modules', '@dsh-external', 'dsh-mobile-nav')
  try {
    return await fs.promises.realpath(link)
  } catch {
    return undefined
  }
}

/**
 * Ensure dsh-mobile-nav is installed in the profile and points at
 * `mobileNavPath`. Re-links when the installed link targets a different
 * location (e.g. after the extension is upgraded and the bundled copy moves to
 * a new version directory). Returns true when it is present after the call
 * (no-op when `mobileNavPath` is empty).
 */
export async function ensureMobileNav(
  dshBin: string,
  profile: string,
  mobileNavPath: string,
): Promise<boolean> {
  if (!mobileNavPath) {
    return false
  }
  const abs = path.resolve(mobileNavPath)
  if ((await mobileNavRealpath(profile)) === abs) {
    return true
  }
  await installMobileNav(dshBin, abs, profile)
  return true
}
