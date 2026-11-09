import { Injectable, inject, signal } from '@angular/core';
import { MusicApi } from '../music/music-api';
import { messageOf } from '../spotify/auth';
import type { Playlist, SearchResults } from '../spotify/types';

const DEBOUNCE_MS = 350;

/** Search state, kept outside the Search tab so it survives tab switches. */
@Injectable({ providedIn: 'root' })
export class SearchState {
  private readonly api = inject(MusicApi);

  /** As typed. */
  readonly text = signal('');
  /** Trimmed query the results are for. */
  readonly query = signal('');
  readonly results = signal<SearchResults | null>(null);
  readonly playlists = signal<Playlist[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private timer: ReturnType<typeof setTimeout> | undefined;
  private latest = 0;

  /** Debounced. */
  type(text: string) {
    this.text.set(text);
    const query = text.trim();
    clearTimeout(this.timer);
    if (query === this.query() && this.results()) {
      return;
    }
    this.query.set(query);
    if (!query) {
      this.reset();
      return;
    }
    this.timer = setTimeout(() => void this.search(query), DEBOUNCE_MS);
  }

  clear() {
    clearTimeout(this.timer);
    this.text.set('');
    this.query.set('');
    this.reset();
  }

  private reset() {
    this.latest++;
    this.results.set(null);
    this.playlists.set([]);
    this.loading.set(false);
    this.error.set(null);
  }

  private async search(query: string) {
    const id = ++this.latest;
    this.loading.set(true);
    this.error.set(null);
    try {
      const results = await this.api.search(query);
      if (id !== this.latest) {
        return;
      }
      this.results.set(results);
      // Playlist entries can be null.
      this.playlists.set((results.playlists?.items ?? []).filter((p): p is Playlist => !!p));
    } catch (error) {
      if (id === this.latest) {
        this.error.set(messageOf(error));
      }
    } finally {
      if (id === this.latest) {
        this.loading.set(false);
      }
    }
  }
}
