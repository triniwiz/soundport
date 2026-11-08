import {
  Component,
  DestroyRef,
  NO_ERRORS_SCHEMA,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { EventData } from '@nativescript/core';
import type { Canvas } from '@nativescript/canvas';
import { runDemo, type Demo, type DemoInstance } from '../canvas/runner';

/**
 * A <Canvas> that runs a demo (see src/canvas/runner.ts), filling the width it is
 * given. With `height` (dp) it is that tall; without, it fills the height its
 * box gets from classes (`flex-1`, `h-*`). Projected content is layered on top
 * of the canvas, so MasonKit content (badges, captions, controls) can sit over
 * the drawing.
 *
 * The host element is the box: MasonKit makes component hosts real views, so
 * classes set on <app-canvas-view> (`rounded-*`, `flex-1`, ...) style it like
 * any other element.
 *
 * The canvas sits in an absolutely positioned box, so like any out-of-flow
 * content it adds nothing to its container's size. In flow, its backing store
 * would be its intrinsic size (as on the web), and a flex item's automatic
 * minimum height would grow with every resize the runner makes to match it.
 *
 * The size is set on the canvas as a style, not with classes: the canvas sets
 * its own width/height as local style values, which outrank class rules.
 */
@Component({
  selector: 'app-canvas-view',
  schemas: [NO_ERRORS_SCHEMA],
  host: {
    class: 'relative overflow-hidden',
    '[style.height]': 'height()',
  },
  template: `
    <div class="absolute inset-0">
      <Canvas [style.width]="'100%'" [style.height]="'100%'" (loaded)="onLoaded($event)"></Canvas>
    </div>
    <ng-content />
    @if (error()) {
      <div
        class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950 p-6"
      >
        <span class="text-sm font-semibold text-rose-300">This demo couldn't start</span>
        <p class="text-center text-xs text-slate-400">{{ error() }}</p>
      </div>
    }
  `,
})
export class CanvasView<T extends DemoInstance> {
  readonly demo = input.required<Demo<T>>();
  readonly height = input<number>();
  readonly started = output<T>();

  protected readonly error = signal<string | null>(null);
  private stop: (() => void) | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stop?.();
      this.stop = null;
    });
  }

  private destroyed = false;

  protected onLoaded(args: EventData) {
    this.start(args.object as Canvas);
  }

  /** `loaded` can fire before `demo` is bound; retry until it is. */
  private start(canvas: Canvas) {
    if (this.stop || this.destroyed) {
      return;
    }
    let demo: Demo<T>;
    try {
      demo = this.demo();
    } catch {
      setTimeout(() => this.start(canvas), 16);
      return;
    }
    this.stop = runDemo(
      canvas,
      demo,
      (instance) => this.started.emit(instance),
      (reason: any) => this.error.set(String(reason?.message ?? reason)),
    );
  }
}
