import { Injectable, signal } from '@angular/core';
import { Page, Utils } from '@nativescript/core';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const NONE: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** System bar and cutout insets (dp) for edge-to-edge drawing. Zero on desktop. */
@Injectable({ providedIn: 'root' })
export class SafeArea {
  readonly insets = signal<Insets>(NONE);

  /** Returns the teardown. */
  attach(page: Page): () => void {
    const cleanups: (() => void)[] = [];

    if (__IOS__) {
      const update = () => {
        const window = Utils.getWindow<UIWindow>();
        const inset = window?.safeAreaInsets;
        if (inset) {
          this.set({ top: inset.top, right: inset.right, bottom: inset.bottom, left: inset.left });
        }
      };
      page.on('layoutChanged', update);
      cleanups.push(() => page.off('layoutChanged', update));
      update();
    }

    if (__ANDROID__) {
      page.androidOverflowEdge = 'dont-apply';
      const dp = Utils.layout.toDeviceIndependentPixels;
      const onInset = (args: any) => {
        const inset = args.inset;
        if (!inset) {
          return;
        }
        this.set({
          top: dp(Math.max(inset.top, inset.cutoutTop)),
          right: dp(Math.max(inset.right, inset.cutoutRight)),
          bottom: dp(Math.max(inset.bottom, inset.imeBottom, inset.cutoutBottom)),
          left: dp(Math.max(inset.left, inset.cutoutLeft)),
        });
      };
      page.on('androidOverflowInset', onInset);
      cleanups.push(() => page.off('androidOverflowInset', onInset));
    }

    return () => cleanups.forEach((cleanup) => cleanup());
  }

  private set(next: Insets) {
    const current = this.insets();
    const round = (v: number) => Math.round(v * 100) / 100;
    next = { top: round(next.top), right: round(next.right), bottom: round(next.bottom), left: round(next.left) };
    if (
      next.top !== current.top ||
      next.right !== current.right ||
      next.bottom !== current.bottom ||
      next.left !== current.left
    ) {
      this.insets.set(next);
    }
  }
}
