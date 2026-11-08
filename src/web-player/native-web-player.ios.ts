import type { WebPlayerHost } from './native-web-player';

export const supportsWebPlayer = true;

/** The player needs a desktop user agent. */
const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

@NativeClass()
class WebPlayerScriptHandler extends NSObject implements WKScriptMessageHandler {
  static ObjCProtocols = [WKScriptMessageHandler];
  private owner!: WeakRef<WebPlayerHost>;

  static initWithOwner(owner: WebPlayerHost): WebPlayerScriptHandler {
    const handler = WebPlayerScriptHandler.new() as WebPlayerScriptHandler;
    handler.owner = new WeakRef(owner);
    return handler;
  }

  userContentControllerDidReceiveScriptMessage(_controller: WKUserContentController, message: WKScriptMessage) {
    this.owner?.deref()?._receive(String(message.body));
  }
}

export function createWebPlayerView(host: WebPlayerHost, url: string, bridge: string): WKWebView {
  try {
    AVAudioSession.sharedInstance().setCategoryError(AVAudioSessionCategoryPlayback);
  } catch {}

  const configuration = WKWebViewConfiguration.new();
  configuration.allowsInlineMediaPlayback = true;
  configuration.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypes.None;
  // Keeps the login between launches.
  configuration.websiteDataStore = WKWebsiteDataStore.defaultDataStore();
  const controller = configuration.userContentController;
  controller.addScriptMessageHandlerName(WebPlayerScriptHandler.initWithOwner(host), 'soundport');
  controller.addUserScript(
    WKUserScript.alloc().initWithSourceInjectionTimeForMainFrameOnly(
      bridge,
      WKUserScriptInjectionTime.AtDocumentStart,
      true,
    ),
  );

  const webView = WKWebView.alloc().initWithFrameConfiguration(CGRectZero, configuration);
  webView.customUserAgent = DESKTOP_USER_AGENT;
  webView.loadRequest(NSURLRequest.requestWithURL(NSURL.URLWithString(url)));
  return webView;
}

export function evaluateInWebPlayer(native: WKWebView, script: string) {
  native.evaluateJavaScriptCompletionHandler(script, null as any);
}

export function navigateWebPlayer(native: WKWebView, url: string) {
  native.loadRequest(NSURLRequest.requestWithURL(NSURL.URLWithString(url)));
}

export function clearWebPlayerSession(_native: WKWebView): Promise<void> {
  return new Promise((resolve) => {
    WKWebsiteDataStore.defaultDataStore().removeDataOfTypesModifiedSinceCompletionHandler(
      WKWebsiteDataStore.allWebsiteDataTypes(),
      NSDate.distantPast,
      () => resolve(),
    );
  });
}

export function disposeWebPlayerView(native: WKWebView) {
  native.configuration.userContentController.removeScriptMessageHandlerForName('soundport');
  native.configuration.userContentController.removeAllUserScripts();
  native.stopLoading();
}
