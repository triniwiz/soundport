/** The AuthenticationServices APIs used by the iOS sign-in (not in the bundled typings). */

declare class ASWebAuthenticationSession extends NSObject {
  static alloc(): ASWebAuthenticationSession;
  initWithURLCallbackURLSchemeCompletionHandler(
    URL: NSURL,
    callbackURLScheme: string,
    completionHandler: (callbackURL: NSURL | null, error: NSError | null) => void,
  ): ASWebAuthenticationSession;
  presentationContextProvider: any;
  prefersEphemeralWebBrowserSession: boolean;
  start(): boolean;
  cancel(): void;
}

declare var ASWebAuthenticationPresentationContextProviding: any;

declare const enum ASWebAuthenticationSessionErrorCode {
  CanceledLogin = 1,
  PresentationContextNotProvided = 2,
  PresentationContextInvalid = 3,
}
