# Soundport

A custom Spotify player for iOS, Android, Windows and Linux, built with
NativeScript, Angular, `@nativescript/canvas` and MasonKit.

## Backends

Pick one on the sign-in screen:

- **Spotify Web API** ("Connect Spotify"). Browses your library and controls
  playback on any Spotify Connect device. On iOS, Android and Windows it can
  also play in the app through the Web Playback SDK. Requires Spotify Premium,
  including on the account that owns the app in the Developer Dashboard.
- **Spotify web player** ("Use the Spotify web player", or "Play in <browser>"
  on desktop). Runs Spotify's web player and drives it from Soundport's UI.
  Works with Free accounts (with ads). Needs no Developer Dashboard setup.

Where the web player runs:

| Platform | Host | Notes |
| --- | --- | --- |
| iOS | Hidden WKWebView | FairPlay; real devices only |
| Android | Hidden WebView | Widevine |
| Windows, Linux | Installed Chrome, Chromium, Edge, Brave or Vivaldi | Own profile and window, driven over the DevTools protocol. Firefox isn't supported yet. |

## Setup

Only needed for the Web API backend.

1. In the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard),
   add these redirect URIs to your app:
   - `soundport://spotify/callback` (iOS, Android, Windows)
   - `http://127.0.0.1:8898/callback` (Linux)
2. In development mode, add each account that signs in under
   **User Management**.
3. Copy `.env.example` to `.env`:

   | Variable | Purpose |
   | --- | --- |
   | `SPOTIFY_CLIENT_ID` | Your app's client ID. |
   | `SPOTIFY_CLIENT_CALLBACK_URL` | Custom-scheme redirect. Keep it in sync with the Android `intent-filter`. |
   | `SPOTIFY_LOOPBACK_CALLBACK_URL` | Optional Linux redirect. |

   No client secret is used (sign-in uses PKCE).

## Run

```bash
npm install --force
npm run ios   # or: android / windows / linux
```

## Sign-in

| Platform | Web API backend |
| --- | --- |
| iOS | `ASWebAuthenticationSession` |
| Android | System browser + intent-filter |
| Windows | Embedded WebView2 |
| Linux | System browser + loopback server |

The web player backend signs in on Spotify's own login page inside the app.

## Project layout

| Path | Contents |
| --- | --- |
| `src/app/` | Screens: shell, login, now playing, library, search, devices. |
| `src/music/` | `MusicApi`, which delegates to the active backend. |
| `src/spotify/` | Web API backend: config, sign-in, API client, player state. |
| `src/playback/` | Web Playback SDK in a hidden web view. |
| `src/web-player/desktop/` | Desktop: finds an installed Chromium-based browser, launches it and drives the player over the DevTools protocol. |
| `src/web-player/` | Web player backend: web view, page bridge, API mapping. |
| `src/ui/` | Canvas visuals, icons, safe-area insets. |
| `src/components/` | Shared components. |
