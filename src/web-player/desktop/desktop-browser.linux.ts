import type { InstalledBrowser } from './desktop-browser';

export type { InstalledBrowser } from './desktop-browser';

const g = globalThis as any;

const CANDIDATES: [name: string, program: string, kind: InstalledBrowser['kind']][] = [
  ['Google Chrome', 'google-chrome-stable', 'chromium'],
  ['Google Chrome', 'google-chrome', 'chromium'],
  ['Chromium', 'chromium', 'chromium'],
  ['Chromium', 'chromium-browser', 'chromium'],
  ['Microsoft Edge', 'microsoft-edge-stable', 'chromium'],
  ['Microsoft Edge', 'microsoft-edge', 'chromium'],
  ['Brave', 'brave-browser', 'chromium'],
  ['Vivaldi', 'vivaldi-stable', 'chromium'],
  ['Firefox', 'firefox', 'firefox'],
];

function findProgram(program: string): string | null {
  const pointer = g.g_find_program_in_path(program);
  if (!pointer) {
    return null;
  }
  const path = g.interop.stringFromCString(pointer);
  g.g_free(pointer);
  return path || null;
}

export function findBrowsers(): InstalledBrowser[] {
  const found: InstalledBrowser[] = [];
  const seen = new Set<string>();
  for (const [name, program, kind] of CANDIDATES) {
    const path = findProgram(program);
    if (path && !seen.has(path)) {
      seen.add(path);
      found.push({ name, path, kind });
    }
  }
  return found;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function launchBrowser(browser: InstalledBrowser, args: string[]): void {
  const commandLine = [browser.path, ...args].map(shellQuote).join(' ');
  if (!g.g_spawn_command_line_async(commandLine, null)) {
    throw new Error(`Could not start ${browser.name}`);
  }
}
