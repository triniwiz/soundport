
export interface SpotifyImage {
  url: string;
  width: number | null;
  height: number | null;
}

export interface ArtistRef {
  id: string;
  name: string;
  uri: string;
}

export interface Artist extends ArtistRef {
  images?: SpotifyImage[];
  genres?: string[];
}

export interface Album {
  id: string;
  name: string;
  uri: string;
  images: SpotifyImage[];
  artists: ArtistRef[];
  release_date?: string;
  total_tracks?: number;
}

export interface Track {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  explicit: boolean;
  album: Album;
  artists: ArtistRef[];
  is_playable?: boolean;
  type: 'track';
}

export interface Episode {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  explicit: boolean;
  images: SpotifyImage[];
  show?: { name: string; images: SpotifyImage[] };
  type: 'episode';
}

export type PlayableItem = Track | Episode;

export interface Playlist {
  id: string;
  name: string;
  uri: string;
  description: string | null;
  images: SpotifyImage[] | null;
  owner: { id: string; display_name: string | null };
  items?: { total: number };
}

export interface PlaylistEntry {
  added_at: string;
  item: PlayableItem | null;
}

export interface Paging<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  next: string | null;
}

export interface CursorPaging<T> {
  items: T[];
  next: string | null;
  limit: number;
}

export interface User {
  id: string;
  display_name: string | null;
  images: SpotifyImage[];
  uri: string;
}

export type DeviceType =
  | 'Computer'
  | 'Smartphone'
  | 'Tablet'
  | 'Speaker'
  | 'TV'
  | 'AVR'
  | 'STB'
  | 'AudioDongle'
  | 'GameConsole'
  | 'CastVideo'
  | 'CastAudio'
  | 'Automobile'
  | string;

export interface Device {
  id: string | null;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: DeviceType;
  volume_percent: number | null;
  supports_volume: boolean;
}

export type RepeatState = 'off' | 'context' | 'track';

export interface PlaybackState {
  device: Device;
  repeat_state: RepeatState;
  shuffle_state: boolean;
  context: { type: string; uri: string } | null;
  timestamp: number;
  progress_ms: number | null;
  is_playing: boolean;
  item: PlayableItem | null;
  currently_playing_type: 'track' | 'episode' | 'ad' | 'unknown';
  actions?: { disallows?: Partial<Record<string, boolean>> };
}

export interface Queue {
  currently_playing: PlayableItem | null;
  queue: PlayableItem[];
}

export interface RecentlyPlayed {
  track: Track;
  played_at: string;
  context: { type: string; uri: string } | null;
}

export interface SearchResults {
  tracks?: Paging<Track>;
  albums?: Paging<Album>;
  artists?: Paging<Artist>;
  playlists?: Paging<Playlist | null>;
}

type WithImages = PlayableItem | Album | Playlist | Artist | User;

export function imagesOf(item: WithImages | null | undefined): SpotifyImage[] {
  if (!item) {
    return [];
  }
  if ('album' in item && item.album) {
    return item.album.images ?? [];
  }
  if ('show' in item && item.show && !(item as Episode).images?.length) {
    return item.show.images ?? [];
  }
  return (item as { images?: SpotifyImage[] | null }).images ?? [];
}

/** Smallest image at least `size` px wide, else the largest. */
export function imageUrl(
  item: WithImages | null | undefined,
  size = 300,
): string | null {
  const images = [...imagesOf(item)].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  if (!images.length) {
    return null;
  }
  return (images.find((image) => (image.width ?? size) >= size) ?? images[images.length - 1]).url;
}

export function subtitleOf(item: PlayableItem | null | undefined): string {
  if (!item) {
    return '';
  }
  if (item.type === 'track') {
    return item.artists.map((artist) => artist.name).join(', ');
  }
  return item.show?.name ?? '';
}
