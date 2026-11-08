import { signal } from '@angular/core';
import { Application, Utils } from '@nativescript/core';

export class AuthCancelledError extends Error {
  constructor() {
    super('Sign-in was cancelled');
    this.name = 'AuthCancelledError';
  }
}

/** A sign-in page for the login screen to show in a WebView (Windows). */
export interface EmbeddedAuthRequest {
  url: string;
  redirectUri: string;
  complete(callbackUrl: string): void;
  cancel(): void;
}

export const embeddedAuthRequest = signal<EmbeddedAuthRequest | null>(null);

/** Linux: waiting for the browser to hit the loopback redirect. */
export const waitingForBrowser = signal(false);

let cancelCurrent: (() => void) | null = null;

export function cancelAuthorization() {
  cancelCurrent?.();
}

/** Opens the authorize page and resolves with the full redirect URL. */
export function authorize(url: string, redirectUri: string): Promise<string> {
  cancelCurrent?.();
  if (__IOS__) {
    return authorizeIOS(url, redirectUri);
  }
  if (__ANDROID__) {
    return authorizeAndroid(url, redirectUri);
  }
  if (__WINDOWS__) {
    return authorizeEmbedded(url, redirectUri);
  }
  if (__LINUX__) {
    return authorizeLoopback(url, redirectUri);
  }
  return Promise.reject(new Error('Sign-in is not supported on this platform'));
}

// ---------------------------------------------------------------------------
// iOS

let PresentationProvider: any;

function authorizeIOS(url: string, redirectUri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    PresentationProvider ??= (NSObject as any).extend(
      {
        presentationAnchorForWebAuthenticationSession(_session: ASWebAuthenticationSession) {
          return Utils.getWindow<UIWindow>();
        },
      },
      { protocols: [ASWebAuthenticationPresentationContextProviding] },
    );

    const scheme = redirectUri.slice(0, redirectUri.indexOf(':'));
    let provider: any = PresentationProvider.new();
    let session: ASWebAuthenticationSession | null =
      ASWebAuthenticationSession.alloc().initWithURLCallbackURLSchemeCompletionHandler(
        NSURL.URLWithString(url),
        scheme,
        (callbackUrl, error) => {
          session = null;
          provider = null;
          cancelCurrent = null;
          if (callbackUrl?.absoluteString) {
            resolve(callbackUrl.absoluteString);
          } else if (error?.code === ASWebAuthenticationSessionErrorCode.CanceledLogin) {
            reject(new AuthCancelledError());
          } else {
            reject(new Error(error?.localizedDescription ?? 'Sign-in failed'));
          }
        },
      );
    session.presentationContextProvider = provider;
    cancelCurrent = () => session?.cancel();
    if (!session.start()) {
      session = null;
      provider = null;
      cancelCurrent = null;
      reject(new Error('Could not open the sign-in page'));
    }
  });
}

// ---------------------------------------------------------------------------
// Android

function authorizeAndroid(url: string, redirectUri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const android = Application.android;
    let leftApp = false;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      android.off(android.activityNewIntentEvent, onIntent);
      android.off(android.activityPausedEvent, onPaused);
      android.off(android.activityResumedEvent, onResumed);
      clearTimeout(settleTimer);
      cancelCurrent = null;
    };
    const onIntent = (args: any) => {
      const data = args.intent?.getData?.()?.toString?.();
      if (data && data.startsWith(redirectUri)) {
        cleanup();
        resolve(data);
      }
    };
    const onPaused = () => {
      leftApp = true;
    };
    // The redirect arrives before onResume; resuming without one means the user backed out.
    const onResumed = () => {
      if (!leftApp) {
        return;
      }
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        cleanup();
        reject(new AuthCancelledError());
      }, 1500);
    };

    android.on(android.activityNewIntentEvent, onIntent);
    android.on(android.activityPausedEvent, onPaused);
    android.on(android.activityResumedEvent, onResumed);
    cancelCurrent = () => {
      cleanup();
      reject(new AuthCancelledError());
    };

    if (!Utils.openUrl(url)) {
      cleanup();
      reject(new Error('Could not open a browser for sign-in'));
    }
  });
}

// ---------------------------------------------------------------------------
// Windows (embedded WebView2)

function authorizeEmbedded(url: string, redirectUri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      embeddedAuthRequest.set(null);
      cancelCurrent = null;
    };
    const request: EmbeddedAuthRequest = {
      url,
      redirectUri,
      complete(callbackUrl) {
        finish();
        resolve(callbackUrl);
      },
      cancel() {
        finish();
        reject(new AuthCancelledError());
      },
    };
    cancelCurrent = request.cancel;
    embeddedAuthRequest.set(request);
  });
}

// ---------------------------------------------------------------------------
// Linux (system browser + loopback HTTP server on GIO sockets)

const LOOPBACK_TIMEOUT_MS = 5 * 60 * 1000;

function ascii(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += String.fromCharCode(byte);
  }
  return out;
}

function toBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    bytes[i] = text.charCodeAt(i) & 0xff;
  }
  return bytes;
}

const DONE_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Soundport</title>
<style>body{font-family:system-ui,sans-serif;background:#0b1020;color:#e2e8f0;display:grid;place-items:center;height:100vh;margin:0}</style>
</head><body><div><h1>You're signed in</h1><p>You can close this tab and return to Soundport.</p></div></body></html>`;

function authorizeLoopback(url: string, redirectUri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const g = globalThis as any;
    const match = /^http:\/\/(127\.0\.0\.1|\[::1\]):(\d+)(\/[^?#]*)?/.exec(redirectUri);
    if (!match) {
      reject(new Error(`The Linux redirect URI must be http://127.0.0.1:<port>/<path>, got ${redirectUri}`));
      return;
    }
    const host = match[1] === '[::1]' ? '::1' : match[1];
    const port = Number(match[2]);
    const path = match[3] ?? '/';

    const IPV4 = 2;
    const IPV6 = 10;
    const STREAM = 1;
    const socket = g.g_socket_new(host === '::1' ? IPV6 : IPV4, STREAM, 0, null);
    const address = g.g_inet_socket_address_new_from_string(host, port);
    const bound = socket && address && g.g_socket_bind(socket, address, 1, null);
    if (address) {
      g.g_object_unref(address);
    }
    if (!bound || !g.g_socket_listen(socket, null)) {
      if (socket) {
        g.g_object_unref(socket);
      }
      reject(new Error(`Port ${port} is in use. Close the other app or set SPOTIFY_LOOPBACK_CALLBACK_URL.`));
      return;
    }
    g.g_socket_set_blocking(socket, 0);

    const respond = (client: any, status: string, body: string) => {
      const response = toBytes(
        `HTTP/1.1 ${status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n${body}`,
      );
      g.g_socket_send(client, response, response.length, null, null);
      g.g_socket_close(client, null);
      g.g_object_unref(client);
    };

    let settled = false;
    const stop = () => {
      settled = true;
      clearInterval(poll);
      clearTimeout(timeout);
      g.g_socket_close(socket, null);
      g.g_object_unref(socket);
      waitingForBrowser.set(false);
      cancelCurrent = null;
    };

    const poll = setInterval(() => {
      if (settled) {
        return;
      }
      const client = g.g_socket_accept(socket, null, null);
      if (!client) {
        return;
      }
      g.g_socket_set_blocking(client, 1);
      g.g_socket_set_timeout(client, 3);
      const buffer = new Uint8Array(8192);
      const read = g.g_socket_receive(client, buffer, buffer.length, null, null);
      const requestLine = read > 0 ? ascii(buffer.subarray(0, read)).split('\r\n', 1)[0] : '';
      const target = requestLine.split(' ')[1] ?? '';
      if (target.split('?')[0] !== path) {
        respond(client, '404 Not Found', '');
        return;
      }
      respond(client, '200 OK', DONE_PAGE);
      stop();
      resolve(`${redirectUri.split('?')[0]}${target.slice(path.length)}`);
    }, 150);

    const timeout = setTimeout(() => {
      stop();
      reject(new Error('Timed out waiting for the browser'));
    }, LOOPBACK_TIMEOUT_MS);

    cancelCurrent = () => {
      stop();
      reject(new AuthCancelledError());
    };

    waitingForBrowser.set(true);
    if (!Utils.openUrl(url)) {
      stop();
      reject(new Error('Could not open a browser for sign-in'));
    }
  });
}
