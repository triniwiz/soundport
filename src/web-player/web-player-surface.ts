import { View } from '@nativescript/core';
import bridgeSource from './page-bridge.js?raw';
import {
  createWebPlayerView,
  clearWebPlayerSession,
  disposeWebPlayerView,
  evaluateInWebPlayer,
  navigateWebPlayer,
  type WebPlayerHost,
} from './native-web-player';

export const WEB_PLAYER_URL = 'https://open.spotify.com/';
export const WEB_PLAYER_LOGIN_URL =
  'https://accounts.spotify.com/login?continue=' + encodeURIComponent(WEB_PLAYER_URL);

/** Spotify's web player with the page bridge injected. Raises `message` with bridge messages. */
export class WebPlayerSurface extends View implements WebPlayerHost {
  static readonly messageEvent = 'message';

  /** Messages that arrived before anyone listened. */
  private inbox: unknown[] = [];

  call(id: string, kind: string, payload: unknown) {
    if (!this.nativeViewProtected) {
      return;
    }
    const script = `window.__soundportBridge && window.__soundportBridge.call(${JSON.stringify(id)}, ${JSON.stringify(kind)}, ${JSON.stringify(payload)});`;
    evaluateInWebPlayer(this.nativeViewProtected, script);
  }

  navigate(url: string) {
    if (this.nativeViewProtected) {
      navigateWebPlayer(this.nativeViewProtected, url);
    }
  }

  async signOut() {
    if (!this.nativeViewProtected) {
      return;
    }
    await clearWebPlayerSession(this.nativeViewProtected);
    this.navigate(WEB_PLAYER_URL);
  }

  _receive(json: string) {
    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch {
      return;
    }
    if (this.hasListeners(WebPlayerSurface.messageEvent)) {
      this.notify({ eventName: WebPlayerSurface.messageEvent, object: this, data } as any);
    } else {
      this.inbox.push(data);
    }
  }

  deliverPending() {
    const pending = this.inbox;
    this.inbox = [];
    for (const data of pending) {
      this.notify({ eventName: WebPlayerSurface.messageEvent, object: this, data } as any);
    }
  }

  createNativeView() {
    return createWebPlayerView(this, WEB_PLAYER_URL, bridgeSource);
  }

  disposeNativeView() {
    this.inbox = [];
    if (this.nativeViewProtected) {
      disposeWebPlayerView(this.nativeViewProtected);
    }
    super.disposeNativeView();
  }
}
