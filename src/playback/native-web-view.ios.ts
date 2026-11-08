import type { SurfaceHost } from './native-web-view';
import { PLAYER_PAGE_HTML, PLAYER_PAGE_ORIGIN } from './player-page';

export const supportsWebPlayback = true;

@NativeClass()
class PlaybackScriptHandler extends NSObject implements WKScriptMessageHandler {
  static ObjCProtocols = [WKScriptMessageHandler];
  private owner!: WeakRef<SurfaceHost>;

  static initWithOwner(owner: SurfaceHost): PlaybackScriptHandler {
    const handler = PlaybackScriptHandler.new() as PlaybackScriptHandler;
    handler.owner = new WeakRef(owner);
    return handler;
  }

  userContentControllerDidReceiveScriptMessage(_controller: WKUserContentController, message: WKScriptMessage) {
    this.owner?.deref()?._receive(String(message.body));
  }
}

@NativeClass()
class PlaybackNavigationDelegate extends NSObject implements WKNavigationDelegate {
  static ObjCProtocols = [WKNavigationDelegate];
  private owner!: WeakRef<SurfaceHost>;

  static initWithOwner(owner: SurfaceHost): PlaybackNavigationDelegate {
    const delegate = PlaybackNavigationDelegate.new() as PlaybackNavigationDelegate;
    delegate.owner = new WeakRef(owner);
    return delegate;
  }

  webViewDidFinishNavigation(_webView: WKWebView, _navigation: WKNavigation) {
    this.owner?.deref()?._pageLoaded();
  }
}

/** Navigation delegates are held weakly by WKWebView. */
const delegates = new Map<WKWebView, PlaybackNavigationDelegate>();

export function createNativeWebView(host: SurfaceHost): WKWebView {
  // Keep playing with the silent switch on and in the background.
  try {
    AVAudioSession.sharedInstance().setCategoryError(AVAudioSessionCategoryPlayback);
  } catch {}

  const configuration = WKWebViewConfiguration.new();
  configuration.allowsInlineMediaPlayback = true;
  configuration.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypes.None;
  configuration.userContentController.addScriptMessageHandlerName(
    PlaybackScriptHandler.initWithOwner(host),
    'soundport',
  );

  const webView = WKWebView.alloc().initWithFrameConfiguration(CGRectMake(0, 0, 1, 1), configuration);
  const delegate = PlaybackNavigationDelegate.initWithOwner(host);
  delegates.set(webView, delegate);
  webView.navigationDelegate = delegate;
  // EME requires a secure context.
  webView.loadHTMLStringBaseURL(PLAYER_PAGE_HTML, NSURL.URLWithString(PLAYER_PAGE_ORIGIN));
  return webView;
}

export function initNativeWebView(_host: SurfaceHost, _native: any) {}

export function evaluateScript(native: WKWebView, script: string) {
  native.evaluateJavaScriptCompletionHandler(script, null as any);
}

export function disposeNativeWebView(native: WKWebView) {
  // The controller retains its handlers.
  native.configuration.userContentController.removeScriptMessageHandlerForName('soundport');
  native.navigationDelegate = null;
  native.stopLoading();
  delegates.delete(native);
}
