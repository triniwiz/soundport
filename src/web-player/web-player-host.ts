import { Component, DestroyRef, NO_ERRORS_SCHEMA, computed, effect, inject, signal } from '@angular/core';
import type { EventData } from '@nativescript/core';
import { Backend } from '../backend';
import { SafeArea } from '../ui/safe-area';
import { DesktopWebPlayer, type DesktopPlayerStatus } from './desktop/desktop-web-player';
import { WebPlayer } from './web-player';
import type { WebPlayerSurface } from './web-player-surface';

const desktop = __LINUX__ || __WINDOWS__;

/**
 * Hosts the web player. Mobile: an embedded web view, 1 dp in the corner
 * normally and full screen while connecting, signing in, or when shown.
 * Desktop: an installed browser in its own window, with status shown here.
 */
@Component({
  selector: 'app-web-player-host',
  schemas: [NO_ERRORS_SCHEMA],
  host: { '[class]': "overlay() ? 'absolute inset-0 flex flex-col bg-slate-950' : 'absolute left-0 top-0'" },
  template: `
    @if (overlay()) {
      <div
        class="flex flex-row items-center gap-2 pb-3"
        [style.padding-top]="insets().top + 10"
        [style.padding-left]="insets().left + 16"
        [style.padding-right]="insets().right + 12"
      >
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-base font-bold text-white">{{ title() }}</span>
          <span class="truncate text-xs text-slate-400">Spotify web player</span>
        </div>
        @if (player.signedIn()) {
          <button class="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 active:bg-white/80" (tap)="player.visible.set(false)">
            Done
          </button>
        } @else {
          <button class="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white active:bg-white/20" (tap)="useOfficialApi()">
            Use official API
          </button>
        }
      </div>
    }

    @if (desktop) {
      @if (overlay()) {
        <div class="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <span class="text-center text-base text-white/80">{{ desktopMessage() }}</span>
          @switch (desktopStatus()) {
            @case ('connected') {
              <button class="btn bg-white text-slate-900 active:bg-white/80" (tap)="player.show()">
                Show {{ browserName }}
              </button>
            }
            @case ('closed') {
              <button class="btn bg-white text-slate-900 active:bg-white/80" (tap)="startDesktop()">Reopen</button>
            }
            @case ('error') {
              <button class="btn bg-white text-slate-900 active:bg-white/80" (tap)="startDesktop()">Try again</button>
            }
          }
        </div>
      }
    } @else {
      <div
        [class]="overlay() ? 'relative flex-1' : ''"
        [style.padding-bottom]="overlay() ? insets().bottom : 0"
      >
        <WebPlayerSurface
          [style.width]="overlay() ? '100%' : 1"
          [style.height]="overlay() ? '100%' : 1"
          (loaded)="onLoaded($event)"
        ></WebPlayerSurface>
        @if (overlay() && player.signedIn() === null) {
          <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950">
            <span class="text-base text-white/70">Connecting to Spotify…</span>
          </div>
        }
      </div>
    }
  `,
})
export class WebPlayerHost {
  private readonly backend = inject(Backend);
  protected readonly player = inject(WebPlayer);
  protected readonly insets = inject(SafeArea).insets;
  protected readonly desktop = desktop;
  protected readonly browserName = this.player.desktopBrowser?.name ?? 'the browser';
  protected readonly desktopStatus = signal<DesktopPlayerStatus>('idle');
  private readonly desktopError = signal<string | null>(null);
  private desktopPlayer: DesktopWebPlayer | null = null;
  private detach: (() => void) | null = null;
  private loginOpened = false;

  /** Mobile: also while the user asked to see the player. Desktop: until signed in. */
  protected readonly overlay = computed(() =>
    desktop ? this.player.signedIn() !== true || this.desktopStatus() !== 'connected' : this.player.signedIn() !== true || this.player.visible(),
  );
  protected readonly title = computed(() =>
    this.player.signedIn() === false ? 'Sign in to Spotify' : this.player.signedIn() ? 'Web player' : 'Connecting…',
  );
  protected readonly desktopMessage = computed(() => {
    switch (this.desktopStatus()) {
      case 'idle':
      case 'launching':
        return `Opening Spotify in ${this.browserName}…`;
      case 'closed':
        return `The ${this.browserName} window was closed. Reopen it to keep playing here.`;
      case 'error':
        return this.desktopError() ?? `Couldn't start ${this.browserName}.`;
      default:
        return this.player.signedIn() === false
          ? `Sign in to Spotify in the ${this.browserName} window.`
          : 'Connecting to Spotify…';
    }
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.detach?.();
      this.detach = null;
      this.desktopPlayer?.off(DesktopWebPlayer.statusEvent);
    });
    effect(() => {
      const signedIn = this.player.signedIn();
      if (signedIn === false && !this.loginOpened) {
        this.loginOpened = true;
        this.player.signIn();
      } else if (signedIn) {
        this.loginOpened = false;
      }
    });
    if (desktop) {
      this.startDesktop();
    }
  }

  protected startDesktop() {
    const browser = this.player.desktopBrowser;
    if (!browser) {
      return;
    }
    if (!this.desktopPlayer) {
      const desktopPlayer = new DesktopWebPlayer(browser);
      desktopPlayer.on(DesktopWebPlayer.statusEvent, () => {
        this.desktopStatus.set(desktopPlayer.status);
        this.desktopError.set(desktopPlayer.error);
      });
      this.desktopPlayer = desktopPlayer;
      this.detach = this.player.attach(desktopPlayer);
    }
    this.loginOpened = false;
    void this.desktopPlayer.start();
  }

  protected onLoaded(args: EventData) {
    if (!this.detach) {
      this.detach = this.player.attach(args.object as WebPlayerSurface);
    }
  }

  protected useOfficialApi() {
    this.desktopPlayer?.close();
    this.backend.use('web-api');
  }
}
