import { Injectable, inject } from '@angular/core';
import type { MusicBackend, RecentEntry } from '../music/music-api';
import { SpotifyAuth } from './auth';
import { API_URL } from './config';
import { httpRequest, jsonOf } from './http';
import { toQuery } from './pkce';
import type {
  CursorPaging,
  Device,
  Paging,
  PlaybackState,
  Playlist,
  PlaylistEntry,
  Queue,
  RecentlyPlayed,
  RepeatState,
  SearchResults,
  Track,
  User,
} from './types';

type Query = Record<string, string | number | boolean | undefined>;

/** A non-2xx response from the Web API. */
export class SpotifyApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** e.g. `NO_ACTIVE_DEVICE`, `PREMIUM_REQUIRED`. */
    readonly reason?: string,
  ) {
    super(message);
    this.name = 'SpotifyApiError';
  }
}

/** Maximum results per type the search endpoint accepts. */
export const SEARCH_LIMIT = 10;

/** Spotify Web API client. Playback goes through Spotify Connect. */
@Injectable({ providedIn: 'root' })
export class SpotifyApi implements MusicBackend {
  private readonly auth = inject(SpotifyAuth);

  // -- Profile ---------------------------------------------------------------

  me() {
    return this.request<User>('GET', '/me');
  }

  // -- Player ----------------------------------------------------------------

  /** null when nothing is playing anywhere. */
  playbackState() {
    return this.request<PlaybackState | undefined>('GET', '/me/player', {
      query: { additional_types: 'track,episode' },
    }).then((state) => state ?? null);
  }

  async devices() {
    const body = await this.request<{ devices: Device[] }>('GET', '/me/player/devices');
    return body?.devices ?? [];
  }

  transfer(deviceId: string, play?: boolean) {
    return this.request<void>('PUT', '/me/player', { body: { device_ids: [deviceId], play } });
  }

  play(options: {
    deviceId?: string;
    contextUri?: string;
    uris?: string[];
    offset?: { position: number } | { uri: string };
    positionMs?: number;
  } = {}) {
    const body: Record<string, unknown> = {};
    if (options.contextUri) body['context_uri'] = options.contextUri;
    if (options.uris) body['uris'] = options.uris;
    if (options.offset) body['offset'] = options.offset;
    if (options.positionMs !== undefined) body['position_ms'] = options.positionMs;
    return this.request<void>('PUT', '/me/player/play', {
      query: { device_id: options.deviceId },
      body: Object.keys(body).length ? body : undefined,
    });
  }

  resume() {
    return this.play();
  }

  pause(deviceId?: string) {
    return this.request<void>('PUT', '/me/player/pause', { query: { device_id: deviceId } });
  }

  next() {
    return this.request<void>('POST', '/me/player/next');
  }

  previous() {
    return this.request<void>('POST', '/me/player/previous');
  }

  seek(positionMs: number) {
    return this.request<void>('PUT', '/me/player/seek', {
      query: { position_ms: Math.max(0, Math.round(positionMs)) },
    });
  }

  volume(percent: number) {
    return this.request<void>('PUT', '/me/player/volume', {
      query: { volume_percent: Math.round(Math.min(100, Math.max(0, percent))) },
    });
  }

  shuffle(state: boolean) {
    return this.request<void>('PUT', '/me/player/shuffle', { query: { state } });
  }

  repeat(state: RepeatState) {
    return this.request<void>('PUT', '/me/player/repeat', { query: { state } });
  }

  queue() {
    return this.request<Queue>('GET', '/me/player/queue');
  }

  addToQueue(uri: string) {
    return this.request<void>('POST', '/me/player/queue', { query: { uri } });
  }

  recentlyPlayed(limit = 30) {
    return this.request<CursorPaging<RecentlyPlayed>>('GET', '/me/player/recently-played', {
      query: { limit },
    });
  }

  async recent(): Promise<RecentEntry[]> {
    const page = await this.recentlyPlayed();
    return page.items.map((entry) => ({
      kind: 'track' as const,
      track: entry.track,
      contextUri: entry.context?.uri ?? null,
    }));
  }

  // -- Library ---------------------------------------------------------------

  /** Liked Songs can't be started as a context here; callers queue the tracks. */
  async likedSongsContext(): Promise<string | null> {
    return null;
  }

  myPlaylists(offset = 0, limit = 50) {
    return this.request<Paging<Playlist>>('GET', '/me/playlists', { query: { offset, limit } });
  }

  playlist(id: string) {
    return this.request<Playlist>('GET', `/playlists/${encodeURIComponent(id)}`);
  }

  /** Items are only listed for the user's own playlists. */
  playlistItems(id: string, offset = 0, limit = 50) {
    return this.request<Paging<PlaylistEntry>>('GET', `/playlists/${encodeURIComponent(id)}/items`, {
      query: { offset, limit, additional_types: 'track,episode' },
    });
  }

  savedTracks(offset = 0, limit = 50) {
    return this.request<Paging<{ added_at: string; track: Track }>>('GET', '/me/tracks', {
      query: { offset, limit },
    });
  }

  async libraryContains(uris: string[]): Promise<boolean[]> {
    if (!uris.length) {
      return [];
    }
    const result = await this.request<boolean[]>('GET', '/me/library/contains', {
      query: { uris: uris.join(',') },
    });
    return result ?? uris.map(() => false);
  }

  saveToLibrary(uris: string[]) {
    return this.request<void>('PUT', '/me/library', { query: { uris: uris.join(',') } });
  }

  removeFromLibrary(uris: string[]) {
    return this.request<void>('DELETE', '/me/library', { query: { uris: uris.join(',') } });
  }

  // -- Search ----------------------------------------------------------------

  search(q: string, types = ['track', 'album', 'artist', 'playlist'], limit = SEARCH_LIMIT) {
    return this.request<SearchResults>('GET', '/search', {
      query: { q, type: types.join(','), limit: Math.min(limit, SEARCH_LIMIT) },
    });
  }

  // -- Transport -------------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    options: { query?: Query; body?: unknown } = {},
    attempt = 0,
  ): Promise<T> {
    const token = await this.auth.accessToken(attempt > 0 && attempt < 2);
    const query = options.query ? toQuery(options.query) : '';
    const response = await httpRequest(
      method,
      `${API_URL}${path}${query ? `?${query}` : ''}`,
      {
        Authorization: `Bearer ${token}`,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      options.body !== undefined ? JSON.stringify(options.body) : undefined,
    );

    // A token can be revoked before it expires: refresh once.
    if (response.status === 401 && attempt === 0) {
      return this.request<T>(method, path, options, 1);
    }
    if (response.status === 429 && attempt < 2) {
      const seconds = Number(response.header('Retry-After') ?? 1);
      await new Promise((resolve) => setTimeout(resolve, Math.min(seconds, 10) * 1000));
      return this.request<T>(method, path, options, 2);
    }

    // Player commands may answer with an empty or non-JSON body.
    const body = response.status === 204 ? undefined : jsonOf(response);

    if (response.status < 200 || response.status >= 300) {
      const error = body?.error;
      throw new SpotifyApiError(
        response.status,
        friendlyMessage(
          response.status,
          error?.reason,
          // Some errors are plain text.
          error?.message ?? (response.text.trim().slice(0, 200) || `HTTP ${response.status}`),
        ),
        error?.reason,
      );
    }
    return body as T;
  }
}

function friendlyMessage(status: number, reason: string | undefined, fallback: string): string {
  switch (reason) {
    case 'NO_ACTIVE_DEVICE':
      return 'No active Spotify device. Open Spotify on a phone, computer or speaker, or pick one under Devices.';
    case 'PREMIUM_REQUIRED':
      return 'Controlling playback needs Spotify Premium.';
  }
  if (status === 403 && /premium/i.test(fallback)) {
    const text = fallback.trim().replace(/\.+$/, '');
    if (/owner of the app/i.test(text)) {
      return `${text}. (Spotify only serves Development Mode apps while the owner of the app in the Developer Dashboard has Premium.)`;
    }
    return `${text}. Controlling playback needs Spotify Premium.`;
  }
  if (status === 403 && /registered/i.test(fallback)) {
    return 'This Spotify account is not on the app’s allowlist. While the app is in development mode, add it under User Management in the Spotify dashboard.';
  }
  return fallback;
}
