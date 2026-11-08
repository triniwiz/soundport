import type { SurfaceHost } from './native-web-view';
import { PLAYER_PAGE_HTML, PLAYER_PAGE_ORIGIN } from './player-page';

export const supportsWebPlayback = true;

const CONSOLE_PREFIX = '__soundport__';

@NativeClass()
class PlaybackChromeClient extends android.webkit.WebChromeClient {
  private owner!: WeakRef<SurfaceHost>;

  static initWithOwner(owner: SurfaceHost): PlaybackChromeClient {
    const client = new PlaybackChromeClient();
    client.owner = new WeakRef(owner);
    return client;
  }

  constructor() {
    super();
    return (globalThis as any).__native(this);
  }

  /** Grants DRM (protected media) access. */
  onPermissionRequest(request: android.webkit.PermissionRequest) {
    const wanted = android.webkit.PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID;
    const resources = request.getResources();
    const granted: string[] = [];
    for (let i = 0; i < resources.length; i++) {
      if (resources[i] === wanted) {
        granted.push(resources[i]);
      }
    }
    if (granted.length) {
      const array = Array.create(java.lang.String, granted.length);
      granted.forEach((resource, i) => (array[i] = resource));
      request.grant(array);
    } else {
      request.deny();
    }
  }

  /** Page-to-app channel: tagged console lines. */
  // `any`: the Java method is overloaded.
  onConsoleMessage(message: any): any {
    const text: string = (message as android.webkit.ConsoleMessage).message();
    if (text && text.startsWith(CONSOLE_PREFIX)) {
      this.owner?.deref()?._receive(text.slice(CONSOLE_PREFIX.length));
    } else {
      console.log('[playback page]', text);
    }
    return true;
  }
}

@NativeClass()
class PlaybackWebViewClient extends android.webkit.WebViewClient {
  private owner!: WeakRef<SurfaceHost>;

  static initWithOwner(owner: SurfaceHost): PlaybackWebViewClient {
    const client = new PlaybackWebViewClient();
    client.owner = new WeakRef(owner);
    return client;
  }

  constructor() {
    super();
    return (globalThis as any).__native(this);
  }

  onPageFinished(_view: android.webkit.WebView, _url: string) {
    this.owner?.deref()?._pageLoaded();
  }
}

export function createNativeWebView(host: SurfaceHost): android.webkit.WebView {
  const webView = new android.webkit.WebView(host._context);
  const settings = webView.getSettings();
  settings.setJavaScriptEnabled(true);
  settings.setDomStorageEnabled(true);
  settings.setMediaPlaybackRequiresUserGesture(false);
  webView.setWebChromeClient(PlaybackChromeClient.initWithOwner(host));
  webView.setWebViewClient(PlaybackWebViewClient.initWithOwner(host));
  // EME requires a secure context.
  webView.loadDataWithBaseURL(PLAYER_PAGE_ORIGIN, PLAYER_PAGE_HTML, 'text/html', 'utf-8', null);
  return webView;
}

export function initNativeWebView(_host: SurfaceHost, _native: any) {}

export function evaluateScript(native: android.webkit.WebView, script: string) {
  native.evaluateJavascript(script, null);
}

export function disposeNativeWebView(native: android.webkit.WebView) {
  native.setWebChromeClient(null);
  native.destroy();
}
