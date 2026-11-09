import type { InstalledBrowser } from './desktop-browser';

export type { InstalledBrowser } from './desktop-browser';

declare const System: any;

function env(name: string): string {
  try {
    return System.Environment.GetEnvironmentVariable(name) || '';
  } catch {
    return '';
  }
}

export function findBrowsers(): InstalledBrowser[] {
  const programFiles = env('ProgramFiles');
  const programFilesX86 = env('ProgramFiles(x86)');
  const localAppData = env('LOCALAPPDATA');
  const candidates: [name: string, path: string, kind: InstalledBrowser['kind']][] = [];
  for (const root of [programFiles, programFilesX86, localAppData].filter(Boolean)) {
    candidates.push(
      ['Google Chrome', `${root}\\Google\\Chrome\\Application\\chrome.exe`, 'chromium'],
      ['Microsoft Edge', `${root}\\Microsoft\\Edge\\Application\\msedge.exe`, 'chromium'],
      ['Brave', `${root}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`, 'chromium'],
      ['Chromium', `${root}\\Chromium\\Application\\chrome.exe`, 'chromium'],
      ['Firefox', `${root}\\Mozilla Firefox\\firefox.exe`, 'firefox'],
    );
  }
  const found: InstalledBrowser[] = [];
  const seen = new Set<string>();
  for (const [name, path, kind] of candidates) {
    const key = path.toLowerCase();
    if (!seen.has(key) && System.IO.File.Exists(path)) {
      seen.add(key);
      found.push({ name, path, kind });
    }
  }
  return found;
}

function quote(value: string): string {
  return /[\s"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

export function launchBrowser(browser: InstalledBrowser, args: string[]): void {
  System.Diagnostics.Process.Start(browser.path, args.map(quote).join(' '));
}
