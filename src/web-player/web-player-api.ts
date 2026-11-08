import { Injectable, inject } from '@angular/core';
import type { MusicBackend, PlayOptions, RecentEntry } from '../music/music-api';
import type {
  Album,
  Artist,
  ArtistRef,
  Device,
  Paging,
  PlaybackState,
  PlayableItem,
  Playlist,
  PlaylistEntry,
  RepeatState,
  SearchResults,
  SpotifyImage,
  Track,
  User,
} from '../spotify/types';
import { WebPlayer } from './web-player';

export const WEB_PLAYER_DEVICE_ID = 'soundport-web-player';

const REPEAT: RepeatState[] = ['off', 'context', 'track'];

/** Music backend on Spotify's web player, mapped to the Web API models the screens use. */
@Injectable({ providedIn: 'root' })
export class WebPlayerApi implements MusicBackend {
  private readonly player = inject(WebPlayer);
  private username: string | null = null;
  private volumeLevel = 1;

  // -- Profile ---------------------------------------------------------------

  async me(): Promise<User> {
    const username = await this.currentUsername();
    let name: string | null = null;
    let images: SpotifyImage[] = [];
    try {
      const profile: any = await this.player.graphql('profileAttributes', {});
      const p = profile?.data?.me?.profile;
      name = p?.name ?? null;
      images = sources(p?.avatar?.sources);
    } catch (error) {
      console.log('[web-player api] profileAttributes', String(error));
    }
    return { id: username, display_name: name, images, uri: `spotify:user:${username}` };
  }

  private async currentUsername(): Promise<string> {
    this.username ??= await this.player.invoke<string>('RootlistAPI', 'getUsername');
    return this.username;
  }

  // -- Player ----------------------------------------------------------------

  async playbackState(): Promise<PlaybackState | null> {
    const [state, volume] = await Promise.all([
      this.player.call<any>('state', { depth: 6 }),
      this.player.invoke<number>('PlaybackAPI', 'getVolume').catch(() => this.volumeLevel),
    ]);
    if (typeof volume === 'number') {
      this.volumeLevel = volume;
    }
    if (!state?.item) {
      return null;
    }
    const restrictions = state.restrictions ?? {};
    const elapsed = state.isPaused ? 0 : Math.max(0, Date.now() - (state.timestamp ?? Date.now()));
    // A state restored from another device has no local session; play starts from 0.
    const restored = !state.sessionId;
    const isAd = state.item.type === 'ad';
    return {
      device: this.thisDevice(true),
      repeat_state: REPEAT[state.repeat] ?? 'off',
      shuffle_state: !!state.shuffle,
      context: state.context?.uri ? { type: typeOf(state.context.uri), uri: state.context.uri } : null,
      timestamp: state.timestamp ?? Date.now(),
      progress_ms: restored ? 0 : Math.min((state.positionAsOfTimestamp ?? 0) + elapsed, state.duration ?? Infinity),
      is_playing: !state.isPaused,
      item: playable(state.item),
      currently_playing_type: isAd ? 'ad' : state.item.type === 'episode' ? 'episode' : 'track',
      actions: {
        disallows: {
          pausing: restrictions.canPause === false,
          resuming: restrictions.canResume === false,
          seeking: restrictions.canSeek === false || isAd,
          skipping_next: restrictions.canSkipNext === false,
          skipping_prev: restrictions.canSkipPrevious === false,
          toggling_shuffle: restrictions.canToggleShuffle === false,
          toggling_repeat_context: restrictions.canToggleRepeatContext === false,
          toggling_repeat_track: restrictions.canToggleRepeatTrack === false,
        },
      },
    };
  }

  async devices(): Promise<Device[]> {
    return [this.thisDevice(true)];
  }

  async transfer(_deviceId: string, play?: boolean): Promise<void> {
    if (play) {
      await this.resume();
    }
  }

  async play(options: PlayOptions = {}): Promise<void> {
    const skipTo =
      options.offset && 'uri' in options.offset
        ? { uri: options.offset.uri }
        : options.offset && 'position' in options.offset && options.contextUri
          ? { index: options.offset.position }
          : undefined;
    const playOptions: Record<string, unknown> = {};
    if (skipTo) playOptions['skipTo'] = skipTo;
    if (options.positionMs !== undefined) playOptions['seekTo'] = options.positionMs;

    if (options.contextUri) {
      await this.player.invoke('PlayerAPI', 'play', { uri: options.contextUri }, {}, playOptions);
    } else if (options.uris?.length) {
      const index = options.offset && 'position' in options.offset ? options.offset.position : 0;
      const uri = options.uris[Math.min(index, options.uris.length - 1)];
      await this.player.invoke('PlayerAPI', 'play', { uri }, {}, {});
    } else {
      await this.resume();
    }
  }

  /** Without a local session (state restored from another device), starts the context instead. */
  async resume(): Promise<void> {
    const state = await this.player.call<any>('state', { depth: 4 });
    if (state && !state.sessionId && state.item?.uri) {
      const context = state.context?.uri ? { uri: state.context.uri } : { uri: state.item.uri };
      await this.player.invoke('PlayerAPI', 'play', context, {}, { skipTo: { uri: state.item.uri } });
      return;
    }
    await this.player.invoke('PlayerAPI', 'resume');
  }

  pause() {
    return this.player.invoke<void>('PlayerAPI', 'pause');
  }


  next() {
    return this.player.invoke<void>('PlayerAPI', 'skipToNext');
  }

  previous() {
    return this.player.invoke<void>('PlayerAPI', 'skipToPrevious');
  }

  seek(positionMs: number) {
    return this.player.invoke<void>('PlayerAPI', 'seekTo', Math.max(0, Math.round(positionMs)));
  }

  async volume(percent: number) {
    this.volumeLevel = Math.min(1, Math.max(0, percent / 100));
    await this.player.invoke('PlaybackAPI', 'setVolume', this.volumeLevel);
  }

  shuffle(state: boolean) {
    return this.player.invoke<void>('PlayerAPI', 'setShuffle', state);
  }

  repeat(state: RepeatState) {
    return this.player.invoke<void>('PlayerAPI', 'setRepeat', Math.max(0, REPEAT.indexOf(state)));
  }

  addToQueue(uri: string) {
    return this.player.invoke<void>('PlayerAPI', 'addToQueue', [{ uri }]);
  }

  // -- Library ---------------------------------------------------------------

  async myPlaylists(offset = 0, limit = 50): Promise<Paging<Playlist>> {
    const root: any = await this.player.call('invoke', {
      service: 'RootlistAPI',
      method: 'getContents',
      args: [],
      depth: 8,
    });
    const all: Playlist[] = [];
    const walk = (node: any) => {
      for (const item of node?.items ?? []) {
        if (item?.type === 'folder') walk(item);
        else if (item?.type === 'playlist' && item.uri) all.push(playlist(item));
      }
    };
    walk(root);
    return page(all.slice(offset, offset + limit), all.length, offset, limit);
  }

  async playlistItems(id: string, offset = 0, limit = 50): Promise<Paging<PlaylistEntry>> {
    const uri = id.startsWith('spotify:') ? id : `spotify:playlist:${id}`;
    const contents: any = await this.player.call('invoke', {
      service: 'PlaylistAPI',
      method: 'getContents',
      args: [uri, { offset, limit }],
      depth: 7,
    });
    const items: PlaylistEntry[] = (contents?.items ?? []).map((item: any) => ({
      added_at: item?.addedAt ?? '',
      item: playable(item),
    }));
    return page(items, contents?.totalLength ?? items.length, offset, limit);
  }

  async savedTracks(offset = 0, limit = 50): Promise<Paging<{ added_at: string; track: Track }>> {
    const result: any = await this.player.call('invoke', {
      service: 'LibraryAPI',
      method: 'getTracks',
      args: [{ offset, limit }],
      depth: 7,
    });
    const items = (result?.items ?? []).map((item: any) => ({ added_at: item?.addedAt ?? '', track: track(item) }));
    return page(items, result?.totalLength ?? items.length, offset, limit);
  }

  async likedSongsContext(): Promise<string | null> {
    return `spotify:user:${await this.currentUsername()}:collection`;
  }

  async recent(): Promise<RecentEntry[]> {
    const contexts: any[] = (await this.player.call('invoke', {
      service: 'RecentlyPlayedAPI',
      method: 'getContexts',
      args: [],
      depth: 5,
    })) ?? [];
    return contexts
      .filter((c) => c?.uri)
      .map((c) => ({
        kind: 'context' as const,
        uri: c.uri,
        name: c.name ?? '',
        image: c.images?.[0]?.url ?? null,
        subtitle: [labelOf(c.type), c.owner?.displayName].filter(Boolean).join(' · '),
      }));
  }

  async libraryContains(uris: string[]): Promise<boolean[]> {
    if (!uris.length) return [];
    const result = await this.player.invoke<boolean[]>('LibraryAPI', 'contains', ...uris);
    return Array.isArray(result) ? result.map(Boolean) : uris.map(() => false);
  }

  async saveToLibrary(uris: string[]) {
    await this.player.invoke('LibraryAPI', 'add', { uris });
  }

  async removeFromLibrary(uris: string[]) {
    await this.player.invoke('LibraryAPI', 'remove', { uris });
  }

  // -- Search ----------------------------------------------------------------

  async search(query: string): Promise<SearchResults> {
    const result: any = await this.player.graphql('searchDesktop', {
      searchTerm: query,
      offset: 0,
      limit: 10,
      numberOfTopResults: 5,
      includeAudiobooks: false,
      includePreReleases: false,
      includeLocalConcertsField: false,
      includeArtistHasConcertsField: false,
    });
    const s = result?.data?.searchV2 ?? {};
    const tracks = (s.tracksV2?.items ?? []).map((i: any) => searchTrack(i?.item?.data)).filter(Boolean) as Track[];
    const albums = (s.albumsV2?.items ?? []).map((i: any) => searchAlbum(i?.data)).filter(Boolean) as Album[];
    const artists = (s.artists?.items ?? []).map((i: any) => searchArtist(i?.data)).filter(Boolean) as Artist[];
    const playlists = (s.playlists?.items ?? []).map((i: any) => searchPlaylist(i?.data)).filter(Boolean) as Playlist[];
    return {
      tracks: page(tracks, tracks.length, 0, 10),
      albums: page(albums, albums.length, 0, 10),
      artists: page(artists, artists.length, 0, 10),
      playlists: page(playlists, playlists.length, 0, 10),
    };
  }

  // -- Helpers ---------------------------------------------------------------

  private thisDevice(active: boolean): Device {
    return {
      id: WEB_PLAYER_DEVICE_ID,
      is_active: active,
      is_private_session: false,
      is_restricted: false,
      name: 'Soundport',
      type: 'Smartphone',
      volume_percent: Math.round(this.volumeLevel * 100),
      supports_volume: true,
    };
  }
}

// -- Mapping -----------------------------------------------------------------

function idOf(uri: string | undefined): string {
  return uri ? uri.split(':').pop() ?? '' : '';
}

function typeOf(uri: string): string {
  return uri.split(':')[1] ?? 'unknown';
}

function labelOf(type: string | undefined): string {
  switch (type) {
    case 'playlist':
      return 'Playlist';
    case 'album':
      return 'Album';
    case 'artist':
      return 'Artist';
    case 'show':
      return 'Podcast';
    default:
      return '';
  }
}

function images(list: any[] | undefined): SpotifyImage[] {
  return (list ?? [])
    .filter((i) => i?.url)
    .map((i) => ({ url: i.url, width: i.width ?? null, height: i.height ?? null }));
}

function sources(list: any[] | undefined): SpotifyImage[] {
  return images(list);
}

function artistRef(a: any): ArtistRef {
  return { id: idOf(a?.uri), name: a?.name ?? a?.profile?.name ?? '', uri: a?.uri ?? '' };
}

function page<T>(items: T[], total: number, offset: number, limit: number): Paging<T> {
  return { items, total, offset, limit, next: offset + items.length < total ? 'more' : null };
}

function track(t: any): Track {
  return {
    id: idOf(t?.uri),
    name: t?.name ?? '',
    uri: t?.uri ?? '',
    duration_ms: t?.duration?.milliseconds ?? 0,
    explicit: !!t?.isExplicit,
    is_playable: t?.isPlayable !== false,
    type: 'track',
    album: {
      id: idOf(t?.album?.uri),
      name: t?.album?.name ?? '',
      uri: t?.album?.uri ?? '',
      images: images(t?.album?.images),
      artists: t?.album?.artist ? [artistRef(t.album.artist)] : [],
    },
    artists: (t?.artists ?? []).map(artistRef),
  };
}

/** Track, episode or ad. */
function playable(item: any): PlayableItem | null {
  if (!item?.uri) return null;
  if (item.type === 'ad') {
    return {
      ...track(item),
      name: item.name || 'Advertisement',
      artists: [{ id: '', name: 'Spotify', uri: '' }],
    };
  }
  if (item.type === 'episode') {
    return {
      id: idOf(item.uri),
      name: item.name ?? '',
      uri: item.uri,
      duration_ms: item.duration?.milliseconds ?? 0,
      explicit: !!item.isExplicit,
      images: images(item.images ?? item.album?.images),
      show: item.show ? { name: item.show.name ?? '', images: images(item.show.images) } : undefined,
      type: 'episode',
    };
  }
  return track(item);
}

function playlist(p: any): Playlist {
  return {
    id: idOf(p.uri),
    name: p.name ?? '',
    uri: p.uri,
    description: p.description ?? null,
    images: images(p.images),
    owner: {
      id: p.owner?.username ?? '',
      display_name: p.owner?.displayName ?? p.owner?.name ?? (p.owner?.username === 'spotify' ? 'Spotify' : null),
    },
    items: { total: p.totalLength ?? 0 },
  };
}

function searchTrack(d: any): Track | null {
  if (!d?.uri) return null;
  return {
    id: d.id ?? idOf(d.uri),
    name: d.name ?? '',
    uri: d.uri,
    duration_ms: d.duration?.totalMilliseconds ?? 0,
    explicit: d.contentRating?.label === 'EXPLICIT',
    is_playable: d.playability?.playable !== false,
    type: 'track',
    album: {
      id: idOf(d.albumOfTrack?.uri),
      name: d.albumOfTrack?.name ?? '',
      uri: d.albumOfTrack?.uri ?? '',
      images: sources(d.albumOfTrack?.coverArt?.sources),
      artists: [],
    },
    artists: (d.artists?.items ?? []).map(artistRef),
  };
}

function searchAlbum(d: any): Album | null {
  if (!d?.uri) return null;
  return {
    id: idOf(d.uri),
    name: d.name ?? '',
    uri: d.uri,
    images: sources(d.coverArt?.sources),
    artists: (d.artists?.items ?? []).map(artistRef),
    release_date: d.date?.year ? String(d.date.year) : undefined,
  };
}

function searchArtist(d: any): Artist | null {
  if (!d?.uri) return null;
  return {
    id: idOf(d.uri),
    name: d.profile?.name ?? '',
    uri: d.uri,
    images: sources(d.visuals?.avatarImage?.sources),
  };
}

function searchPlaylist(d: any): Playlist | null {
  if (!d?.uri) return null;
  return {
    id: idOf(d.uri),
    name: d.name ?? '',
    uri: d.uri,
    description: d.description ?? null,
    images: sources(d.images?.items?.[0]?.sources),
    owner: { id: d.ownerV2?.data?.username ?? '', display_name: d.ownerV2?.data?.name ?? null },
  };
}
