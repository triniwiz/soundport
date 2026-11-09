import type { CanvasRenderingContext2D } from '@nativescript/canvas';
import type { Demo, DemoInstance } from '../canvas/runner';
import { hsla } from './color';

export interface Aura extends DemoInstance {
  /** Degrees; eased towards. */
  setHue(hue: number): void;
  /** 0 (idle) to 1 (playing). */
  setEnergy(energy: number): void;
  /** 0–1: darkens the aura behind content. */
  setDim(dim: number): void;
}

interface Blob {
  /** Orbit centre, as a fraction of the canvas size. */
  cx: number;
  cy: number;
  /** Orbit radius, as a fraction of the shorter side. */
  orbit: number;
  /** Blob radius, as a fraction of the longer side. */
  radius: number;
  speed: number;
  phase: number;
  hueShift: number;
}

/** Glowing backdrop tinted with the track's hue; rings pulse while playing. */
export function aura(options: { hue?: number; energy?: number } = {}): Demo<Aura> {
  return (canvas, size) => {
    const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    let { width, height } = size;
    const scale = size.scale;

    let hue = options.hue ?? 250;
    let targetHue = hue;
    let energy = options.energy ?? 0;
    let targetEnergy = energy;
    let clock = 0;
    let dim = 0;
    let targetDim = 0;

    const blobs: Blob[] = [
      { cx: 0.25, cy: 0.3, orbit: 0.18, radius: 0.55, speed: 0.11, phase: 0, hueShift: 0 },
      { cx: 0.75, cy: 0.35, orbit: 0.22, radius: 0.5, speed: -0.08, phase: 2, hueShift: 40 },
      { cx: 0.5, cy: 0.75, orbit: 0.2, radius: 0.6, speed: 0.06, phase: 4, hueShift: -50 },
      { cx: 0.15, cy: 0.85, orbit: 0.12, radius: 0.4, speed: -0.13, phase: 1, hueShift: 160 },
    ];

    function draw() {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = hsla(hue, 0.35, 0.06);
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = 'lighter';
      const long = Math.max(width, height);
      const short = Math.min(width, height);
      for (const blob of blobs) {
        const angle = blob.phase + clock * blob.speed;
        const x = blob.cx * width + Math.cos(angle) * blob.orbit * short;
        const y = blob.cy * height + Math.sin(angle * 1.3) * blob.orbit * short;
        const r = blob.radius * long * (0.85 + 0.15 * energy);
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        const h = hue + blob.hueShift;
        gradient.addColorStop(0, hsla(h, 0.75, 0.45, 0.22 + 0.18 * energy));
        gradient.addColorStop(0.5, hsla(h, 0.7, 0.35, 0.08 + 0.06 * energy));
        gradient.addColorStop(1, hsla(h, 0.7, 0.3, 0));
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }

      if (energy > 0.25) {
        const ringStrength = (energy - 0.25) / 0.75;
        const cx = width / 2;
        const cy = Math.min(height * 0.36, width * 0.55);
        for (let i = 0; i < 3; i++) {
          const t = (clock * 0.35 + i / 3) % 1;
          const r = short * (0.25 + t * 0.45);
          ctx.strokeStyle = hsla(hue + 20, 0.8, 0.7, (1 - t) * 0.12 * ringStrength);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      if (dim > 0.01) {
        ctx.fillStyle = `rgba(0,0,0,${dim})`;
        ctx.fillRect(0, 0, width, height);
      }
    }

    return {
      setHue(next) {
        targetHue = next;
      },
      setEnergy(next) {
        targetEnergy = Math.max(0, Math.min(1, next));
      },
      setDim(next) {
        targetDim = Math.max(0, Math.min(1, next));
      },
      resize(w, h) {
        width = w;
        height = h;
      },
      frame(_time, dt) {
        const k = Math.min(1, dt / 600);
        // Ease along the shorter way round the colour wheel.
        const delta = ((targetHue - hue + 540) % 360) - 180;
        hue = (hue + delta * k + 360) % 360;
        energy += (targetEnergy - energy) * k;
        dim += (targetDim - dim) * k;
        clock += (dt / 1000) * (0.4 + energy);
        draw();
      },
    };
  };
}
