import { Component, NO_ERRORS_SCHEMA, inject, signal } from '@angular/core';
import { Cover } from '../components/cover';
import { Icon } from '../components/icon';
import { TrackRow } from '../components/track-row';
import { MusicApi, type RecentEntry } from '../music/music-api';
import { SpotifyApiError } from '../spotify/api';
import { messageOf } from '../spotify/auth';
import { Player } from '../spotify/player';
import { imageUrl, type PlayableItem, type Playlist, type Track } from '../spotify/types';

type Section = 'playlists' | 'liked' | 'recent';

@Component({
  selector: 'app-library',
  imports: [Cover, Icon, TrackRow],
  schemas: [NO_ERRORS_SCHEMA],
  host: { class: 'flex flex-col' },
  template: `
    @if (openPlaylist(); as playlist) {
      <div class="flex flex-row items-center gap-2 px-3 py-2">
        <div class="rounded-full p-2 active:bg-white/15" (tap)="closePlaylist()">
          <app-icon name="back" [size]="24" />
        </div>
        <span class="flex-1 truncate text-lg font-bold text-white">{{ playlist.name }}</span>
      </div>
      <div class="relative flex-1">
      <Scroll class="absolute inset-0" (scroll)="onDetailScroll($event)">
        <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-8">
          <div class="flex flex-row items-center gap-4 px-1">
            <app-cover [src]="cover(playlist)" [iconSize]="40" class="size-28 rounded-2xl" />
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <span class="text-xl font-bold text-white">{{ playlist.name }}</span>
              <span class="truncate text-sm text-slate-400">
                {{ playlist.owner.display_name ?? 'Spotify' }}
                @if (playlist.items?.total) {
                  · {{ playlist.items.total }} items
                }
              </span>
              <div class="flex flex-row pt-2">
                <button class="btn bg-white text-slate-900 active:bg-white/80" (tap)="player.playContext(playlist.uri)">
                  Play
                </button>
              </div>
            </div>
          </div>
          @if (playlistNote()) {
            <p class="px-1 text-sm text-slate-400">{{ playlistNote() }}</p>
          }
          <div class="flex flex-col">
            @for (item of playlistItems(); track $index) {
              <app-track-row
                [item]="item"
                [active]="item.uri === player.item()?.uri"
                (play)="player.playContext(playlist.uri, item.uri)"
                (queue)="player.addToQueue(item.uri)"
              />
            }
          </div>
          @if (loadingItems()) {
            <span class="self-center py-4 text-sm text-slate-400">Loading…</span>
          }
        </div>
      </Scroll>
      </div>
    } @else {
      <div class="flex flex-row flex-wrap gap-2 px-5 py-2">
        @for (option of sections; track option.value) {
          <button
            class="rounded-full px-4 py-2 text-sm font-semibold"
            [class]="section() === option.value ? 'bg-white text-slate-900' : 'bg-white/10 text-white active:bg-white/20'"
            (tap)="select(option.value)"
          >
            {{ option.label }}
          </button>
        }
      </div>

      <div class="relative flex-1">
      <Scroll class="absolute inset-0" (scroll)="onListScroll($event)">
        <div class="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pb-8 pt-2">
          @if (error()) {
            <p class="px-1 text-sm text-rose-300">{{ error() }}</p>
          }

          @switch (section()) {
            @case ('playlists') {
              <div class="grid grid-cols-[repeat(auto-fill,minmax(150,1fr))] gap-4">
                @for (playlist of playlists(); track playlist.id) {
                  <article class="flex flex-col gap-2 rounded-2xl p-2 active:bg-white/10" (tap)="open(playlist)">
                    <app-cover [src]="cover(playlist)" [iconSize]="40" class="aspect-square w-full rounded-xl" />
                    <span class="truncate text-sm font-semibold text-white">{{ playlist.name }}</span>
                    <span class="truncate text-xs text-slate-400">
                      {{ playlist.owner.display_name ?? 'Spotify' }}
                    </span>
                  </article>
                }
              </div>
              @if (!loading() && !playlists().length && !error()) {
                <p class="px-1 text-sm text-slate-400">You don't have any playlists yet.</p>
              }
            }
            @case ('liked') {
              @if (liked().length) {
                <button class="btn self-start bg-white text-slate-900 active:bg-white/80" (tap)="playLiked(0)">
                  Play liked songs
                </button>
              }
              <div class="flex flex-col">
                @for (track of liked(); track track.id; let i = $index) {
                  <app-track-row
                    [item]="track"
                    [active]="track.uri === player.item()?.uri"
                    (play)="playLiked(i)"
                    (queue)="player.addToQueue(track.uri)"
                  />
                }
              </div>
              @if (!loading() && !liked().length && !error()) {
                <p class="px-1 text-sm text-slate-400">Songs you like show up here.</p>
              }
            }
            @case ('recent') {
              <div class="flex flex-col">
                @for (entry of recent(); track $index) {
                  @if (entry.kind === 'track') {
                    <app-track-row
                      [item]="entry.track"
                      [active]="entry.track.uri === player.item()?.uri"
                      (play)="playRecent(entry)"
                      (queue)="player.addToQueue(entry.track.uri)"
                    />
                  } @else {
                    <div class="flex flex-row items-center gap-3 rounded-2xl px-3 py-2 active:bg-white/10" (tap)="playRecent(entry)">
                      <app-cover [src]="entry.image" class="size-14 rounded-lg" />
                      <div class="flex min-w-0 flex-1 flex-col">
                        <span class="truncate text-base font-semibold text-white">{{ entry.name }}</span>
                        <span class="truncate text-sm text-slate-400">{{ entry.subtitle }}</span>
                      </div>
                      <app-icon name="play" [size]="22" color="#e2e8f0" />
                    </div>
                  }
                }
              </div>
            }
          }

          @if (loading()) {
            <span class="self-center py-4 text-sm text-slate-400">Loading…</span>
          }
        </div>
      </Scroll>
      </div>
    }
  `,
})
export class Library {
  private readonly api = inject(MusicApi);
  protected readonly player = inject(Player);

  protected readonly sections: { label: string; value: Section }[] = [
    { label: 'Playlists', value: 'playlists' },
    { label: 'Liked songs', value: 'liked' },
    { label: 'Recently played', value: 'recent' },
  ];
  protected readonly section = signal<Section>('playlists');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly playlists = signal<Playlist[]>([]);
  protected readonly playlistsNext = signal(false);
  protected readonly liked = signal<Track[]>([]);
  protected readonly likedNext = signal(false);
  protected readonly recent = signal<RecentEntry[]>([]);

  protected readonly openPlaylist = signal<Playlist | null>(null);
  protected readonly playlistItems = signal<PlayableItem[]>([]);
  protected readonly playlistNext = signal(false);
  protected readonly playlistNote = signal<string | null>(null);
  protected readonly loadingItems = signal(false);

  protected readonly cover = (playlist: Playlist) => imageUrl(playlist, 300);

  private readonly loaded = new Set<Section>();

  constructor() {
    this.select('playlists');
  }

  protected select(section: Section) {
    this.section.set(section);
    this.error.set(null);
    if (section === 'recent' || !this.loaded.has(section)) {
      this.loaded.add(section);
      if (section === 'playlists') void this.loadPlaylists(true);
      if (section === 'liked') void this.loadLiked(true);
      if (section === 'recent') void this.loadRecent();
    }
  }

  protected async loadPlaylists(reset = false) {
    await this.load(async () => {
      const page = await this.api.myPlaylists(reset ? 0 : this.playlists().length);
      this.playlists.update((list) => [...(reset ? [] : list), ...page.items.filter(Boolean)]);
      this.playlistsNext.set(!!page.next);
    });
  }

  protected async loadLiked(reset = false) {
    await this.load(async () => {
      const page = await this.api.savedTracks(reset ? 0 : this.liked().length);
      this.liked.update((list) => [...(reset ? [] : list), ...page.items.map((entry) => entry.track)]);
      this.likedNext.set(!!page.next);
    });
  }

  protected async loadRecent() {
    await this.load(async () => {
      this.recent.set(await this.api.recent());
    });
  }

  protected open(playlist: Playlist) {
    this.openPlaylist.set(playlist);
    this.playlistNext.set(false);
    this.playlistItems.set([]);
    this.playlistNote.set(null);
    void this.loadPlaylistItems(true);
  }

  protected closePlaylist() {
    this.openPlaylist.set(null);
  }

  protected async loadPlaylistItems(reset = false) {
    const playlist = this.openPlaylist();
    if (!playlist || (this.loadingItems() && !reset)) {
      return;
    }
    this.loadingItems.set(true);
    try {
      const page = await this.api.playlistItems(playlist.id, reset ? 0 : this.playlistItems().length);
      if (this.openPlaylist()?.id !== playlist.id) {
        return;
      }
      const items = page.items.map((entry) => entry.item).filter((item): item is PlayableItem => !!item);
      this.playlistItems.update((list) => [...(reset ? [] : list), ...items]);
      this.playlistNext.set(!!page.next);
      if (reset && !items.length) {
        this.playlistNote.set('This playlist is empty.');
      }
    } catch (error) {
      this.playlistNote.set(
        error instanceof SpotifyApiError && (error.status === 403 || error.status === 404)
          ? 'Spotify only lists the tracks of playlists you own. Press Play to listen to this one.'
          : messageOf(error),
      );
    } finally {
      this.loadingItems.set(false);
    }
  }

  /** Load the next page within this distance (dp) of the end. */
  private static readonly LOAD_AHEAD = 600;

  private nearEnd(args: any): boolean {
    const view = args?.object ?? args?.target;
    const total = Number(view?.scrollHeight ?? 0);
    const seen = Number(view?.scrollTop ?? 0) + Number(view?.clientHeight ?? 0);
    return total > 0 && seen >= total - Library.LOAD_AHEAD;
  }

  protected onListScroll(args: any) {
    if (this.loading() || !this.nearEnd(args)) {
      return;
    }
    if (this.section() === 'playlists' && this.playlistsNext()) {
      void this.loadPlaylists();
    } else if (this.section() === 'liked' && this.likedNext()) {
      void this.loadLiked();
    }
  }

  protected onDetailScroll(args: any) {
    if (this.playlistNext() && !this.loadingItems() && this.nearEnd(args)) {
      void this.loadPlaylistItems();
    }
  }

  protected async playLiked(index: number) {
    const tracks = this.liked();
    const context = await this.api.likedSongsContext().catch(() => null);
    if (context) {
      void this.player.playContext(context, tracks[index]?.uri);
    } else {
      // No Liked Songs context: queue the loaded tracks.
      void this.player.playUris(tracks.map((track) => track.uri), index);
    }
  }

  protected playRecent(entry: RecentEntry) {
    if (entry.kind === 'context') {
      void this.player.playContext(entry.uri);
    } else if (entry.contextUri) {
      void this.player.playContext(entry.contextUri, entry.track.uri);
    } else {
      void this.player.playUris([entry.track.uri]);
    }
  }

  private async load(task: () => Promise<void>) {
    this.loading.set(true);
    this.error.set(null);
    try {
      await task();
    } catch (error) {
      this.error.set(messageOf(error));
    } finally {
      this.loading.set(false);
    }
  }
}
