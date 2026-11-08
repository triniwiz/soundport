import { Injectable, signal } from '@angular/core';
import { ApplicationSettings } from '@nativescript/core';

/**
 * `web-api`: Spotify Web API (Premium needed for playback).
 * `web-player`: Spotify's web player via the page bridge (works with Free).
 */
export type BackendKind = 'web-api' | 'web-player';

const KEY = 'soundport.backend';

@Injectable({ providedIn: 'root' })
export class Backend {
  readonly kind = signal<BackendKind>((ApplicationSettings.getString(KEY) as BackendKind) || 'web-api');

  use(kind: BackendKind) {
    ApplicationSettings.setString(KEY, kind);
    this.kind.set(kind);
  }
}
