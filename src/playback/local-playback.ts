import { Injectable, computed, inject, signal } from '@angular/core';
import { Device } from '@nativescript/core';
import { SpotifyAuth, messageOf } from '../spotify/auth';
import { supportsWebPlayback } from './native-web-view';
import type { PlaybackSurface } from './playback-surface';

/** `needs-reauth`: the session lacks the `streaming` scope; `no-drm`: the web view has no EME key system. */
export type LocalStatus = 'unsupported' | 'idle' | 'needs-reauth' | 'starting' | 'ready' | 'no-drm' | 'error';

export interface LocalState {
  paused: boolean;
  position: number;
  duration: number;
  shuffle: boolean;
  repeatMode: 0 | 1 | 2;
  timestamp: number;
  trackUri: string | null;
}

type PageMessage =
  | { type: 'boot'; keySystems: string[]; secure: boolean; userAgent: string }
  | { type: 'token-request' }
  | { type: 'connected'; ok: boolean }
  | { type: 'ready'; deviceId: string }
  | { type: 'not-ready'; deviceId: string }
  | { type: 'state'; state: LocalState | null }
  | { type: 'error'; kind: string; message?: string }
  | { type: 'log'; level: string; message: string };

export type LocalCommand = 'togglePlay' | 'resume' | 'pause' | 'seek' | 'setVolume' | 'nextTrack' | 'previousTrack';

const INITIAL_VOLUME = 0.8;

/** This device as a Spotify Connect device, via the Web Playback SDK in a hidden web view. */
@Injectable({ providedIn: 'root' })
export class LocalPlayback {
  private readonly auth = inject(SpotifyAuth);

  readonly supported = supportsWebPlayback;
  readonly deviceName = `Soundport (${Device.os})`;

  readonly status = signal<LocalStatus>(supportsWebPlayback ? 'idle' : 'unsupported');
  readonly deviceId = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  /** DRM key systems the web view offers. */
  readonly keySystems = signal<string[] | null>(null);
  readonly state = signal<LocalState | null>(null);
  /** Bumped on every SDK state change. */
  readonly stateVersion = signal(0);
  readonly ready = computed(() => this.status() === 'ready' && !!this.deviceId());

  private surface: PlaybackSurface | null = null;
  private readonly onMessage = (args: any) => this.handle(args.data as PageMessage);

  /** Returns the teardown. */
  attach(surface: PlaybackSurface): () => void {
    this.detach();
    this.surface = surface;
    this.error.set(null);
    this.deviceId.set(null);
    this.state.set(null);
    this.status.set('starting');
    surface.on(PlaybackSurface_messageEvent, this.onMessage);
    surface.deliverPending();
    return () => this.detach();
  }

  restart() {
    if (!this.surface || !this.auth.hasScope('streaming')) {
      return;
    }
    this.error.set(null);
    this.deviceId.set(null);
    this.status.set('starting');
    this.surface.post({ type: 'disconnect' });
    this.surface.post({ type: 'init', name: this.deviceName, volume: INITIAL_VOLUME });
  }

  command(name: LocalCommand, ...args: unknown[]) {
    this.surface?.post({ type: 'command', name, args });
  }

  private detach() {
    if (!this.surface) {
      return;
    }
    this.surface.post({ type: 'disconnect' });
    this.surface.off(PlaybackSurface_messageEvent, this.onMessage);
    this.surface = null;
    this.deviceId.set(null);
    this.state.set(null);
    if (this.supported) {
      this.status.set('idle');
    }
  }

  private handle(message: PageMessage) {
    switch (message.type) {
      case 'boot':
        this.keySystems.set(message.keySystems);
        console.log('[playback] web view DRM:', message.keySystems.join(', ') || 'none', '| secure:', message.secure);
        if (!message.keySystems.length) {
          this.status.set('no-drm');
          this.error.set(
            'This system’s web view can’t decrypt Spotify’s protected audio (no DRM key system), so Soundport works as a remote here.',
          );
          return;
        }
        if (!this.auth.hasScope('streaming')) {
          this.status.set('needs-reauth');
          this.error.set('Sign in again to let Soundport play on this device.');
          return;
        }
        this.surface?.post({ type: 'init', name: this.deviceName, volume: INITIAL_VOLUME });
        break;

      case 'token-request':
        this.auth
          .accessToken()
          .then((token) => this.surface?.post({ type: 'token', token }))
          .catch((error) => this.fail(messageOf(error)));
        break;

      case 'connected':
        if (!message.ok) {
          this.fail('Spotify refused to connect this device.');
        }
        break;

      case 'ready':
        this.deviceId.set(message.deviceId);
        this.status.set('ready');
        this.error.set(null);
        break;

      case 'not-ready':
        this.deviceId.set(null);
        if (this.status() === 'ready') {
          this.status.set('starting');
        }
        break;

      case 'state':
        this.state.set(message.state);
        this.stateVersion.update((v) => v + 1);
        break;

      case 'error':
        console.error('[playback]', message.kind, message.message);
        switch (message.kind) {
          case 'authentication_error':
            this.status.set('needs-reauth');
            this.error.set('Sign in again to let Soundport play on this device.');
            break;
          case 'account_error':
            this.fail('Playing in Soundport needs Spotify Premium.');
            break;
          case 'initialization_error':
          case 'load':
            this.fail(message.message ?? 'The Spotify player could not start in this web view.');
            break;
          default:
            // Not fatal.
            this.error.set(message.message ?? message.kind);
        }
        break;

      case 'log':
        console.log('[playback page]', message.level, message.message);
        break;
    }
  }

  private fail(message: string) {
    this.status.set('error');
    this.error.set(message);
  }
}

/** PlaybackSurface.messageEvent, without importing the view here. */
const PlaybackSurface_messageEvent = 'message';
