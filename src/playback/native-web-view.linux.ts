import type { SurfaceHost } from './native-web-view';

// No embedded web view on Linux yet: remote only.
export const supportsWebPlayback = false;

export function createNativeWebView(_host: SurfaceHost): any {
  throw new Error('Web playback is not available on Linux');
}

export function initNativeWebView(_host: SurfaceHost, _native: any) {}

export function evaluateScript(_native: any, _script: string) {}

export function disposeNativeWebView(_native: any) {}
