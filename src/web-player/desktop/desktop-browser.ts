/** An installed browser that can host the web player. */
export interface InstalledBrowser {
  name: string;
  path: string;
  /** Chromium-based browsers are driven over the DevTools protocol; Firefox isn't supported yet. */
  kind: 'chromium' | 'firefox';
}

/** Browsers found on this system, most suitable first. Empty on mobile. */
export function findBrowsers(): InstalledBrowser[] {
  return [];
}

export function launchBrowser(_browser: InstalledBrowser, _args: string[]): void {
  throw new Error('Launching a browser is only supported on desktop');
}
