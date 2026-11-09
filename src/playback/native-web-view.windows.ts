import { File, knownFolders, path } from '@nativescript/core';
import type { SurfaceHost } from './native-web-view';
import { PLAYER_PAGE_HTML, PLAYER_PAGE_ORIGIN } from './player-page';

declare const Microsoft: any;
declare const NSWinRT: any;

export const supportsWebPlayback = true;

const HOST = 'soundport.local';
const cores = new WeakMap<object, any>();

export function createNativeWebView(_host: SurfaceHost): any {
  // WebView2 may not be activatable directly; fall back to XamlReader.
  try {
    return new Microsoft.UI.Xaml.Controls.WebView2();
  } catch {
    return Microsoft.UI.Xaml.Markup.XamlReader.Load(
      '<WebView2 xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" />',
    );
  }
}

export function initNativeWebView(host: SurfaceHost, webView: any) {
  // Served from an https virtual host: EME needs a secure origin.
  const folder = path.join(knownFolders.temp().path, 'soundport-playback');
  File.fromPath(path.join(folder, 'index.html')).writeTextSync(PLAYER_PAGE_HTML);

  const ref = new WeakRef(host);
  NSWinRT.toPromise(webView.EnsureCoreWebView2Async())
    .then(() => {
      const core = webView.CoreWebView2;
      cores.set(webView, core);
      core.WebMessageReceived = NSWinRT.asDelegate(
        'Windows.Foundation.TypedEventHandler`2<Microsoft.Web.WebView2.Core.CoreWebView2,Microsoft.Web.WebView2.Core.CoreWebView2WebMessageReceivedEventArgs>',
        (_sender: any, args: any) => ref.deref()?._receive(args.TryGetWebMessageAsString()),
      );
      core.NavigationCompleted = NSWinRT.asDelegate(
        'Windows.Foundation.TypedEventHandler`2<Microsoft.Web.WebView2.Core.CoreWebView2,Microsoft.Web.WebView2.Core.CoreWebView2NavigationCompletedEventArgs>',
        () => ref.deref()?._pageLoaded(),
      );
      core.SetVirtualHostNameToFolderMapping(
        HOST,
        folder,
        Microsoft.Web.WebView2.Core.CoreWebView2HostResourceAccessKind.Allow,
      );
      core.Navigate(`${PLAYER_PAGE_ORIGIN}index.html`);
    })
    .catch((error: unknown) => console.error('[playback] WebView2 failed to start', error));
}

export function evaluateScript(webView: any, script: string) {
  cores.get(webView)?.ExecuteScriptAsync(script);
}

export function disposeNativeWebView(webView: any) {
  cores.delete(webView);
  try {
    webView.Close?.();
  } catch {}
}
