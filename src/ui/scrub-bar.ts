import type { CanvasRenderingContext2D } from '@nativescript/canvas';
import type { Demo, DemoInstance } from '../canvas/runner';
import { hsla } from './color';

export interface ScrubBar extends DemoInstance {
  /** 0–1; ignored while dragging. */
  setValue(value: number): void;
  setHue(hue: number): void;
  setEnabled(enabled: boolean): void;
}

export interface ScrubBarEvents {
  onScrub?(value: number): void;
  onCommit?(value: number): void;
}

/** Canvas-drawn horizontal slider driven by pointer events. */
export function scrubBar(events: ScrubBarEvents, options: { hue?: number } = {}): Demo<ScrubBar> {
  return (canvas, size) => {
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    let { width, height } = size;
    const scale = size.scale;
    const inset = 8;

    let value = 0;
    let shown = 0;
    let hue = options.hue ?? 250;
    let enabled = true;
    let dragging = false;
    let grip = 0;
    let dirty = true;

    const valueAt = (x: number) => Math.max(0, Math.min(1, (x - inset) / Math.max(1, width - inset * 2)));

    function draw() {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const y = height / 2;
      const left = inset;
      const right = width - inset;
      const x = left + (right - left) * shown;
      const thickness = 4 + grip * 2;

      ctx.lineCap = 'round';
      ctx.lineWidth = thickness;
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();

      if (shown > 0) {
        ctx.strokeStyle = enabled ? hsla(hue, 0.85, 0.68) : 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(Math.max(left + 0.01, x), y);
        ctx.stroke();
      }

      if (enabled) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, 6 + grip * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    return {
      setValue(next) {
        if (!dragging && Math.abs(next - value) > 0.0005) {
          value = Math.max(0, Math.min(1, next));
          dirty = true;
        }
      },
      setHue(next) {
        if (next !== hue) {
          hue = next;
          dirty = true;
        }
      },
      setEnabled(next) {
        if (next !== enabled) {
          enabled = next;
          dirty = true;
        }
      },
      resize(w, h) {
        width = w;
        height = h;
        dirty = true;
      },
      pointer(type, x) {
        if (!enabled) {
          return;
        }
        if (type === 'down') {
          dragging = true;
        }
        if (!dragging) {
          return;
        }
        value = valueAt(x);
        shown = value;
        dirty = true;
        if (type === 'up') {
          dragging = false;
          events.onCommit?.(value);
        } else {
          events.onScrub?.(value);
        }
      },
      frame(_time, dt) {
        const targetGrip = dragging ? 1 : 0;
        if (Math.abs(grip - targetGrip) > 0.01) {
          grip += (targetGrip - grip) * Math.min(1, dt / 80);
          dirty = true;
        }
        if (Math.abs(shown - value) > 0.0005) {
          shown = Math.abs(shown - value) > 0.1 ? value : shown + (value - shown) * Math.min(1, dt / 120);
          dirty = true;
        }
        if (dirty) {
          dirty = false;
          draw();
        }
      },
    };
  };
}
