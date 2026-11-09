import { Component, NO_ERRORS_SCHEMA, computed, input, output } from '@angular/core';
import { Cover } from './cover';
import { Icon } from './icon';
import { imageUrl, subtitleOf, type PlayableItem } from '../spotify/types';
import { formatTime } from '../ui/format';

@Component({
  selector: 'app-track-row',
  imports: [Cover, Icon],
  schemas: [NO_ERRORS_SCHEMA],
  host: { class: 'flex flex-row items-center gap-3 rounded-2xl px-3 py-2 active:bg-white/10' },
  template: `
    <app-cover [src]="art()" class="size-12 rounded-lg" (tap)="play.emit()" />
    <div class="flex min-w-0 flex-1 flex-col" (tap)="play.emit()">
      <span
        class="truncate text-base font-semibold"
        [class]="active() ? 'text-emerald-300' : 'text-white'"
      >
        {{ item().name }}
      </span>
      <span class="truncate text-sm text-slate-400">{{ subtitle() }}</span>
    </div>
    <span class="text-sm text-slate-500">{{ duration() }}</span>
    <div class="rounded-full p-2 active:bg-white/15" (tap)="queue.emit()">
      <app-icon name="queueAdd" [size]="20" color="#94a3b8" />
    </div>
  `,
})
export class TrackRow {
  readonly item = input.required<PlayableItem>();
  readonly active = input(false);
  readonly play = output<void>();
  readonly queue = output<void>();

  protected readonly art = computed(() => imageUrl(this.item(), 64));
  protected readonly subtitle = computed(
    () => (this.item().explicit ? 'E · ' : '') + subtitleOf(this.item()),
  );
  protected readonly duration = computed(() => formatTime(this.item().duration_ms));
}
