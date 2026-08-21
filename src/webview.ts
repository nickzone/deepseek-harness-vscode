import * as vscode from 'vscode'

/**
 * Open the DeepSeek Harness UI in VS Code's built-in Simple Browser.
 *
 * We intentionally use VS Code's own Simple Browser pipeline instead of a
 * hand-rolled `webview.html` iframe: VS Code's webview host (`pre/index.html`)
 * forces a fixed sandbox (`allow-scripts allow-same-origin allow-downloads
 * allow-forms allow-pointer-lock`) onto the content frame and the extension
 * HTML is re-parsed on the way in, so a custom nested `<iframe>` pointing at
 * `http://127.0.0.1:<port>` ends up sandboxed without `allow-scripts` and the
 * dsh app's JS is blocked (blank screen). The Simple Browser is purpose-built
 * to load external URLs in a webview and handles the sandbox correctly.
 *
 * The narrow-screen layout still applies here because dsh-mobile-nav is
 * installed in the served web profile — it reacts to the panel's width, not to
 * which webview shell hosts it.
 */
export async function openInSimpleBrowser(url: string, viewColumn?: vscode.ViewColumn): Promise<void> {
  // simpleBrowser.api.open's handler is (url, options) — two separate arguments,
  // not a single object. (Verified against the bundled simple-browser source.)
  await vscode.commands.executeCommand('simpleBrowser.api.open', url, {
    ...(viewColumn !== undefined ? { viewColumn } : {}),
  })
}
