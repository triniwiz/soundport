import { Component, NO_ERRORS_SCHEMA, computed, input } from '@angular/core';
import { iconSvg, type IconName } from '../ui/icons';

@Component({
  selector: 'app-icon',
  schemas: [NO_ERRORS_SCHEMA],
  host: {
    class: 'flex items-center justify-center',
    '[style.width]': 'size()',
    '[style.height]': 'size()',
  },
  template: `<Svg [src]="svg()" [style.width]="size()" [style.height]="size()"></Svg>`,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(24);
  readonly color = input('#ffffff');

  protected readonly svg = computed(() => iconSvg(this.name(), this.size(), this.color()));
}
