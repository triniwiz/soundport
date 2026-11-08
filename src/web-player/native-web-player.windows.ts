import type { WebPlayerHost } from './native-web-player';

// Not supported yet.
export const supportsWebPlayer = false;

export function createWebPlayerView(_host: WebPlayerHost, _url: string, _bridge: string): any {
  throw new Error('The web player backend is not available on this platform yet');
}

export function evaluateInWebPlayer(_native: any, _script: string) {}

export function navigateWebPlayer(_native: any, _url: string) {}

export function clearWebPlayerSession(_native: any): Promise<void> {
  return Promise.resolve();
}

export function disposeWebPlayerView(_native: any) {}
