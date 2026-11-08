import { File, Folder, Observable, knownFolders, path } from '@nativescript/core';
import bridgeSource from '../page-bridge.js?raw';
import { CdpPage } from './cdp';
import { findBrowsers, launchBrowser, type InstalledBrowser } from './desktop-browser';

const PLAYER_URL = 'https://open.spotify.com/';
const PLAYER_ORIGIN = 'https://open.spotify.com';
const LOGIN_URL = 'https://accounts.spotify.com/login?continue=' + encodeURIComponent(PLAYER_URL);

export type DesktopPlayerStatus = 'idle' | 'launching' | 'connected' | 'closed' | 'error';

/** The browser to use: the first Chromium-based one found. */
export function preferredBrowser(): InstalledBrowser | null {
  return findBrowsers().find((browser) => browser.kind === 'chromium') ?? null;
}

/**
 * The web player in an installed Chromium-based browser, driven over the
 * DevTools protocol. It uses its own browser profile and the same page bridge
 * as the embedded web views, and exposes the same surface (`call`, `navigate`,
 * `signOut`, `message` events).
 */
export class DesktopWebPlayer extends Observable {
  static readonly messageEvent = 'message';
  static readonly statusEvent = 'status';

  status: DesktopPlayerStatus = 'idle';
  error: string | null = null;

  private page: CdpPage | null = null;
  private inbox: unknown[] = [];

  constructor(readonly browser: InstalledBrowser) {
    super();
  }

  async start() {
    if (this.status === 'launching' || this.status === 'connected') {
      return;
    }
    this.setStatus('launching');
    try {
      const profile = Folder.fromPath(path.join(knownFolders.documents().path, 'web-player-profile')).path;
      const portFile = path.join(profile, 'DevToolsActivePort');
      // Reuse a window still open from an earlier session.
      let page = File.exists(portFile)
        ? await CdpPage.connect(readPort(portFile), PLAYER_ORIGIN, 2000).catch(() => null)
        : null;
      if (!page) {
        if (File.exists(portFile)) {
          File.fromPath(portFile).removeSync();
        }
        launchBrowser(this.browser, [
          '--remote-debugging-port=0',
          `--user-data-dir=${profile}`,
          '--no-first-run',
          '--no-default-browser-check',
          '--autoplay-policy=no-user-gesture-required',
          `--app=${PLAYER_URL}`,
        ]);
        page = await CdpPage.connect(await waitForPort(portFile), PLAYER_ORIGIN);
      }
      this.page = page;
      page.onClose(() => {
        this.page = null;
        this.setStatus('closed');
      });
      page.on('Runtime.bindingCalled', (params) => {
        if (params?.name === '__soundportSend') {
          this.receive(String(params.payload));
        }
      });
      await page.send('Runtime.enable');
      await page.send('Page.enable');
      await page.send('Runtime.addBinding', { name: '__soundportSend' });
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: bridgeSource });
      // Reload so the bridge is installed before the player's own scripts.
      await page.send('Page.reload');
      this.setStatus('connected');
    } catch (error) {
      this.error = String((error as any)?.message ?? error);
      this.setStatus('error');
    }
  }

  call(id: string, kind: string, payload: unknown) {
    const expression = `window.__soundportBridge && window.__soundportBridge.call(${JSON.stringify(id)}, ${JSON.stringify(kind)}, ${JSON.stringify(payload)})`;
    void this.page?.send('Runtime.evaluate', { expression }).catch(() => {});
  }

  navigate(url: string) {
    void this.page?.send('Page.navigate', { url }).catch(() => {});
  }

  /** Brings the browser window to the front (sign-in, or to see the player). */
  show() {
    void this.page?.send('Page.bringToFront').catch(() => {});
  }

  signIn() {
    this.navigate(LOGIN_URL);
    this.show();
  }

  async signOut() {
    const page = this.page;
    if (!page) {
      return;
    }
    await page.send('Network.clearBrowserCookies').catch(() => {});
    for (const origin of [PLAYER_ORIGIN, 'https://accounts.spotify.com']) {
      await page.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' }).catch(() => {});
    }
    this.navigate(PLAYER_URL);
  }

  close() {
    void this.page?.send('Browser.close').catch(() => {});
    this.page?.close();
    this.page = null;
  }

  deliverPending() {
    const pending = this.inbox;
    this.inbox = [];
    for (const data of pending) {
      this.notify({ eventName: DesktopWebPlayer.messageEvent, object: this, data } as any);
    }
  }

  private receive(json: string) {
    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch {
      return;
    }
    if (this.hasListeners(DesktopWebPlayer.messageEvent)) {
      this.notify({ eventName: DesktopWebPlayer.messageEvent, object: this, data } as any);
    } else {
      this.inbox.push(data);
    }
  }

  private setStatus(status: DesktopPlayerStatus) {
    this.status = status;
    this.notify({ eventName: DesktopWebPlayer.statusEvent, object: this, status } as any);
  }
}

function readPort(portFile: string): number {
  return Number(File.fromPath(portFile).readTextSync().split('\n')[0]) || 0;
}

/** Chromium writes its DevTools port to `DevToolsActivePort` in the profile. */
async function waitForPort(portFile: string, timeoutMs = 20000): Promise<number> {
  const started = Date.now();
  for (;;) {
    if (File.exists(portFile)) {
      const port = readPort(portFile);
      if (port > 0) {
        return port;
      }
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error('The browser did not start in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
