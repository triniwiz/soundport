# Soundport

Soundport is a custom Spotify player for iOS, Android, Windows and Linux. It is
built with NativeScript, Angular, `@nativescript/canvas` and MasonKit.

## Backends

Choose a backend on the sign-in screen. Soundport remembers your choice.

- **Spotify Web API** ("Connect Spotify"). It browses your library and controls
  playback on any Spotify Connect device. On iOS, Android and Windows, it also
  plays in the app through the Web Playback SDK. It requires Spotify Premium,
  including on the account that owns the app in the Developer Dashboard.
- **Spotify web player** ("Use the Spotify web player", or "Play in <browser>"
  on desktop). It runs Spotify's web player and drives it from Soundport's UI.
  It works with Free accounts (with ads) and needs no Developer Dashboard setup.

Where the web player runs:

| Platform | Host | Notes |
| --- | --- | --- |
| iOS | Hidden WKWebView | Uses FairPlay, so it only works on real devices. |
| Android | Hidden WebView | Uses Widevine. |
| Windows | Installed Chrome, Edge, Brave or Chromium | Runs in its own profile and window and is driven over the DevTools protocol. Reuses the window if it is still open. Firefox isn't supported yet. |
| Linux | Installed Chrome, Chromium, Edge, Brave or Vivaldi | Same as Windows. |

Soundport uses the first Chromium-based browser it finds.

## Setup

You only need this for the Web API backend.

1. In the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard),
   add these redirect URIs to your app:
   - `soundport://spotify/callback` (iOS, Android, Windows)
   - `http://127.0.0.1:8898/callback` (Linux)
2. While the app is in development mode, add each account that signs in under
   **User Management**.
3. Copy `.env.example` to `.env` and fill it in:

   | Variable | Purpose |
   | --- | --- |
   | `SPOTIFY_CLIENT_ID` | Your app's client ID. |
   | `SPOTIFY_CLIENT_CALLBACK_URL` | The custom-scheme redirect. Keep it in sync with the Android `intent-filter`. |
   | `SPOTIFY_LOOPBACK_CALLBACK_URL` | The Linux redirect. Optional; defaults to `http://127.0.0.1:8898/callback`. |

   Sign-in uses PKCE, so you don't need a client secret.

## Run

```bash
npm install --force
npm run ios   # or: android / windows / linux
```

`--force` is needed because `package.json` pins prerelease builds of
`@nativescript/core`, `@nativescript/vite` and the `nativescript` CLI through
`overrides`.

To clear the build output, run `npm run clean`.

## Sign-in

| Platform | Web API backend |
| --- | --- |
| iOS | `ASWebAuthenticationSession` |
| Android | System browser and intent-filter |
| Windows | Embedded WebView2 |
| Linux | System browser and loopback server |

With the web player backend, you sign in on Spotify's own login page inside
the app, or in the browser window on desktop.

## Project layout

| Path | Contents |
| --- | --- |
| `src/app/` | Screens: shell, login, now playing, library, search, devices. |
| `src/backend.ts` | The selected backend, saved between launches. |
| `src/music/` | `MusicApi`, which delegates to the active backend. |
| `src/spotify/` | Web API backend: config, sign-in, API client, player state. |
| `src/playback/` | Web Playback SDK in a hidden web view. |
| `src/web-player/` | Web player backend: web view, page bridge, API mapping. |
| `src/web-player/desktop/` | Desktop host. It finds an installed Chromium-based browser, launches it and drives the player over the DevTools protocol. |
| `src/canvas/` | Runs canvas drawings and animations. |
| `src/ui/` | Canvas visuals, icons, formatting, safe-area insets. |
| `src/components/` | Shared components: cover, icon, slider, track row, canvas view. |
