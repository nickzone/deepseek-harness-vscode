import * as vscode from 'vscode'

/** Settings read from the `dshharness.*` configuration namespace. */
export interface DshSettings {
  dshBin: string
  profile: string
  host: string
  port: number
  mobileNavPath: string
  openOnStart: boolean
}

const CONFIG_SECTION = 'dshharness'

export function readSettings(): DshSettings {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION)
  return {
    dshBin: cfg.get<string>('dshBin', 'dsh') || 'dsh',
    profile: (cfg.get<string>('profile', 'web-vscode') || 'web-vscode').trim(),
    host: cfg.get<string>('host', '127.0.0.1') || '127.0.0.1',
    port: Math.max(0, Math.trunc(cfg.get<number>('port', 0))),
    mobileNavPath: (cfg.get<string>('mobileNavPath', '') || '').trim(),
    openOnStart: cfg.get<boolean>('openOnStart', true),
  }
}
