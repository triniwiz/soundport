import { Component, NO_ERRORS_SCHEMA, computed, inject, output, signal } from '@angular/core';
import { Screen } from '@nativescript/core';
import { Cover } from '../components/cover';
import { Icon } from '../components/icon';
import { Slider } from '../components/slider';
import { Player } from '../spotify/player';
import { imageUrl, subtitleOf } from '../spotify/types';
import { hslHex } from '../ui/color';
import { formatTime } from '../ui/format';
import { deviceIcon } from '../ui/icons';

@Component({
  selector: 'app-now-playing',
  imports: [Cover, Icon, Slider],
  schemas: [NO_ERRORS_SCHEMA],
  host: { class: 'relative flex flex-col overflow-hidden' },
  template: `
    <Scroll class="absolute inset-0">
      <div class="mx-auto flex flex-col items-center gap-5 px-6 py-6" [style.width]="columnWidth">
        @if (player.item(); as item) {
          <app-cover
            [src]="art()"
            [iconSize]="72"
            class="rounded-3xl"
            [style.width]="artSize"
            [style.height]="artSize"
          />

          <div class="flex flex-row items-center gap-3" [style.width]="rowWidth">
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <span class="truncate text-2xl font-bold text-white">{{ item.name }}</span>
              <span class="truncate text-base text-white/70">{{ subtitle() }}</span>
            </div>
            @if (item.type === 'track') {
              <div class="rounded-full p-2 active:bg-white/15" (tap)="player.toggleLike()">
                <app-icon
                  [name]="player.liked() ? 'heartFilled' : 'heart'"
                  [size]="28"
                  [color]="player.liked() ? accent() : '#e2e8f0'"
                />
              </div>
            }
          </div>

          <div class="flex flex-col" [style.width]="rowWidth">
            <app-slider
              class="w-full"
              [value]="progressFraction()"
              [hue]="player.hue()"
              [enabled]="!player.disallows()['seeking']"
              (scrub)="scrubbing.set($event)"
              (commit)="seek($event)"
            />
            <div class="flex flex-row justify-between px-2">
              <span class="text-xs text-white/60">{{ elapsed() }}</span>
              <span class="text-xs text-white/60">{{ remaining() }}</span>
            </div>
          </div>

          <div class="flex flex-row items-center justify-between px-2" [style.width]="rowWidth">
            <div class="rounded-full p-3 active:bg-white/15" (tap)="player.toggleShuffle()">
              <app-icon name="shuffle" [size]="22" [color]="shuffleColor()" />
            </div>
            <div class="rounded-full p-3 active:bg-white/15" (tap)="player.previous()">
              <app-icon name="previous" [size]="30" />
            </div>
            <div
              class="flex size-[72] items-center justify-center rounded-full bg-white active:bg-white/80"
              (tap)="player.togglePlay()"
            >
              <app-icon [name]="player.isPlaying() ? 'pause' : 'play'" [size]="34" color="#0b1020" />
            </div>
            <div class="rounded-full p-3 active:bg-white/15" (tap)="player.next()">
              <app-icon name="next" [size]="30" />
            </div>
            <div class="rounded-full p-3 active:bg-white/15" (tap)="player.cycleRepeat()">
              <app-icon
                [name]="player.state()?.repeat_state === 'track' ? 'repeatOne' : 'repeat'"
                [size]="22"
                [color]="repeatColor()"
              />
            </div>
          </div>

          @if (player.device(); as device) {
            <div class="flex flex-col gap-2 rounded-2xl bg-black/25 px-4 py-3" [style.width]="rowWidth">
              <div class="flex flex-row items-center gap-3" (tap)="openDevices.emit()">
                <app-icon [name]="deviceIcon(device.type)" [size]="20" [color]="accent()" />
                <span class="flex-1 truncate text-sm font-semibold" [style.color]="accent()">
                  {{ player.isLocal() ? 'Playing on this device' : 'Playing on ' + device.name }}
                </span>
                <app-icon name="devices" [size]="20" color="#cbd5e1" />
              </div>
              @if (device.supports_volume) {
                <div class="flex flex-row items-center gap-2">
                  <app-icon
                    [name]="(device.volume_percent ?? 0) === 0 ? 'volumeOff' : 'volume'"
                    [size]="20"
                    color="#cbd5e1"
                  />
                  <app-slider
                    class="flex-1"
                    [value]="(device.volume_percent ?? 0) / 100"
                    [hue]="player.hue()"
                    [height]="24"
                    (scrub)="player.setVolume($event * 100)"
                    (commit)="player.setVolume($event * 100)"
                  />
                </div>
              }
            </div>
          }
        } @else if (player.pollError(); as problem) {
          <div class="flex flex-col items-center gap-4 py-16" [style.width]="rowWidth">
            <app-icon name="close" [size]="56" color="#fda4af" />
            <span class="text-2xl font-bold text-white">Spotify isn’t answering</span>
            <p class="text-center text-base text-white/75">{{ problem }}</p>
            <button class="btn bg-white/15 text-white active:bg-white/25" (tap)="player.refresh()">
              Try again
            </button>
          </div>
        } @else if (player.ready()) {
          <div class="flex flex-col items-center gap-4 py-16" [style.width]="rowWidth">
            <app-icon name="nowPlaying" [size]="64" color="#94a3b8" />
            <span class="text-2xl font-bold text-white">Nothing playing</span>
            <p class="text-center text-base text-white/70">
              Pick something from your library or search to play it here, or choose another
              Spotify device.
            </p>
            <div class="flex flex-row flex-wrap justify-center gap-3">
              <button class="btn bg-white text-slate-900 active:bg-white/80" (tap)="player.togglePlay()">
                Resume last session
              </button>
              <button class="btn bg-white/15 text-white active:bg-white/25" (tap)="openDevices.emit()">
                Choose a device
              </button>
            </div>
          </div>
        } @else {
          <div class="flex flex-col items-center py-24" [style.width]="rowWidth">
            <span class="w-full text-center text-base text-white/60">Connecting to Spotify…</span>
          </div>
        }
      </div>
    </Scroll>
  `,
})
export class NowPlaying {
  protected readonly player = inject(Player);
  readonly openDevices = output<void>();

  protected readonly deviceIcon = deviceIcon;
  /** Seek position while dragging (0–1). */
  protected readonly scrubbing = signal<number | null>(null);

  protected readonly art = computed(() => imageUrl(this.player.item(), 640));
  protected readonly columnWidth = Math.round(Math.min(Screen.mainScreen.widthDIPs, 520));
  protected readonly artSize = Math.min(380, this.columnWidth - 48);
  /** Explicit widths: percentage widths don't resolve inside the scroll view. */
  protected readonly rowWidth = this.columnWidth - 48;
  protected readonly subtitle = computed(() => subtitleOf(this.player.item()));
  protected readonly accent = computed(() => hslHex(this.player.hue(), 0.85, 0.7));
  protected readonly shuffleColor = computed(() =>
    this.player.state()?.shuffle_state ? this.accent() : '#cbd5e1',
  );
  protected readonly repeatColor = computed(() =>
    (this.player.state()?.repeat_state ?? 'off') !== 'off' ? this.accent() : '#cbd5e1',
  );

  private readonly shownProgress = computed(() => {
    const scrub = this.scrubbing();
    return scrub === null ? this.player.progress() : scrub * this.player.duration();
  });
  protected readonly progressFraction = computed(() =>
    this.player.duration() ? this.player.progress() / this.player.duration() : 0,
  );
  protected readonly elapsed = computed(() => formatTime(this.shownProgress()));
  protected readonly remaining = computed(
    () => `-${formatTime(this.player.duration() - this.shownProgress())}`,
  );

  protected seek(fraction: number) {
    this.scrubbing.set(null);
    void this.player.seek(fraction * this.player.duration());
  }
}
