import { Component, NO_ERRORS_SCHEMA, effect, input, output, signal } from '@angular/core';
import { CanvasView } from './canvas-view';
import { scrubBar, type ScrubBar } from '../ui/scrub-bar';

/** Canvas slider (0–1): `scrub` while dragging, `commit` on release. */
@Component({
  selector: 'app-slider',
  imports: [CanvasView],
  schemas: [NO_ERRORS_SCHEMA],
  host: { class: 'flex flex-col' },
  template: `<app-canvas-view [demo]="demo" [height]="height()" class="w-full" (started)="instance.set($event)" />`,
})
export class Slider {
  readonly value = input(0);
  readonly hue = input(250);
  readonly enabled = input(true);
  readonly height = input(28);
  readonly scrub = output<number>();
  readonly commit = output<number>();

  protected readonly instance = signal<ScrubBar | null>(null);
  protected readonly demo = scrubBar({
    onScrub: (value) => this.scrub.emit(value),
    onCommit: (value) => this.commit.emit(value),
  });

  constructor() {
    effect(() => {
      const bar = this.instance();
      if (bar) {
        bar.setValue(this.value());
        bar.setHue(this.hue());
        bar.setEnabled(this.enabled());
      }
    });
  }
}
