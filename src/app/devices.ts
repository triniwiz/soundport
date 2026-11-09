import { Component, DestroyRef, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { Icon } from '../components/icon';
import { Backend } from '../backend';
import { LocalPlayback } from '../playback/local-playback';
import { WebPlayer } from '../web-player/web-player';
import { WEB_PLAYER_DEVICE_ID } from '../web-player/web-player-api';
import { SpotifyAuth } from '../spotify/auth';
import { Player } from '../spotify/player';
import { hslHex } from '../ui/color';
import { deviceIcon } from '../ui/icons';

const REFRESH_MS = 8000;

@Component({
  selector: 'app-devices',
  imports: [Icon],
  schemas: [NO_ERRORS_SCHEMA],
  host: { class: 'flex flex-col' },
  template: `
    <div class="relative flex-1">
    <Scroll class="absolute inset-0">
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-8 pt-2">
        <div class="flex flex-row items-center gap-3 px-1">
          <div class="flex flex-1 flex-col">
            <span class="text-xl font-bold text-white">Connect to a device</span>
            <span class="text-sm text-slate-400">Play here, or send playback to another Spotify device.</span>
          </div>
          <div class="rounded-full p-2 active:bg-white/15" (tap)="refresh()">
            <app-icon name="refresh" [size]="22" [color]="refreshing() ? '#64748b' : '#e2e8f0'" />
          </div>
        </div>

        <div class="flex flex-col gap-3 rounded-2xl px-4 py-4" [class]="here() ? 'bg-white/15' : 'bg-white/5'">
          <div class="flex flex-row items-center gap-4">
            <app-icon name="smartphone" [size]="28" [color]="here() ? accent() : '#e2e8f0'" />
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-base font-semibold" [style.color]="here() ? accent() : '#ffffff'">
                This device
              </span>
              <span class="text-sm text-slate-400">{{ localSummary() }}</span>
            </div>
            @if (backend.kind() === 'web-player') {
              <button class="btn bg-white/15 py-2 text-white active:bg-white/25" (tap)="webPlayer.show()">
                Show
              </button>
            } @else {
            @switch (local.status()) {
              @case ('ready') {
                @if (!player.isLocal()) {
                  <button class="btn bg-white py-2 text-slate-900 active:bg-white/80" (tap)="player.playHere()">
                    Play here
                  </button>
                }
              }
              @case ('needs-reauth') {
                <button class="btn bg-white py-2 text-slate-900 active:bg-white/80" (tap)="auth.signIn()">
                  Sign in again
                </button>
              }
              @case ('error') {
                <button class="btn bg-white/15 py-2 text-white active:bg-white/25" (tap)="local.restart()">
                  Retry
                </button>
              }
            }
            }
          </div>
          @if (backend.kind() === 'web-api' && local.error() && local.status() !== 'ready') {
            <p class="text-sm text-slate-400">{{ local.error() }}</p>
          }
        </div>

        <div class="flex flex-col gap-2">
          @for (device of otherDevices(); track device.id ?? device.name) {
            <div
              class="flex flex-row items-center gap-4 rounded-2xl px-4 py-3"
              [class]="device.is_active ? 'bg-white/15' : 'bg-white/5 active:bg-white/10'"
              (tap)="select(device.id, device.is_restricted)"
            >
              <app-icon [name]="icon(device.type)" [size]="28" [color]="device.is_active ? accent() : '#e2e8f0'" />
              <div class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-base font-semibold" [style.color]="device.is_active ? accent() : '#ffffff'">
                  {{ device.name }}
                </span>
                <span class="text-sm text-slate-400">
                  {{ device.is_active ? 'Playing here · ' : '' }}{{ device.type }}{{
                    device.is_restricted ? ' · Can’t be controlled' : ''
                  }}{{ device.is_private_session ? ' · Private session' : '' }}
                </span>
              </div>
              @if (device.supports_volume && device.volume_percent !== null) {
                <span class="text-sm text-slate-400">{{ device.volume_percent }}%</span>
              }
            </div>
          } @empty {
            <div class="flex flex-col gap-2 rounded-2xl bg-white/5 p-5">
              <span class="text-base font-semibold text-white">No other devices</span>
              <p class="text-sm text-slate-400">
                Open Spotify on your phone, computer, TV or speaker, signed in to the same
                account, and it will show up here.
              </p>
            </div>
          }
        </div>
      </div>
    </Scroll>
    </div>
  `,
})
export class Devices {
  protected readonly player = inject(Player);
  protected readonly local = inject(LocalPlayback);
  protected readonly auth = inject(SpotifyAuth);
  protected readonly backend = inject(Backend);
  protected readonly webPlayer = inject(WebPlayer);

  /** Playback is on this device. */
  protected readonly here = computed(() => this.backend.kind() === 'web-player' || this.player.isLocal());

  /** Excludes this device, which has its own card. */
  protected readonly otherDevices = computed(() =>
    this.player
      .devices()
      .filter((device) => !device.id || (device.id !== this.local.deviceId() && device.id !== WEB_PLAYER_DEVICE_ID)),
  );

  protected readonly localSummary = computed(() => {
    if (this.backend.kind() === 'web-player') {
      return 'Spotify web player · playing here';
    }
    switch (this.local.status()) {
      case 'ready':
        return this.player.isLocal() ? 'Playing here' : `Ready as “${this.local.deviceName}”`;
      case 'starting':
      case 'idle':
        return 'Starting the Spotify player…';
      case 'needs-reauth':
        return 'Needs permission to stream';
      case 'no-drm':
        return 'Can’t play protected audio here';
      case 'unsupported':
        return 'Remote only on this platform';
      case 'error':
        return 'The player stopped';
    }
  });
  protected readonly refreshing = signal(false);
  protected readonly icon = deviceIcon;
  protected readonly accent = computed(() => hslHex(this.player.hue(), 0.85, 0.7));

  constructor() {
    void this.refresh();
    const timer = setInterval(() => void this.player.refreshDevices(), REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected async refresh() {
    this.refreshing.set(true);
    try {
      await this.player.refreshDevices();
    } finally {
      this.refreshing.set(false);
    }
  }

  protected select(id: string | null, restricted: boolean) {
    if (id && !restricted) {
      void this.player.transfer(id);
    }
  }
}
