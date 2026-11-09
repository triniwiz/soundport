import { Injectable, signal } from '@angular/core';
import { preferredBrowser } from './desktop/desktop-web-player';
import { findBrowsers } from './desktop/desktop-browser';
import { supportsWebPlayer } from './native-web-player';
import { WEB_PLAYER_LOGIN_URL } from './web-player-surface';

/** Where the player page runs: an embedded web view or a desktop browser. */
export interface WebPlayerTarget {
  call(id: string, kind: string, payload: unknown): void;
  navigate(url: string): void;
  signOut(): Promise<void>;
  deliverPending(): void;
  on(event: string, callback: (args: any) => void): void;
  off(event: string, callback: (args: any) => void): void;
  /** Desktop browsers sign in (and show) in their own window. */
  signIn?(): void;
  show?(): void;
}

const desktop = __LINUX__ || __WINDOWS__;
const desktopBrowser = desktop ? preferredBrowser() : null;

type BridgeMessage =
  | { type: 'ready' }
  | { type: 'graphql-ready' }
  | { type: 'state'; state: any }
  | { type: 'result'; id: string; ok: boolean; value?: any; error?: string }
  | { type: 'log'; level: string; message: string };

interface Pending {
  resolve(value: any): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

/** Calls into Spotify's web player through the page bridge and follows its state. */
@Injectable({ providedIn: 'root' })
export class WebPlayer {
  /** Desktop: the browser that hosts the player, if one is installed. */
  readonly desktopBrowser = desktopBrowser;
  readonly supported = supportsWebPlayer || !!desktopBrowser;
  /** Desktop with only Firefox installed (not supported yet). */
  readonly onlyFirefox = desktop && !desktopBrowser && findBrowsers().some((b) => b.kind === 'firefox');
  readonly status = signal<'off' | 'loading' | 'ready'>('off');
  readonly graphqlReady = signal(false);
  /** null until checked after a page load. */
  readonly signedIn = signal<boolean | null>(null);
  /** Show the web player itself. */
  readonly visible = signal(false);
  /** Raw player state from the bridge. */
  readonly state = signal<any>(null);

  private surface: WebPlayerTarget | null = null;
  private pending = new Map<string, Pending>();
  private sequence = 0;
  private lastSummary = '';
  private readonly onMessage = (args: any) => this.handle(args.data as BridgeMessage);

  attach(surface: WebPlayerTarget): () => void {
    this.detach();
    this.surface = surface;
    this.status.set('loading');
    surface.on('message', this.onMessage);
    surface.deliverPending();
    return () => this.detach();
  }

  call<T = any>(kind: string, payload: Record<string, unknown> = {}, timeoutMs = 20000): Promise<T> {
    const surface = this.surface;
    if (!surface) {
      return Promise.reject(new Error('The web player is not running'));
    }
    const id = `c${++this.sequence}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Web player request timed out (${kind})`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      surface.call(id, kind, payload);
    });
  }

  invoke<T = any>(service: string, method: string, ...args: unknown[]): Promise<T> {
    return this.call<T>('invoke', { service, method, args });
  }

  graphql<T = any>(name: string, variables: Record<string, unknown>): Promise<T> {
    return this.call<T>('graphql', { name, variables });
  }

  signIn() {
    if (this.surface?.signIn) {
      this.surface.signIn();
    } else {
      this.surface?.navigate(WEB_PLAYER_LOGIN_URL);
    }
  }

  /** Shows the web player itself (a desktop browser window comes to the front). */
  show() {
    if (this.surface?.show) {
      this.surface.show();
    } else {
      this.visible.set(true);
    }
  }

  async signOut() {
    this.signedIn.set(null);
    this.status.set('loading');
    await this.surface?.signOut();
  }

  private checkSignedIn() {
    // Only available to signed-in sessions.
    this.invoke<string>('RootlistAPI', 'getUsername')
      .then((name) => {
        console.log('[web-player] signed in:', !!name);
        this.signedIn.set(!!name);
      })
      .catch(() => {
        console.log('[web-player] signed in: false');
        this.signedIn.set(false);
      });
  }

  private detach() {
    if (!this.surface) {
      return;
    }
    this.surface.off('message', this.onMessage);
    this.surface = null;
    this.status.set('off');
    this.pending.forEach((p) => {
      clearTimeout(p.timer);
      p.reject(new Error('The web player closed'));
    });
    this.pending.clear();
  }

  private handle(message: BridgeMessage) {
    switch (message.type) {
      case 'result': {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.ok) pending.resolve(message.value);
        else pending.reject(new Error(message.error ?? 'Web player request failed'));
        break;
      }
      case 'ready':
        console.log('[web-player] bridge ready');
        this.status.set('ready');
        this.signedIn.set(null);
        this.checkSignedIn();
        break;
      case 'graphql-ready':
        console.log('[web-player] graphql ready');
        this.graphqlReady.set(true);
        break;
      case 'state': {
        this.state.set(message.state);
        const s = message.state;
        const summary = s
          ? `${s.isPaused ? 'paused' : 'playing'}${s.isBuffering ? ' buffering' : ''} @${Math.round((s.positionAsOfTimestamp ?? 0) / 1000)}s ${s.item?.uri ?? ''}`
          : 'none';
        if (summary !== this.lastSummary) {
          this.lastSummary = summary;
          console.log('[web-player] state', summary);
        }
        break;
      }
      case 'log':
        console.log('[web-player page]', message.level, message.message);
        break;
    }
  }
}
