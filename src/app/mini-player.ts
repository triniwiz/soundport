import { Component, NO_ERRORS_SCHEMA, computed, inject, output } from '@angular/core';
import { Cover } from '../components/cover';
import { Icon } from '../components/icon';
import { Player } from '../spotify/player';
import { imageUrl, subtitleOf } from '../spotify/types';
import { hslHex } from '../ui/color';

@Component({
  selector: 'app-mini-player',
  imports: [Cover, Icon],
  schemas: [NO_ERRORS_SCHEMA],
  host: { class: 'flex flex-col bg-slate-900' },
  template: `
    <div class="h-[2] w-full bg-white/10">
      <div class="h-full" [style.width]="percent() + '%'" [style.background-color]="accent()"></div>
    </div>
    <div class="flex flex-row items-center gap-3 px-4 py-2">
      <div class="flex min-w-0 flex-1 flex-row items-center gap-3" (tap)="expand.emit()">
        <app-cover [src]="art()" class="size-11 rounded-lg" />
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-sm font-semibold text-white">{{ player.item()?.name }}</span>
          <span class="truncate text-xs text-slate-400">{{ subtitle() }}</span>
        </div>
      </div>
      <div class="rounded-full p-2 active:bg-white/15" (tap)="player.togglePlay()">
        <app-icon [name]="player.isPlaying() ? 'pause' : 'play'" [size]="26" />
      </div>
      <div class="rounded-full p-2 active:bg-white/15" (tap)="player.next()">
        <app-icon name="next" [size]="22" />
      </div>
    </div>
  `,
})
export class MiniPlayer {
  protected readonly player = inject(Player);
  readonly expand = output<void>();

  protected readonly art = computed(() => imageUrl(this.player.item(), 64));
  protected readonly subtitle = computed(() => subtitleOf(this.player.item()));
  protected readonly accent = computed(() => hslHex(this.player.hue(), 0.85, 0.65));
  protected readonly percent = computed(() => {
    const duration = this.player.duration();
    return duration ? Math.min(100, (this.player.progress() / duration) * 100) : 0;
  });
}
