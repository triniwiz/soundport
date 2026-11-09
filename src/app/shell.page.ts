import { Component, DestroyRef, NO_ERRORS_SCHEMA, inject, signal } from '@angular/core';
import { Page } from '@nativescript/core';
import { Backend } from '../backend';
import { SpotifyAuth } from '../spotify/auth';
import { SafeArea } from '../ui/safe-area';
import { Login } from './login';
import { PlayerHome } from './player-home';
import { WebPlayer } from '../web-player/web-player';
import { WebPlayerHost } from '../web-player/web-player-host';

/**
 * The only routed page. Gives its content a definite height (nested `flex-1`
 * needs one) and draws edge to edge; screens pad with `SafeArea.insets`.
 */
@Component({
  selector: 'app-shell-page',
  imports: [Login, PlayerHome, WebPlayerHost],
  schemas: [NO_ERRORS_SCHEMA],
  template: `
    <main class="relative flex w-full flex-col" [iosOverflowSafeArea]="true" [style.height]="height() || undefined">
      @if (backend.kind() === 'web-player') {
        @if (webPlayer.signedIn() && !webPlayer.visible()) {
          <app-player-home class="flex-1" />
        } @else {
          <div class="flex-1"></div>
        }
        <app-web-player-host />
      } @else if (auth.status() === 'signed-in') {
        <app-player-home class="flex-1" />
      } @else {
        <app-login class="flex-1" />
      }
    </main>
  `,
})
export class ShellPage {
  protected readonly auth = inject(SpotifyAuth);
  protected readonly backend = inject(Backend);
  protected readonly webPlayer = inject(WebPlayer);
  protected readonly height = signal(0);

  constructor() {
    const page = inject(Page);
    page.actionBarHidden = true;
    page.statusBarStyle = 'light';

    const detach = inject(SafeArea).attach(page);
    const onLayout = () => this.height.set(page.getActualSize().height);
    page.on('layoutChanged', onLayout);
    inject(DestroyRef).onDestroy(() => {
      detach();
      page.off('layoutChanged', onLayout);
    });
  }
}
