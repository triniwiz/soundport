import { Component, NO_ERRORS_SCHEMA, input } from '@angular/core';
import { Icon } from './icon';

/** Artwork with a placeholder. Size the host with classes. */
@Component({
  selector: 'app-cover',
  imports: [Icon],
  schemas: [NO_ERRORS_SCHEMA],
  host: { class: 'relative overflow-hidden bg-white/10' },
  template: `
    @if (src()) {
      <img [src]="src()" class="absolute inset-0 h-full w-full object-cover" />
    } @else {
      <div class="absolute inset-0 flex items-center justify-center">
        <app-icon name="music" [size]="iconSize()" color="#94a3b8" />
      </div>
    }
  `,
})
export class Cover {
  readonly src = input<string | null>(null);
  readonly iconSize = input(20);
}
