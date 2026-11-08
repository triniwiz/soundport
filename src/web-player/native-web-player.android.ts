import type { WebPlayerHost } from './native-web-player';

export const supportsWebPlayer = true;

/** The player needs a desktop user agent; other pages (login) keep the mobile one. */
const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const CONSOLE_PREFIX = '__soundport__';

/** A desktop-width viewport so the web view zooms the player out to fit. */
const DESKTOP_VIEWPORT = `(function () {
  var content = 'width=1280';
  function fix() {
    var meta = document.querySelector('meta[name="viewport"]');
    if (meta) { if (meta.getAttribute('content') !== content) meta.setAttribute('content', content); return true; }
    return false;
  }
  if (!fix()) {
    new MutationObserver(function (_, observer) { if (fix()) observer.disconnect(); })
      .observe(document.documentElement, { childList: true, subtree: true });
  }
})();`;
const ORIGIN = 'https://open.spotify.com';

@NativeClass()
class WebPlayerChromeClient extends android.webkit.WebChromeClient {
  private owner!: WeakRef<WebPlayerHost>;

  static initWithOwner(owner: WebPlayerHost): WebPlayerChromeClient {
    const client = new WebPlayerChromeClient();
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

  // `any`: the Java method is overloaded.
  onConsoleMessage(message: any): any {
    const consoleMessage = message as android.webkit.ConsoleMessage;
    const text: string = consoleMessage.message();
    if (text && text.startsWith(CONSOLE_PREFIX)) {
      this.owner?.deref()?._receive(text.slice(CONSOLE_PREFIX.length));
      return true;
    }
    const level = String(consoleMessage.messageLevel());
    if (level === 'ERROR' || level === 'WARNING') {
      console.log(
        `[web-player console ${level.toLowerCase()}]`,
        String(text).slice(0, 300),
        `(${String(consoleMessage.sourceId()).split('?')[0]}:${consoleMessage.lineNumber()})`,
      );
    }
    return true;
  }
}

/**
 * WRAP_CONTENT layout params make WebView use a zero layout height, so CSS
 * viewport units resolve to 0. The parent sizes the view anyway.
 */
@NativeClass()
class FullHeightWebView extends android.webkit.WebView {
  constructor(context: android.content.Context) {
    super(context);
    return (globalThis as any).__native(this);
  }

  setLayoutParams(params: android.view.ViewGroup.LayoutParams) {
    const WRAP = android.view.ViewGroup.LayoutParams.WRAP_CONTENT;
    const MATCH = android.view.ViewGroup.LayoutParams.MATCH_PARENT;
    if (params) {
      if (params.height === WRAP) params.height = MATCH;
      if (params.width === WRAP) params.width = MATCH;
    }
    super.setLayoutParams(params);
  }
}

function isPlayerUrl(url: string) {
  return url.startsWith(ORIGIN);
}

/** Returns true when the user agent changed (a started load keeps the old one). */
function applyUserAgent(view: android.webkit.WebView, url: string): boolean {
  const settings = view.getSettings();
  const wanted = isPlayerUrl(url) ? DESKTOP_USER_AGENT : android.webkit.WebSettings.getDefaultUserAgent(view.getContext());
  if (settings.getUserAgentString() === wanted) {
    return false;
  }
  settings.setUserAgentString(wanted);
  return true;
}

@NativeClass()
class WebPlayerViewClient extends android.webkit.WebViewClient {
  private bridge = '';
  private documentStart = false;

  static create(bridge: string, documentStart: boolean): WebPlayerViewClient {
    const client = new WebPlayerViewClient();
    client.bridge = bridge;
    client.documentStart = documentStart;
    return client;
  }

  constructor() {
    super();
    return (globalThis as any).__native(this);
  }

  /** Keeps http(s) pages in the view and ignores app links. */
  shouldOverrideUrlLoading(view: android.webkit.WebView, request: any): boolean {
    const url = String(typeof request === 'string' ? request : request?.getUrl?.()?.toString?.() ?? '');
    if (!/^https?:/i.test(url)) {
      return true;
    }
    const isPost = typeof request !== 'string' && request?.getMethod?.() === 'POST';
    if (!isPost && applyUserAgent(view, url)) {
      view.loadUrl(url);
      return true;
    }
    return false;
  }

  onPageStarted(view: android.webkit.WebView, url: string, _favicon: any) {
    if (!url) {
      return;
    }
    console.log('[web-player] page started', url.split('?')[0]);
    // Redirects may skip shouldOverrideUrlLoading: fix the user agent and reload.
    if (applyUserAgent(view, url)) {
      view.stopLoading();
      view.loadUrl(url);
      return;
    }
    // Fallback when document-start scripts aren't supported.
    if (!this.documentStart && isPlayerUrl(url)) {
      view.evaluateJavascript(this.bridge, null);
    }
  }

  onPageFinished(view: android.webkit.WebView, url: string) {
    console.log('[web-player] page finished', String(url).split('?')[0]);
  }

  onReceivedError(_view: android.webkit.WebView, request: any, error: any) {
    if (request?.isForMainFrame?.()) {
      console.error('[web-player] load error', error?.getErrorCode?.(), error?.getDescription?.(), request.getUrl());
    }
  }
}

export function createWebPlayerView(host: WebPlayerHost, url: string, bridge: string): android.webkit.WebView {
  const webView = new FullHeightWebView(host._context);
  const settings = webView.getSettings();
  settings.setJavaScriptEnabled(true);
  settings.setDomStorageEnabled(true);
  settings.setDatabaseEnabled(true);
  settings.setMediaPlaybackRequiresUserGesture(false);
  applyUserAgent(webView, url);
  settings.setUseWideViewPort(true);
  settings.setLoadWithOverviewMode(true);
  settings.setSupportMultipleWindows(false);

  const cookies = android.webkit.CookieManager.getInstance();
  cookies.setAcceptCookie(true);
  cookies.setAcceptThirdPartyCookies(webView, true);

  const webkit = (globalThis as any).androidx?.webkit;
  let documentStart = false;
  try {
    if (webkit?.WebViewFeature.isFeatureSupported(webkit.WebViewFeature.DOCUMENT_START_SCRIPT)) {
      const origins = new java.util.HashSet<string>();
      origins.add(ORIGIN);
      webkit.WebViewCompat.addDocumentStartJavaScript(webView, bridge, origins);
      webkit.WebViewCompat.addDocumentStartJavaScript(webView, DESKTOP_VIEWPORT, origins);
      documentStart = true;
    }
  } catch (error) {
    console.error('[web-player] document-start script unavailable', error);
  }
  console.log('[web-player] document-start injection:', documentStart);

  webView.setWebChromeClient(WebPlayerChromeClient.initWithOwner(host));
  webView.setWebViewClient(WebPlayerViewClient.create(bridge, documentStart));
  webView.loadUrl(url);
  return webView;
}

export function evaluateInWebPlayer(native: android.webkit.WebView, script: string) {
  native.evaluateJavascript(script, null);
}

export function navigateWebPlayer(native: android.webkit.WebView, url: string) {
  applyUserAgent(native, url);
  native.loadUrl(url);
}

export function clearWebPlayerSession(_native: android.webkit.WebView): Promise<void> {
  return new Promise((resolve) => {
    android.webkit.WebStorage.getInstance().deleteAllData();
    android.webkit.CookieManager.getInstance().removeAllCookies(
      new android.webkit.ValueCallback<java.lang.Boolean>({
        onReceiveValue() {
          android.webkit.CookieManager.getInstance().flush();
          resolve();
        },
      }),
    );
  });
}

export function disposeWebPlayerView(native: android.webkit.WebView) {
  native.setWebChromeClient(null);
  native.destroy();
}
