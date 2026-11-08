/** Platform part of PlaybackSurface; see `native-web-view.<platform>.ts`. */
export interface SurfaceHost {
  readonly _context: any;
  _receive(json: string): void;
  _pageLoaded(): void;
}

export const supportsWebPlayback: boolean;

export function createNativeWebView(host: SurfaceHost): any;
export function initNativeWebView(host: SurfaceHost, native: any): void;
export function evaluateScript(native: any, script: string): void;
export function disposeNativeWebView(native: any): void;
