/** Platform part of WebPlayerSurface; see `native-web-player.<platform>.ts`. */
export interface WebPlayerHost {
  readonly _context: any;
  _receive(json: string): void;
}

export const supportsWebPlayer: boolean;

export function createWebPlayerView(host: WebPlayerHost, url: string, bridge: string): any;
export function evaluateInWebPlayer(native: any, script: string): void;
export function navigateWebPlayer(native: any, url: string): void;
/** Clears cookies and storage (signs out). */
export function clearWebPlayerSession(native: any): Promise<void>;
export function disposeWebPlayerView(native: any): void;
