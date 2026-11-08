import { Component, NO_ERRORS_SCHEMA } from '@angular/core';
import { PageRouterOutlet } from '@nativescript/angular';

@Component({
  selector: 'app-root',
  imports: [PageRouterOutlet],
  schemas: [NO_ERRORS_SCHEMA],
  template: `<page-router-outlet />`,
})
export class AppComponent {}
