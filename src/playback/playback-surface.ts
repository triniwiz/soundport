import { View } from '@nativescript/core';
import {
  createNativeWebView,
  disposeNativeWebView,
  evaluateScript,
  initNativeWebView,
  type SurfaceHost,
} from './native-web-view';

/**
 * Native web view hosting the Web Playback SDK page. It only needs to be in
 * the window, so keep it tiny. Raises `message` with the parsed page message.
 */
export class PlaybackSurface extends View implements SurfaceHost {
  static readonly messageEvent = 'message';

  private queue: string[] = [];
  private loaded = false;
  /** Messages that arrived before anyone listened. */
  private inbox: unknown[] = [];

  /** Queued until the page has loaded. */
  post(message: unknown) {
    const script = `window.__soundport && window.__soundport.receive(${JSON.stringify(message)});`;
    if (this.loaded && this.nativeViewProtected) {
      evaluateScript(this.nativeViewProtected, script);
    } else {
      this.queue.push(script);
    }
  }

  _receive(json: string) {
    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch {
      return;
    }
    if (this.hasListeners(PlaybackSurface.messageEvent)) {
      this.notify({ eventName: PlaybackSurface.messageEvent, object: this, data } as any);
    } else {
      this.inbox.push(data);
    }
  }

  deliverPending() {
    const pending = this.inbox;
    this.inbox = [];
    for (const data of pending) {
      this.notify({ eventName: PlaybackSurface.messageEvent, object: this, data } as any);
    }
  }

  _pageLoaded() {
    this.loaded = true;
    const queued = this.queue;
    this.queue = [];
    for (const script of queued) {
      evaluateScript(this.nativeViewProtected, script);
    }
  }

  createNativeView() {
    return createNativeWebView(this);
  }

  initNativeView() {
    super.initNativeView();
    initNativeWebView(this, this.nativeViewProtected);
  }

  disposeNativeView() {
    this.loaded = false;
    this.queue = [];
    this.inbox = [];
    if (this.nativeViewProtected) {
      disposeNativeWebView(this.nativeViewProtected);
    }
    super.disposeNativeView();
  }
}
