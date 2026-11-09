import { Component, DestroyRef, NO_ERRORS_SCHEMA, computed, effect, inject, signal } from '@angular/core';
import { CanvasView } from '../components/canvas-view';
import { PlaybackHost } from '../playback/playback-host';
import { Cover } from '../components/cover';
import { Icon } from '../components/icon';
import { MusicApi } from '../music/music-api';
import { Backend } from '../backend';
import { SpotifyAuth } from '../spotify/auth';
import { WebPlayer } from '../web-player/web-player';
import { Player } from '../spotify/player';
import { imageUrl, type User } from '../spotify/types';
import { aura, type Aura } from '../ui/aura';
import { hslHex } from '../ui/color';
import { logoSvg, type IconName } from '../ui/icons';
import { SafeArea } from '../ui/safe-area';
import { Devices } from './devices';
import { Library } from './library';
import { MiniPlayer } from './mini-player';
import { NowPlaying } from './now-playing';
import { Search } from './search';
import { SearchState } from './search-state';

type Tab = 'now' | 'library' | 'search' | 'devices';

/** Signed-in shell: header, tabs, mini player and tab bar over a full-bleed aura. */
@Component({
  selector: 'app-player-home',
  imports: [CanvasView, PlaybackHost, Cover, Icon, Devices, Library, MiniPlayer, NowPlaying, Search],
  schemas: [NO_ERRORS_SCHEMA],
  host: { class: 'relative flex flex-col overflow-hidden' },
  template: `
    @if (backend.kind() === 'web-api') {
      <app-playback-host />
    }

    <div class="absolute inset-0">
      <app-canvas-view [demo]="auraDemo" class="h-full w-full" (started)="auraInstance.set($event)" />
    </div>

    <div
      class="absolute inset-0 flex flex-col"
      [style.padding-left]="insets().left"
      [style.padding-right]="insets().right"
    >
      <header class="flex flex-row items-center gap-3 px-5 pb-3" [style.padding-top]="insets().top + 12">
        <Svg [src]="logo()" [style.width]="30" [style.height]="30"></Svg>
        <span class="flex-1 text-lg font-bold text-white">{{ title() }}</span>
        @if (user(); as me) {
          <app-cover [src]="avatar()" [iconSize]="14" class="size-8 rounded-full" />
        }
        <div class="rounded-full p-2 active:bg-white/15" (tap)="signOut()">
          <app-icon name="signOut" [size]="20" color="#cbd5e1" />
        </div>
      </header>

      <div class="relative flex-1 overflow-hidden">
        @switch (tab()) {
          @case ('now') {
            <app-now-playing class="absolute inset-0" (openDevices)="tab.set('devices')" />
          }
          @case ('library') {
            <app-library class="absolute inset-0" />
          }
          @case ('search') {
            <app-search class="absolute inset-0" />
          }
          @case ('devices') {
            <app-devices class="absolute inset-0" />
          }
        }

        @if (player.error(); as message) {
          <div class="absolute bottom-3 left-3 right-3 flex flex-row items-center gap-3 rounded-2xl bg-rose-600 px-4 py-3">
            <span class="flex-1 text-sm text-white">{{ message }}</span>
            <div class="rounded-full p-1 active:bg-white/20" (tap)="player.dismissError()">
              <app-icon name="close" [size]="18" />
            </div>
          </div>
        }
      </div>

      @if (tab() !== 'now' && player.item()) {
        <app-mini-player (expand)="tab.set('now')" />
      }

      <nav
        class="flex flex-row border-t border-white/10 bg-slate-950/80 px-2 pt-1"
        [style.padding-bottom]="insets().bottom + 8"
      >
        @for (item of tabs; track item.id) {
          <div class="flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 active:bg-white/10" (tap)="tab.set(item.id)">
            <app-icon [name]="item.icon" [size]="24" [color]="tab() === item.id ? accent() : '#94a3b8'" />
            <span class="text-xs font-semibold" [style.color]="tab() === item.id ? accent() : '#94a3b8'">
              {{ item.label }}
            </span>
          </div>
        }
      </nav>
    </div>
  `,
})
export class PlayerHome {
  private readonly api = inject(MusicApi);
  private readonly auth = inject(SpotifyAuth);
  protected readonly player = inject(Player);
  protected readonly backend = inject(Backend);
  private readonly webPlayer = inject(WebPlayer);
  private readonly searchState = inject(SearchState);
  protected readonly insets = inject(SafeArea).insets;

  protected readonly auraDemo = aura({ hue: this.player.hue(), energy: 0 });
  protected readonly auraInstance = signal<Aura | null>(null);

  protected readonly tabs: { id: Tab; label: string; icon: IconName }[] = [
    { id: 'now', label: 'Now playing', icon: 'nowPlaying' },
    { id: 'library', label: 'Library', icon: 'library' },
    { id: 'search', label: 'Search', icon: 'search' },
    { id: 'devices', label: 'Devices', icon: 'devices' },
  ];
  protected readonly tab = signal<Tab>('now');
  protected readonly user = signal<User | null>(null);

  protected readonly accent = computed(() => hslHex(this.player.hue(), 0.85, 0.7));
  protected readonly logo = computed(() => logoSvg(30, this.player.hue()));
  protected readonly avatar = computed(() => imageUrl(this.user(), 64));
  protected readonly title = computed(
    () => this.tabs.find((t) => t.id === this.tab())?.label ?? 'Soundport',
  );

  constructor() {
    effect(() => {
      const instance = this.auraInstance();
      if (instance) {
        instance.setHue(this.player.hue());
        instance.setEnergy(this.player.isPlaying() ? 1 : 0);
        instance.setDim(this.tab() === 'now' ? 0 : 0.5);
      }
    });
    this.player.start();
    inject(DestroyRef).onDestroy(() => this.player.stop());
    this.api
      .me()
      .then((me) => this.user.set(me))
      .catch((error) => console.error('[me]', error));
  }

  protected signOut() {
    this.player.stop();
    this.searchState.clear();
    if (this.backend.kind() === 'web-player') {
      void this.webPlayer.signOut();
    } else {
      this.auth.signOut();
    }
  }
}
