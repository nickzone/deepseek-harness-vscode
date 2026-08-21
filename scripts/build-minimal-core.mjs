#!/usr/bin/env node
/**
 * Build the minimal narrow-screen DSH client plugin (`deps/dsh-mobile-nav`).
 *
 * It is a self-contained CommonJS client that injects the mobile stylesheet and
 * marks the AppFrame. It deliberately carries NO React slots, haptics, stats,
 * debug badge, or third-party compatibility (aionui / usage-stats / genui /
 * git-graph / pet) — the dedicated profile only has base + web-app + this
 * plugin, so compat.css and all JS extras are dead weight and are dropped.
 *
 * The CSS is extracted from a pre-built `dsh-mobile-nav` lib/client.js (the
 * current vendored full plugin) and trimmed to: base keyframes + layout + misc.
 * Run it whenever the upstream CSS needs refreshing.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PKG_DIR = join(ROOT, 'deps', 'dsh-mobile-nav')
const SRC_CLIENT =
  process.env.DSH_MOBILE_SRC_CLIENT || join(ROOT, 'scripts', 'upstream', 'full-client.js')

// --- extract a CSS export (`exports.X_CSS = `...`;`) from the built client ---
function extractCss(clientJs, name) {
  const marker = `exports.${name} = \``
  const start = clientJs.indexOf(marker)
  if (start < 0) throw new Error(`exports.${name} not found`)
  const bodyStart = start + marker.length
  const end = clientJs.indexOf('`', bodyStart)
  if (end < 0) throw new Error(`unterminated ${name} literal`)
  return clientJs.slice(bodyStart, end)
}

function extractKeyframe(base, name) {
  const start = base.indexOf(`@keyframes ${name}`)
  if (start < 0) throw new Error(`keyframe ${name} not found`)
  const open = base.indexOf('{', start)
  let depth = 0
  let i = open
  for (; i < base.length; i++) {
    if (base[i] === '{') depth++
    else if (base[i] === '}') {
      depth--
      if (depth === 0) break
    }
  }
  return base.slice(start, i + 1)
}

const clientJs = readFileSync(SRC_CLIENT, 'utf8')
const base = extractCss(clientJs, 'BASE_CSS')
const layout = extractCss(clientJs, 'LAYOUT_CSS')
let misc = extractCss(clientJs, 'MISC_CSS')

// base.css also styles the haptic row / drawer-action / toggle buttons that the
// minimal core never renders — keep only the keyframes layout.css references.
const keyframes = ['dsh-mobile-nav-fade', 'dsh-mobile-nav-sheet-in', 'dsh-mobile-nav-sheet-up']
  .map((k) => extractKeyframe(base, k))
  .join('\n')

// Remove balanced `{...}` block starting at `needle` (from the start of the
// needle's line through the closing brace). Used to strip dead rules that only
// style plugin-added controls (toggle/files/fab/backdrop) or third-party sheets
// (aionui) which the minimal core never renders.
function removeBlock(css, needle) {
  const idx = css.indexOf(needle)
  if (idx < 0) return css
  const open = css.indexOf('{', idx)
  if (open < 0) return css
  let depth = 0
  let i = open
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) break
    }
  }
  const lineStart = css.lastIndexOf('\n', idx) + 1
  return css.slice(0, lineStart) + css.slice(i + 1)
}

// misc.css: the desktop block only hides plugin controls we no longer render.
misc = removeBlock(misc, '@media (min-width: 1024px)')
// misc.css tablet block: the aionui explorer/preview sheet rule is dead here.
misc = removeBlock(misc, '[data-aionui-explorer-col],')

// Drawer controls (toggle / fab / backdrop) restored from the full plugin's
// base.css. These are the minimum needed so a collapsed sidebar drawer can be
// opened (header toggle in the active phase, floating button on the hero/blank
// phase) and closed again (backdrop tap + Escape).
const controls = `/* ---------- drawer controls (toggle / fab / backdrop) ---------- */
[data-mobile-nav="toggle"] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: none;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--dsw-alias-label-secondary, inherit);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
[data-mobile-nav="toggle"]:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .06));
}
[data-mobile-nav="toggle"]:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #4f6ef7);
  outline-offset: 1px;
}
[data-mobile-nav="fab"] {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 12px);
  left: 10px;
  z-index: 21;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .12));
  border-radius: 50%;
  background: var(--dsw-alias-button-floating-fill, #ffffff);
  color: var(--dsw-alias-label-primary, inherit);
  cursor: pointer;
  box-shadow: 0 2px 12px rgba(0, 0, 0, .18);
  -webkit-tap-highlight-color: transparent;
}
[data-mobile-nav="fab"]:hover {
  background: var(--dsw-alias-button-floating-hover, rgba(0, 0, 0, .08));
}
[data-mobile-nav="fab"]:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #4f6ef7);
  outline-offset: 2px;
}
[data-mobile-nav="backdrop"] {
  position: absolute;
  inset: 0;
  z-index: 30;
  background: rgba(0, 0, 0, .45);
  cursor: pointer;
  animation: dsh-mobile-nav-fade .2s var(--ds-ease-in-out, ease-in-out);
  -webkit-tap-highlight-color: transparent;
}
/* Desktop (>= 1024px): the plugin is a no-op, so its controls never render. */
@media (min-width: 1024px) {
  [data-mobile-nav="toggle"],
  [data-mobile-nav="fab"],
  [data-mobile-nav="backdrop"] {
    display: none !important;
  }
}
`

const css = [
  '/* dsh-mobile-nav minimal narrow-screen core.',
  '   base keyframes + layout (mobile grid/drawer/settings/composer/message) + misc.',
  '   Third-party compat.css intentionally omitted: the dedicated profile has no',
  '   dsh-web-ui / aionui / usage-stats / genui / git-graph plugins. */',
  keyframes,
  controls,
  layout,
  misc,
].join('\n')

const cssJs = css.replace(/`/g, '\\`').replace(/\$\{/g, '\\${')

const client = `window.__ModuleLoader__.load({ id: "@dsh-external/dsh-mobile-nav", factory: (require) => {
'use strict'
/**
 * dsh-mobile-nav — minimal narrow-screen core for the DeepSeek Harness VS Code
 * sidebar. Injects the mobile stylesheet, marks the AppFrame so the shell's
 * sidebar collapses to a drawer below 1024px, and adds plain-DOM drawer
 * controls (header toggle / floating button / backdrop). No React slots, no
 * third-party compatibility.
 */
var module = { exports: {} }
var exports = module.exports

const MOBILE_QUERY = '(max-width: 1023px)'

const MOBILE_CSS = \`${cssJs}\`

exports.inject = ['layout']

function apply(ctx) {
  // 1. Mobile stylesheet (no-op at >= 1024px: every rule is media-gated).
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = '@dsh-external/dsh-mobile-nav'
    tag.textContent = MOBILE_CSS
    document.head.appendChild(tag)
    return () => {
      tag.remove()
    }
  }, 'dsh-mobile-nav: styles')

  // 2. Phone chrome: status-bar/theme/viewport + double-tap-zoom guard, narrow only.
  ctx.effect(() => {
    const narrow = window.matchMedia(MOBILE_QUERY)
    let cleanup = () => {}
    const arm = () => {
      cleanup()
      cleanup = narrow.matches ? installChrome() : () => {}
    }
    function installChrome() {
      const viewport = document.querySelector('meta[name="viewport"]')
      const originalViewport = viewport ? viewport.content : ''
      const theme = document.createElement('meta')
      theme.name = 'theme-color'
      const syncTheme = () => {
        theme.content = getComputedStyle(document.body).backgroundColor
      }
      const restore = () => {
        if (viewport !== null) viewport.content = originalViewport
        theme.remove()
      }
      if (viewport !== null) viewport.content = 'width=device-width, initial-scale=1, viewport-fit=cover'
      syncTheme()
      if (theme.parentElement === null) document.head.appendChild(theme)
      const onGesture = (e) => e.preventDefault()
      const bodyObs = new MutationObserver(syncTheme)
      bodyObs.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
      document.addEventListener('gesturestart', onGesture)
      return () => {
        bodyObs.disconnect()
        document.removeEventListener('gesturestart', onGesture)
        restore()
      }
    }
    arm()
    narrow.addEventListener('change', arm)
    return () => {
      narrow.removeEventListener('change', arm)
      cleanup()
    }
  }, 'dsh-mobile-nav: phone chrome')

  // 3. Frame marker so the mobile layout rules can target the shell frame.
  ctx.effect(() => {
    const arm = () => {
      const frame = document.querySelector('[data-shell-overlay]')?.parentElement
      if (frame !== null && frame !== undefined && !frame.hasAttribute('data-mobile-nav')) {
        frame.setAttribute('data-mobile-nav', 'frame')
      }
    }
    arm()
    const observer = new MutationObserver(arm)
    observer.observe(document.documentElement, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
    }
  }, 'dsh-mobile-nav: frame marker')

  // 4. Drawer controls: header toggle (active phase) / floating button
  //    (hero/blank phase) to open the sidebar drawer, plus backdrop tap and
  //    Escape to close it. Plain DOM nodes reconciled idempotently against the
  //    shell-owned frame/header because React can replace them at any time.
  ctx.effect(() => {
    const toggleSidebar = () => ctx.layout.toggleSidebar()
    const frame = () => document.querySelector('[data-mobile-nav="frame"]')
    const drawerOpen = () => {
      const f = frame()
      return f !== null && !f.hasAttribute('data-sidebar-collapsed')
    }
    const ICON =
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="16" height="16">' +
      '<rect x="1.75" y="1.75" width="12.5" height="12.5" rx="2"/>' +
      '<line x1="5.75" y1="1.75" x2="5.75" y2="14.25"/></svg>'

    let toggle = null
    let fab = null
    let backdrop = null

    // The active session header is the VISIBLE [data-phase] header; the hero
    // phase also mounts a header but hides it (headerHidden), so offsetParent
    // (null for display:none) is what distinguishes them.
    const visibleHeader = () => {
      const headers = document.querySelectorAll('[data-phase] header')
      for (let i = 0; i < headers.length; i++) {
        if (headers[i].offsetParent !== null) return headers[i]
      }
      return null
    }

    const ensureToggle = () => {
      const header = visibleHeader()
      if (header === null) {
        if (toggle !== null) { toggle.remove(); toggle = null }
        return
      }
      if (toggle !== null && toggle.isConnected) return
      toggle = document.createElement('button')
      toggle.type = 'button'
      toggle.setAttribute('data-mobile-nav', 'toggle')
      toggle.setAttribute('aria-label', '打开侧边栏')
      toggle.title = '打开侧边栏'
      toggle.innerHTML = ICON
      toggle.addEventListener('click', toggleSidebar)
      header.appendChild(toggle)
    }

    const ensureFab = () => {
      const f = frame()
      if (f === null) return
      if (visibleHeader() !== null) {
        if (fab !== null) { fab.remove(); fab = null }
        return
      }
      if (drawerOpen()) {
        if (fab !== null) { fab.remove(); fab = null }
        return
      }
      if (fab === null) {
        fab = document.createElement('button')
        fab.type = 'button'
        fab.setAttribute('data-mobile-nav', 'fab')
        fab.setAttribute('aria-label', '打开侧边栏')
        fab.title = '打开侧边栏'
        fab.innerHTML = ICON
        fab.addEventListener('click', toggleSidebar)
        f.appendChild(fab)
      }
    }

    const ensureBackdrop = () => {
      const f = frame()
      if (f === null) return
      if (drawerOpen()) {
        if (backdrop === null) {
          backdrop = document.createElement('div')
          backdrop.setAttribute('data-mobile-nav', 'backdrop')
          backdrop.setAttribute('role', 'button')
          backdrop.setAttribute('aria-label', '关闭侧边栏')
          backdrop.addEventListener('click', toggleSidebar)
          f.appendChild(backdrop)
        }
      } else if (backdrop !== null) {
        backdrop.remove()
        backdrop = null
      }
    }

    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      if (document.querySelector('[aria-modal="true"]') !== null) return
      if (drawerOpen()) toggleSidebar()
    }

    const reconcile = () => {
      ensureToggle()
      ensureFab()
      ensureBackdrop()
    }

    reconcile()
    const observer = new MutationObserver(reconcile)
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-sidebar-collapsed', 'data-phase'],
    })
    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      observer.disconnect()
      document.removeEventListener('keydown', onKeyDown, true)
      if (toggle !== null) toggle.remove()
      if (fab !== null) fab.remove()
      if (backdrop !== null) backdrop.remove()
    }
  }, 'dsh-mobile-nav: drawer controls')
}

exports.apply = apply

return module.exports
}})
`

mkdirSync(join(PKG_DIR, 'lib'), { recursive: true })
writeFileSync(join(PKG_DIR, 'lib', 'client.js'), client)
writeFileSync(
  join(PKG_DIR, 'lib', 'index.js'),
  `'use strict'
/**
 * dsh-mobile-nav, host half. The browser half ships via exports["./client"]
 * (package.json dsh.client declaration); the empty apply makes the row exist.
 */
exports.apply = function () {}
`,
)

writeFileSync(
  join(PKG_DIR, 'package.json'),
  JSON.stringify(
    {
      name: '@dsh-external/dsh-mobile-nav',
      version: '0.1.0',
      description: 'Minimal narrow-screen layout for the DeepSeek Harness VS Code sidebar',
      main: 'lib/index.js',
      exports: {
        '.': { default: './lib/index.js' },
        './client': { default: './lib/client.js' },
        './cordis.patch.yml': './cordis.patch.yml',
        './package.json': './package.json',
      },
      files: ['lib', 'cordis.patch.yml', 'package.json', 'README.md', 'LICENSE'],
      dsh: {
        bundle: { patch: './cordis.patch.yml' },
        client: { platform: 'web', inject: ['@deepseek-ai/dsh-client-runtime'] },
      },
      license: 'MIT',
    },
    null,
    2,
  ) + '\n',
)

writeFileSync(
  join(PKG_DIR, 'cordis.patch.yml'),
  '# dsh-mobile-nav minimal bundle: one client-only plugin row.\n- insert:\n    - id: dsh-mobile-nav\n      name: \'@dsh-external/dsh-mobile-nav\'\n',
)

console.log('wrote minimal dsh-mobile-nav to', PKG_DIR)
console.log('  client.js bytes:', Buffer.byteLength(client))
console.log('  css bytes:', Buffer.byteLength(css))
