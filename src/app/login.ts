import { Component, NO_ERRORS_SCHEMA, inject } from '@angular/core';
import type { LoadEventData, WebView } from '@nativescript/core';
import { CanvasView } from '../components/canvas-view';
import { Backend } from '../backend';
import { SpotifyAuth } from '../spotify/auth';
import { WebPlayer } from '../web-player/web-player';
import { embeddedAuthRequest, waitingForBrowser } from '../spotify/auth-flow';
import { aura } from '../ui/aura';
import { logoSvg } from '../ui/icons';
import { SafeArea } from '../ui/safe-area';

/** Signed-out screen; on Windows it also hosts the sign-in WebView. */
@Component({
  selector: 'app-login',
  imports: [CanvasView],
  schemas: [NO_ERRORS_SCHEMA],
  host: { class: 'relative flex flex-col overflow-hidden' },
  template: `
    <div class="absolute inset-0">
      <app-canvas-view [demo]="backdrop" class="h-full w-full" />
    </div>

    <div
      class="absolute inset-0 flex flex-col items-center justify-center gap-6 p-8"
      [style.padding-top]="insets().top + 32"
      [style.padding-bottom]="insets().bottom + 32"
      [style.padding-left]="insets().left + 32"
      [style.padding-right]="insets().right + 32"
    >
      <Svg [src]="logo" [style.width]="88" [style.height]="88"></Svg>
      <div class="flex flex-col items-center gap-2">
        <h1 class="text-4xl font-bold text-white">Soundport</h1>
        <p class="max-w-md text-center text-base text-white/75">
          Your Spotify, from every screen. Browse, search and control what plays on your phone,
          computer or speakers.
        </p>
      </div>

      @if (auth.status() === 'signing-in') {
        <div class="flex flex-col items-center gap-3">
          <span class="text-base text-white">
            {{ waiting() ? 'Finish signing in in your browser…' : 'Waiting for Spotify…' }}
          </span>
          <button class="btn bg-white/15 text-white active:bg-white/25" (tap)="auth.cancelSignIn()">
            Cancel
          </button>
        </div>
      } @else {
        <button class="btn bg-white px-8 text-slate-900 active:bg-white/80" (tap)="auth.signIn()">
          Connect Spotify
        </button>
        @if (webPlayer.supported) {
          <button class="btn bg-white/15 px-8 text-white active:bg-white/25" (tap)="backend.use('web-player')">
            {{ webPlayer.desktopBrowser ? 'Play in ' + webPlayer.desktopBrowser.name : 'Use the Spotify web player' }}
          </button>
        } @else if (desktop) {
          <p class="max-w-md text-center text-sm text-white/70">
            {{ webPlayer.onlyFirefox ? 'Firefox isn’t supported yet. ' : '' }}To play here with any Spotify
            account, install Google Chrome, Chromium or Microsoft Edge.
          </p>
        }
      }

      @if (auth.error()) {
        <p class="max-w-md rounded-2xl bg-rose-500/20 px-4 py-3 text-center text-sm text-rose-100">
          {{ auth.error() }}
        </p>
      }

      <p class="max-w-md text-center text-xs text-white/50">
        Playback control needs Spotify Premium. Sound comes from your Spotify Connect devices.
      </p>
    </div>

    @if (embedded(); as request) {
      <div
        class="absolute inset-0 flex flex-col bg-slate-950"
        [style.padding-top]="insets().top"
        [style.padding-bottom]="insets().bottom"
      >
        <div class="flex flex-row items-center gap-3 px-5 py-3">
          <span class="flex-1 text-lg font-bold text-white">Sign in to Spotify</span>
          <button class="btn bg-white/10 py-2 text-white active:bg-white/20" (tap)="request.cancel()">
            Cancel
          </button>
        </div>
        <div class="relative flex-1">
          <WebView
            class="absolute inset-0"
            [style.width]="'100%'"
            [style.height]="'100%'"
            [src]="request.url"
            (loadStarted)="onNavigate($event)"
            (loadFinished)="onNavigate($event)"
          ></WebView>
        </div>
      </div>
    }
  `,
})
export class Login {
  protected readonly auth = inject(SpotifyAuth);
  protected readonly backend = inject(Backend);
  protected readonly webPlayer = inject(WebPlayer);
  protected readonly desktop = __LINUX__ || __WINDOWS__;
  protected readonly insets = inject(SafeArea).insets;
  protected readonly embedded = embeddedAuthRequest;
  protected readonly waiting = waitingForBrowser;
  protected readonly logo = logoSvg(88);
  protected readonly backdrop = aura({ hue: 255, energy: 0.2 });

  /** Catches the redirect before the WebView tries to open it. */
  protected onNavigate(args: LoadEventData) {
    const request = this.embedded();
    const url = args.url ?? '';
    if (request && url.startsWith(request.redirectUri)) {
      (args.object as WebView).stopLoading();
      request.complete(url);
    }
  }
}
