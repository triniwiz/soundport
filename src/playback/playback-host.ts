import { Component, DestroyRef, NO_ERRORS_SCHEMA, inject } from '@angular/core';
import type { EventData } from '@nativescript/core';
import { LocalPlayback } from './local-playback';
import type { PlaybackSurface } from './playback-surface';

/** Hosts the hidden PlaybackSurface (1 dp, nearly transparent) while signed in. */
@Component({
  selector: 'app-playback-host',
  schemas: [NO_ERRORS_SCHEMA],
  host: { class: 'absolute left-0 top-0' },
  template: `
    @if (local.supported) {
      <PlaybackSurface
        [style.width]="1"
        [style.height]="1"
        [opacity]="0.01"
        [isUserInteractionEnabled]="false"
        (loaded)="onLoaded($event)"
      ></PlaybackSurface>
    }
  `,
})
export class PlaybackHost {
  protected readonly local = inject(LocalPlayback);
  private detach: (() => void) | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.detach?.();
      this.detach = null;
    });
  }

  protected onLoaded(args: EventData) {
    if (!this.detach) {
      this.detach = this.local.attach(args.object as PlaybackSurface);
    }
  }
}
