import { Injectable, inject } from '@angular/core';
import { Backend } from '../backend';
import { SpotifyApi } from '../spotify/api';
import type {
  Device,
  Paging,
  PlaybackState,
  Playlist,
  PlaylistEntry,
  RepeatState,
  SearchResults,
  Track,
  User,
} from '../spotify/types';
import { WebPlayerApi } from '../web-player/web-player-api';

export interface PlayOptions {
  deviceId?: string;
  contextUri?: string;
  uris?: string[];
  offset?: { position: number } | { uri: string };
  positionMs?: number;
}

export type RecentEntry =
  | { kind: 'track'; track: Track; contextUri: string | null }
  | { kind: 'context'; uri: string; name: string; image: string | null; subtitle: string };

/** A music backend. Both return the Web API models, so screens don't care which is active. */
export interface MusicBackend {
  me(): Promise<User>;
  playbackState(): Promise<PlaybackState | null>;
  devices(): Promise<Device[]>;
  transfer(deviceId: string, play?: boolean): Promise<void>;
  play(options?: PlayOptions): Promise<void>;
  resume(): Promise<void>;
  pause(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  volume(percent: number): Promise<void>;
  shuffle(state: boolean): Promise<void>;
  repeat(state: RepeatState): Promise<void>;
  addToQueue(uri: string): Promise<void>;
  myPlaylists(offset?: number, limit?: number): Promise<Paging<Playlist>>;
  playlistItems(id: string, offset?: number, limit?: number): Promise<Paging<PlaylistEntry>>;
  savedTracks(offset?: number, limit?: number): Promise<Paging<{ added_at: string; track: Track }>>;
  /** Context URI for liked songs, when the backend has one. */
  likedSongsContext(): Promise<string | null>;
  recent(): Promise<RecentEntry[]>;
  search(query: string): Promise<SearchResults>;
  libraryContains(uris: string[]): Promise<boolean[]>;
  saveToLibrary(uris: string[]): Promise<void>;
  removeFromLibrary(uris: string[]): Promise<void>;
}

/** Delegates to the active backend. */
@Injectable({ providedIn: 'root' })
export class MusicApi implements MusicBackend {
  private readonly backend = inject(Backend);
  private readonly webApi = inject(SpotifyApi);
  private readonly webPlayer = inject(WebPlayerApi);

  private get active(): MusicBackend {
    return this.backend.kind() === 'web-player' ? this.webPlayer : this.webApi;
  }

  me() { return this.active.me(); }
  playbackState() { return this.active.playbackState(); }
  devices() { return this.active.devices(); }
  transfer(deviceId: string, play?: boolean) { return this.active.transfer(deviceId, play); }
  play(options?: PlayOptions) { return this.active.play(options); }
  resume() { return this.active.resume(); }
  pause() { return this.active.pause(); }
  next() { return this.active.next(); }
  previous() { return this.active.previous(); }
  seek(positionMs: number) { return this.active.seek(positionMs); }
  volume(percent: number) { return this.active.volume(percent); }
  shuffle(state: boolean) { return this.active.shuffle(state); }
  repeat(state: RepeatState) { return this.active.repeat(state); }
  addToQueue(uri: string) { return this.active.addToQueue(uri); }
  myPlaylists(offset?: number, limit?: number) { return this.active.myPlaylists(offset, limit); }
  playlistItems(id: string, offset?: number, limit?: number) { return this.active.playlistItems(id, offset, limit); }
  savedTracks(offset?: number, limit?: number) { return this.active.savedTracks(offset, limit); }
  likedSongsContext() { return this.active.likedSongsContext(); }
  recent() { return this.active.recent(); }
  search(query: string) { return this.active.search(query); }
  libraryContains(uris: string[]) { return this.active.libraryContains(uris); }
  saveToLibrary(uris: string[]) { return this.active.saveToLibrary(uris); }
  removeFromLibrary(uris: string[]) { return this.active.removeFromLibrary(uris); }
}
