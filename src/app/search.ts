import { Component, NO_ERRORS_SCHEMA, inject, signal } from '@angular/core';
import { Cover } from '../components/cover';
import { Icon } from '../components/icon';
import { TrackRow } from '../components/track-row';
import { Player } from '../spotify/player';
import { imageUrl, type Album, type Artist, type Playlist, type Track } from '../spotify/types';
import { SearchState } from './search-state';

@Component({
  selector: 'app-search',
  imports: [Cover, Icon, TrackRow],
  schemas: [NO_ERRORS_SCHEMA],
  host: { class: 'flex flex-col' },
  template: `
    <div class="relative px-5 py-2">
      @for (key of [fieldKey()]; track key) {
        <input
          type="search"
          placeholder="Songs, artists, albums or playlists"
          class="w-full rounded-2xl bg-white/10 py-3 pl-4 pr-12 text-base text-white"
          [value]="initialText"
          (input)="onInput($event)"
        />
      }
      @if (search.text()) {
        <div class="absolute right-7 top-2 bottom-2 flex items-center justify-center px-2" (tap)="clear()">
          <app-icon name="close" [size]="20" color="#cbd5e1" />
        </div>
      }
    </div>

    <div class="relative flex-1">
    <Scroll class="absolute inset-0">
      <div class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-8 pt-2">
        @if (search.error()) {
          <p class="px-1 text-sm text-rose-300">{{ search.error() }}</p>
        }
        @if (!search.query()) {
          <p class="px-1 text-base text-slate-400">
            Find something to play. Results play on your active Spotify device.
          </p>
        }
        @if (search.loading()) {
          <span class="self-center text-sm text-slate-400">Searching…</span>
        }

        @if (search.results(); as r) {
          @if (r.tracks?.items?.length) {
            <section class="flex flex-col gap-1">
              <h2 class="px-1 pb-1 text-lg font-bold text-white">Songs</h2>
              @for (track of r.tracks!.items; track track.id) {
                <app-track-row
                  [item]="track"
                  [active]="track.uri === player.item()?.uri"
                  (play)="playTrack(track)"
                  (queue)="player.addToQueue(track.uri)"
                />
              }
            </section>
          }

          @if (r.artists?.items?.length) {
            <section class="flex flex-col gap-2">
              <h2 class="px-1 text-lg font-bold text-white">Artists</h2>
              <div class="grid grid-cols-[repeat(auto-fill,minmax(120,1fr))] gap-3">
                @for (artist of r.artists!.items; track artist.id) {
                  <article class="flex flex-col items-center gap-2 rounded-2xl p-2 active:bg-white/10" (tap)="player.playContext(artist.uri)">
                    <app-cover [src]="art(artist)" class="aspect-square w-full rounded-full" />
                    <span class="w-full truncate text-center text-sm font-semibold text-white">{{ artist.name }}</span>
                  </article>
                }
              </div>
            </section>
          }

          @if (r.albums?.items?.length) {
            <section class="flex flex-col gap-2">
              <h2 class="px-1 text-lg font-bold text-white">Albums</h2>
              <div class="grid grid-cols-[repeat(auto-fill,minmax(150,1fr))] gap-3">
                @for (album of r.albums!.items; track album.id) {
                  <article class="flex flex-col gap-2 rounded-2xl p-2 active:bg-white/10" (tap)="player.playContext(album.uri)">
                    <app-cover [src]="art(album)" class="aspect-square w-full rounded-xl" />
                    <span class="truncate text-sm font-semibold text-white">{{ album.name }}</span>
                    <span class="truncate text-xs text-slate-400">{{ artists(album) }}</span>
                  </article>
                }
              </div>
            </section>
          }

          @if (search.playlists().length) {
            <section class="flex flex-col gap-2">
              <h2 class="px-1 text-lg font-bold text-white">Playlists</h2>
              <div class="grid grid-cols-[repeat(auto-fill,minmax(150,1fr))] gap-3">
                @for (playlist of search.playlists(); track playlist.id) {
                  <article class="flex flex-col gap-2 rounded-2xl p-2 active:bg-white/10" (tap)="player.playContext(playlist.uri)">
                    <app-cover [src]="art(playlist)" class="aspect-square w-full rounded-xl" />
                    <span class="truncate text-sm font-semibold text-white">{{ playlist.name }}</span>
                    <span class="truncate text-xs text-slate-400">{{ playlist.owner.display_name }}</span>
                  </article>
                }
              </div>
            </section>
          }
        }
      </div>
    </Scroll>
    </div>
  `,
})
export class Search {
  protected readonly search = inject(SearchState);
  protected readonly player = inject(Player);

  /** Restores the previous search; the field owns its text afterwards. */
  protected initialText = this.search.text();
  protected readonly fieldKey = signal(0);

  protected readonly art = (item: Album | Artist | Playlist) => imageUrl(item, 300);
  protected readonly artists = (album: Album) => album.artists.map((a) => a.name).join(', ');

  protected onInput(event: any) {
    this.search.type(String(event?.target?.value ?? event?.data ?? ''));
  }

  protected clear() {
    this.search.clear();
    this.initialText = '';
    this.fieldKey.update((k) => k + 1);
  }

  protected playTrack(track: Track) {
    // Play within the album so playback continues.
    void this.player.playContext(track.album.uri, track.uri);
  }
}
