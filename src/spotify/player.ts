import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Application } from '@nativescript/core';
import { LocalPlayback, type LocalCommand } from '../playback/local-playback';
import { MusicApi } from '../music/music-api';
import { WebPlayer } from '../web-player/web-player';
import { SpotifyApiError } from './api';
import { messageOf } from './auth';
import type { Device, PlaybackState, RepeatState } from './types';

const POLL_PLAYING_MS = 3000;
const POLL_IDLE_MS = 6000;
/** Delay before resyncing after a command, which takes a moment to show up. */
const SETTLE_MS = 450;
const ERROR_TIMEOUT_MS = 7000;

/** Playback state (polled, with progress interpolated between polls) and the commands that drive it. */
@Injectable({ providedIn: 'root' })
export class Player {
  private readonly api = inject(MusicApi);
  private readonly webPlayer = inject(WebPlayer);
  /** This device as a Connect device (Web Playback SDK), when available. */
  readonly local = inject(LocalPlayback);

  readonly state = signal<PlaybackState | null>(null);
  readonly devices = signal<Device[]>([]);
  readonly error = signal<string | null>(null);
  /** Why the last poll failed, until one succeeds. */
  readonly pollError = signal<string | null>(null);
  /** The first poll has finished. */
  readonly ready = signal(false);
  readonly liked = signal(false);

  private readonly fetchedAt = signal(Date.now());
  private readonly now = signal(Date.now());

  readonly item = computed(() => this.state()?.item ?? null);
  readonly isPlaying = computed(() => this.state()?.is_playing ?? false);
  readonly device = computed(() => this.state()?.device ?? null);
  readonly duration = computed(() => this.item()?.duration_ms ?? 0);
  readonly progress = computed(() => {
    const state = this.state();
    if (!state) {
      return 0;
    }
    const base = state.progress_ms ?? 0;
    const elapsed = state.is_playing ? Math.max(0, this.now() - this.fetchedAt()) : 0;
    return Math.min(base + elapsed, this.duration() || Infinity);
  });
  /** Hue (0–360) derived from the current item, used to tint the UI. */
  readonly hue = computed(() => hueFor(this.item()?.id ?? this.state()?.context?.uri ?? ''));
  readonly disallows = computed(() => this.state()?.actions?.disallows ?? {});
  /** Playback is on this device, through the Web Playback SDK. */
  readonly isLocal = computed(() => {
    const id = this.local.deviceId();
    return !!id && this.device()?.id === id;
  });

  private running = false;
  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private tickTimer: ReturnType<typeof setInterval> | undefined;
  private errorTimer: ReturnType<typeof setTimeout> | undefined;
  private volumeTimer: ReturnType<typeof setTimeout> | undefined;
  private likedFor: string | null = null;
  /** Ignore polls that started before the latest command. */
  private generation = 0;

  constructor() {
    // Local players report changes instantly: resync now rather than at the next poll.
    effect(() => {
      this.local.stateVersion();
      this.webPlayer.state();
      untracked(() => {
        if (this.running && this.tickTimer !== undefined) {
          this.refreshSoon(200);
        }
      });
    });
  }

  private readonly onSuspend = () => this.pause();
  private readonly onResume = () => {
    if (this.running) {
      this.resume();
    }
  };

  /** Starts polling (idempotent). */
  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    Application.on(Application.suspendEvent, this.onSuspend);
    Application.on(Application.resumeEvent, this.onResume);
    this.resume();
  }

  /** Stops polling and forgets the state. */
  stop() {
    this.running = false;
    Application.off(Application.suspendEvent, this.onSuspend);
    Application.off(Application.resumeEvent, this.onResume);
    this.pause();
    this.state.set(null);
    this.devices.set([]);
    this.ready.set(false);
    this.likedFor = null;
  }

  dismissError() {
    clearTimeout(this.errorTimer);
    this.error.set(null);
  }

  // -- Polling ---------------------------------------------------------------

  private resume() {
    this.pause();
    this.tickTimer = setInterval(() => {
      if (this.state()?.is_playing) {
        this.now.set(Date.now());
        // The track ended between polls: catch up now.
        if (this.duration() && this.progress() >= this.duration()) {
          this.refreshSoon(300);
        }
      }
    }, 250);
    void this.refresh();
    void this.refreshDevices();
  }

  private pause() {
    clearTimeout(this.pollTimer);
    clearInterval(this.tickTimer);
    this.pollTimer = undefined;
    this.tickTimer = undefined;
  }

  async refresh(): Promise<void> {
    clearTimeout(this.pollTimer);
    const generation = this.generation;
    try {
      const state = await this.api.playbackState();
      if (generation === this.generation) {
        this.apply(state);
      }
      this.pollError.set(null);
    } catch (error) {
      console.error('[player] poll', error);
      this.pollError.set(messageOf(error));
    } finally {
      this.ready.set(true);
      if (this.running && this.tickTimer !== undefined) {
        this.pollTimer = setTimeout(
          () => void this.refresh(),
          this.isPlaying() ? POLL_PLAYING_MS : POLL_IDLE_MS,
        );
      }
    }
  }

  async refreshDevices(): Promise<Device[]> {
    try {
      const devices = await this.api.devices();
      this.devices.set(devices);
      return devices;
    } catch (error) {
      console.error('[player] devices', error);
      return this.devices();
    }
  }

  private refreshSoon(delay = SETTLE_MS) {
    clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => void this.refresh(), delay);
  }

  private apply(state: PlaybackState | null) {
    this.fetchedAt.set(Date.now());
    this.now.set(Date.now());
    this.state.set(state);
    const uri = state?.item?.uri ?? null;
    if (uri !== this.likedFor) {
      this.likedFor = uri;
      this.liked.set(false);
      if (uri && state?.item?.type === 'track') {
        this.api
          .libraryContains([uri])
          .then(([saved]) => {
            if (this.likedFor === uri) {
              this.liked.set(!!saved);
            }
          })
          .catch(() => {});
      }
    }
  }

  /** Optimistic update. */
  private patch(change: (state: PlaybackState) => PlaybackState) {
    const state = this.state();
    if (!state) {
      return;
    }
    this.generation++;
    // Re-base progress so interpolation continues from now.
    const rebased = { ...state, progress_ms: this.progress() };
    this.fetchedAt.set(Date.now());
    this.now.set(Date.now());
    this.state.set(change(rebased));
  }

  // -- Commands --------------------------------------------------------------

  async togglePlay() {
    const state = this.state();
    if (!state) {
      return this.run(() => this.startOnSomeDevice());
    }
    const playing = state.is_playing;
    this.patch((s) => ({ ...s, is_playing: !playing }));
    await this.run(
      () => this.viaLocal(playing ? 'pause' : 'resume') ?? (playing ? this.api.pause() : this.api.resume()),
      () => this.patch((s) => ({ ...s, is_playing: playing })),
    );
  }

  next() {
    this.generation++;
    return this.run(() => this.viaLocal('nextTrack') ?? this.api.next());
  }

  previous() {
    this.generation++;
    // Past the first few seconds, "previous" restarts the track.
    if (this.progress() > 3000) {
      return this.seek(0);
    }
    return this.run(() => this.viaLocal('previousTrack') ?? this.api.previous());
  }

  seek(positionMs: number) {
    this.patch((s) => ({ ...s, progress_ms: positionMs }));
    return this.run(() => this.viaLocal('seek', Math.round(positionMs)) ?? this.api.seek(positionMs));
  }

  /** Volume 0–100; rapid changes are coalesced. */
  setVolume(percent: number) {
    const volume = Math.round(percent);
    this.patch((s) => ({ ...s, device: { ...s.device, volume_percent: volume } }));
    clearTimeout(this.volumeTimer);
    this.volumeTimer = setTimeout(
      () => void this.run(() => this.viaLocal('setVolume', volume / 100) ?? this.api.volume(volume)),
      180,
    );
  }

  toggleShuffle() {
    const next = !this.state()?.shuffle_state;
    this.patch((s) => ({ ...s, shuffle_state: next }));
    return this.run(() => this.api.shuffle(next));
  }

  cycleRepeat() {
    const order: RepeatState[] = ['off', 'context', 'track'];
    const current = this.state()?.repeat_state ?? 'off';
    const next = order[(order.indexOf(current) + 1) % order.length];
    this.patch((s) => ({ ...s, repeat_state: next }));
    return this.run(() => this.api.repeat(next));
  }

  async toggleLike() {
    const uri = this.item()?.uri;
    if (!uri) {
      return;
    }
    const liked = this.liked();
    this.liked.set(!liked);
    await this.run(
      () => (liked ? this.api.removeFromLibrary([uri]) : this.api.saveToLibrary([uri])),
      () => this.liked.set(liked),
      false,
    );
  }

  playContext(contextUri: string, startUri?: string) {
    return this.run(async () => {
      const deviceId = await this.targetDevice();
      await this.api.play({ deviceId, contextUri, offset: startUri ? { uri: startUri } : undefined });
    });
  }

  playUris(uris: string[], index = 0) {
    return this.run(async () => {
      const deviceId = await this.targetDevice();
      await this.api.play({ deviceId, uris, offset: { position: index } });
    });
  }

  addToQueue(uri: string) {
    return this.run(() => this.api.addToQueue(uri), undefined, false);
  }

  transfer(deviceId: string) {
    this.generation++;
    this.devices.update((devices) => devices.map((d) => ({ ...d, is_active: d.id === deviceId })));
    return this.run(async () => {
      await this.api.transfer(deviceId, this.isPlaying() || undefined);
      setTimeout(() => void this.refreshDevices(), 800);
    });
  }

  /** undefined when a device is active; otherwise the best available device to start on. */
  private async targetDevice(): Promise<string | undefined> {
    if (this.state()?.device?.is_active) {
      return undefined;
    }
    const devices = await this.refreshDevices();
    if (devices.some((d) => d.is_active)) {
      return undefined;
    }
    if (this.local.ready()) {
      return this.local.deviceId()!;
    }
    const rank = (d: Device) => ['Computer', 'Smartphone', 'Tablet', 'Speaker'].indexOf(d.type) >>> 0;
    const candidate = devices.filter((d) => d.id && !d.is_restricted).sort((a, b) => rank(a) - rank(b))[0];
    if (!candidate) {
      throw new SpotifyApiError(
        404,
        'No Spotify devices are available. Open Spotify on a phone, computer or speaker, then try again.',
        'NO_ACTIVE_DEVICE',
      );
    }
    return candidate.id!;
  }

  private async startOnSomeDevice() {
    const deviceId = await this.targetDevice();
    if (deviceId) {
      await this.api.transfer(deviceId, true);
    } else {
      await this.api.resume();
    }
  }

  /** Moves playback to this device's Web Playback SDK player. */
  playHere() {
    const id = this.local.deviceId();
    if (!id) {
      return Promise.resolve();
    }
    this.generation++;
    return this.run(() => this.api.transfer(id, true));
  }

  /** Sends `command` to the local SDK player when it is active; undefined otherwise. */
  private viaLocal(command: LocalCommand, ...args: unknown[]): Promise<void> | undefined {
    if (!this.isLocal()) {
      return undefined;
    }
    this.local.command(command, ...args);
    return Promise.resolve();
  }

  private async run(command: () => Promise<unknown>, revert?: () => void, refresh = true) {
    try {
      await command();
      if (this.error()) {
        this.dismissError();
      }
    } catch (error) {
      console.error('[player]', error);
      revert?.();
      this.showError(messageOf(error));
    } finally {
      if (refresh) {
        this.refreshSoon();
      }
    }
  }

  private showError(message: string) {
    clearTimeout(this.errorTimer);
    this.error.set(message);
    this.errorTimer = setTimeout(() => this.error.set(null), ERROR_TIMEOUT_MS);
  }
}

function hueFor(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  }
  return (hash >>> 0) % 360;
}
