import * as crypto from 'crypto'
import * as vscode from 'vscode'

/**
 * A sidebar WebviewView that embeds the DeepSeek Harness UI.
 *
 * This mirrors VS Code's own Simple Browser exactly, because that is the
 * proven way to load a cross-origin local HTTP app inside a webview:
 *
 *   - webview created with `enableScripts` AND `enableForms`;
 *   - CSP uses `frame-src *` (not a port-scoped source) and `script-src 'nonce-…'`;
 *   - the `<iframe>` gets the fixed sandbox tokens
 *     `allow-scripts allow-forms allow-same-origin allow-downloads`;
 *   - the iframe `src` is assigned by a nonce'd script after load.
 *
 * (VS Code's webview host force-sandboxes nested frames, and a hand-written
 * iframe with a port-scoped CSP ended up script-blocked — that was the blank
 * screen. Copying the Simple Browser recipe avoids the pitfall.)
 */
/** HTML-escape a string that lands in markup text or an attribute. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function makeSidebarHtml(
  webview: vscode.Webview,
  url: string,
  profile: string,
  profiles: string[],
): string {
  const nonce = crypto.randomBytes(16).toString('base64')
  // Show the server address (e.g. 127.0.0.1:54321) in the toolbar. Escape it
  // since `host` is user-configurable and lands in both text and an attribute.
  const address = url.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; frame-src *;">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DeepSeek Harness</title>
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: var(--vscode-sideBar-background); }
  #toolbar {
    display: flex; align-items: center; justify-content: space-between; gap: 6px;
    height: 30px; padding: 0 6px 0 12px; box-sizing: border-box;
    border-bottom: 1px solid var(--vscode-sideBar-border, transparent);
    background: var(--vscode-sideBar-background);
    color: var(--vscode-sideBar-foreground);
    font-family: var(--vscode-font-family); font-size: 11px;
    user-select: none;
  }
  #address {
    flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    opacity: .9; cursor: pointer;
  }
  #address:hover { color: var(--vscode-textLink-foreground); text-decoration: underline; }
  #address .ext { opacity: .55; font-size: 10px; }
  #profile {
    flex: none; height: 20px; max-width: 120px; padding: 0 2px;
    background: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    border: 1px solid var(--vscode-dropdown-border, transparent);
    border-radius: 4px; outline: none; cursor: pointer;
    font-family: var(--vscode-font-family); font-size: 11px;
  }
  #restart {
    display: flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; padding: 0; border: none; border-radius: 5px;
    background: transparent; color: var(--vscode-sideBar-foreground);
    font-size: 15px; line-height: 1; cursor: pointer;
  }
  #restart:hover { background: var(--vscode-toolbar-hoverBackground); }
  #restart:active { background: var(--vscode-toolbar-activeBackground); }
  #restart:disabled { opacity: .5; cursor: default; }
  #frame { display: block; width: 100%; height: calc(100% - 30px); border: 0; }
</style>
</head>
<body>
<div id="toolbar">
  <span id="address" title="Open in browser: ${esc(address)}">${esc(address)} <span class="ext">↗</span></span>
  <select id="profile" title="Sidebar profile">
    ${profiles.map((p) => `<option value="${esc(p)}"${p === profile ? ' selected' : ''}>${esc(p)}</option>`).join('')}
  </select>
  <button id="restart" title="Restart server" aria-label="Restart server">⟳</button>
</div>
<iframe id="frame" sandbox="allow-scripts allow-forms allow-same-origin allow-downloads"></iframe>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const url = ${JSON.stringify(url)};
  document.getElementById('restart').addEventListener('click', function () {
    this.disabled = true;
    vscode.postMessage({ type: 'restart' });
  });
  document.getElementById('address').addEventListener('click', function () {
    vscode.postMessage({ type: 'openExternal', url: url });
  });
  document.getElementById('profile').addEventListener('change', function () {
    vscode.postMessage({ type: 'switchProfile', profile: this.value });
  });
  document.getElementById('frame').src = url;
</script>
</body>
</html>`
}

/** Webview → extension messages handled by the sidebar toolbar. */
export interface HarnessViewHandlers {
  /** Restart the dsh server, returning the new URL. */
  restart: () => Promise<string>
  /** Open a URL in the system browser. */
  openExternal: (url: string) => void
  /** Switch the sidebar to another dsh profile, returning the new URL. */
  switchProfile: (profile: string) => Promise<string>
  /** Current dsh profile name. */
  getProfile: () => string
  /** Profiles offered in the toolbar dropdown. */
  getProfiles: () => string[]
}

/** Sidebar WebviewView provider backed by a running dsh web server. */
export class HarnessViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'dshharness.panel'

  private _view: vscode.WebviewView | undefined
  private _url: string | undefined
  private _restarting = false

  constructor(
    private readonly _getUrl: () => Promise<string>,
    private readonly _handlers: HarnessViewHandlers,
  ) {}

  public resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view
    view.webview.options = {
      enableScripts: true,
      enableForms: true,
      localResourceRoots: [],
    }
    view.webview.onDidReceiveMessage((message) => {
      if (message?.type === 'restart' && !this._restarting) {
        void this.restart()
      } else if (message?.type === 'openExternal' && typeof message.url === 'string') {
        this._handlers.openExternal(message.url)
      } else if (message?.type === 'switchProfile' && typeof message.profile === 'string') {
        void this.switchProfile(message.profile)
      }
    })
    void this.render(view)
  }

  private async render(view: vscode.WebviewView): Promise<void> {
    if (!this._url) {
      try {
        this._url = await this._getUrl()
      } catch (error) {
        this.showError(view, error)
        return
      }
    }
    view.webview.html = makeSidebarHtml(view.webview, this._url, this._handlers.getProfile(), this._handlers.getProfiles())
  }

  private showError(view: vscode.WebviewView, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    view.webview.html = `<!DOCTYPE html><html><body style="font-family: sans-serif; padding: 12px;">Unable to start DeepSeek Harness: ${message}</body></html>`
  }

  /**
   * Stop the dsh server and boot it again, then reload the embedded UI with
   * the new URL (the port may change when `dshharness.port` is 0).
   */
  public async restart(): Promise<void> {
    if (!this._view || this._restarting) {
      return
    }
    this._restarting = true
    const view = this._view
    view.webview.html = makeRestartingHtml(view.webview)
    try {
      this._url = await this._handlers.restart()
      view.webview.html = makeSidebarHtml(view.webview, this._url, this._handlers.getProfile(), this._handlers.getProfiles())
    } catch (error) {
      this.showError(view, error)
    } finally {
      this._restarting = false
    }
  }

  /** Switch to another profile (updates settings + restarts the server). */
  public async switchProfile(profile: string): Promise<void> {
    if (!this._view || this._restarting) {
      return
    }
    this._restarting = true
    const view = this._view
    view.webview.html = makeRestartingHtml(view.webview)
    try {
      this._url = await this._handlers.switchProfile(profile)
      view.webview.html = makeSidebarHtml(view.webview, this._url, this._handlers.getProfile(), this._handlers.getProfiles())
    } catch (error) {
      this.showError(view, error)
    } finally {
      this._restarting = false
    }
  }

  /** Refresh the embedded UI (keeps the same server). */
  public refresh(): void {
    if (this._view) {
      void this.render(this._view)
    }
  }
}

/** Full-screen "restarting" placeholder shown while the server reboots. */
function makeRestartingHtml(webview: vscode.Webview): string {
  const nonce = crypto.randomBytes(16).toString('base64')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: var(--vscode-sideBar-background); }
  #status {
    display: flex; align-items: center; justify-content: center; height: 100%;
    font-family: var(--vscode-font-family); font-size: 12px;
    color: var(--vscode-sideBar-foreground);
  }
</style>
</head>
<body>
<div id="status">Restarting DeepSeek Harness…</div>
</body>
</html>`
}
