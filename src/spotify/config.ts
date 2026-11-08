export const SPOTIFY_CLIENT_ID = __SPOTIFY_CLIENT_ID__;

/** Must be registered in the Spotify Developer Dashboard. Linux uses the loopback URL. */
export const SPOTIFY_REDIRECT_URI = __LINUX__
  ? __SPOTIFY_LOOPBACK_REDIRECT_URI__
  : __SPOTIFY_REDIRECT_URI__;

export const SPOTIFY_SCOPES = [
  // Web Playback SDK.
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-recently-played',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-library-modify',
];

export const ACCOUNTS_URL = 'https://accounts.spotify.com';
export const API_URL = 'https://api.spotify.com/v1';

export function configProblem(): string | null {
  if (!SPOTIFY_CLIENT_ID) {
    return 'SPOTIFY_CLIENT_ID is missing from .env.';
  }
  if (!SPOTIFY_REDIRECT_URI) {
    return 'SPOTIFY_CLIENT_CALLBACK_URL is missing from .env.';
  }
  return null;
}
