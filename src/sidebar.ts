import * as crypto from 'crypto'
import * as vscode from 'vscode'
import { readSettings } from './config'

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
export function makeSidebarHtml(webview: vscode.Webview, url: string): string {
  const nonce = crypto.randomBytes(16).toString('base64')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; frame-src *;">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DeepSeek Harness</title>
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
  #frame { display: block; width: 100%; height: 100%; border: 0; }
</style>
</head>
<body>
<iframe id="frame" sandbox="allow-scripts allow-forms allow-same-origin allow-downloads"></iframe>
<script nonce="${nonce}">
  document.getElementById('frame').src = ${JSON.stringify(url)};
</script>
</body>
</html>`
}

/** Sidebar WebviewView provider backed by a running dsh web server. */
export class HarnessViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'dshharness.panel'

  private _view: vscode.WebviewView | undefined
  private _url: string | undefined

  constructor(
    private readonly _getUrl: () => Promise<string>,
  ) {}

  public resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view
    view.webview.options = {
      enableScripts: true,
      enableForms: true,
      localResourceRoots: [],
    }
    void this.render(view)
  }

  private async render(view: vscode.WebviewView): Promise<void> {
    if (!this._url) {
      try {
        this._url = await this._getUrl()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        view.webview.html = `<!DOCTYPE html><html><body style="font-family: sans-serif; padding: 12px;">Unable to start DeepSeek Harness: ${message}</body></html>`
        return
      }
    }
    view.webview.html = makeSidebarHtml(view.webview, this._url)
  }

  /** Refresh the embedded UI (keeps the same server). */
  public refresh(): void {
    if (this._view) {
      void this.render(this._view)
    }
  }
}
