import { Injectable, computed, signal } from '@angular/core';
import { ApplicationSettings } from '@nativescript/core';
import { authorize, AuthCancelledError, cancelAuthorization } from './auth-flow';
import {
  ACCOUNTS_URL,
  SPOTIFY_CLIENT_ID,
  SPOTIFY_REDIRECT_URI,
  SPOTIFY_SCOPES,
  configProblem,
} from './config';
import { httpRequest, jsonOf } from './http';
import { base64url, createPkcePair, parseQuery, randomBytes, toQuery } from './pkce';

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
  scope: string;
}

const STORAGE_KEY = 'soundport.spotify.session';
/** Refresh this long before expiry. */
const EXPIRY_MARGIN_MS = 60_000;

export type AuthStatus = 'signed-out' | 'signing-in' | 'signed-in';

/** Authorization Code + PKCE sign-in; tokens are stored and refreshed on demand. */
@Injectable({ providedIn: 'root' })
export class SpotifyAuth {
  private readonly session = signal<StoredSession | null>(load());
  private readonly busy = signal(false);
  private refreshing: Promise<string> | null = null;

  readonly error = signal<string | null>(configProblem());
  readonly status = computed<AuthStatus>(() =>
    this.busy() ? 'signing-in' : this.session() ? 'signed-in' : 'signed-out',
  );

  async signIn(): Promise<void> {
    const problem = configProblem();
    if (problem) {
      this.error.set(problem);
      return;
    }
    this.error.set(null);
    this.busy.set(true);
    try {
      const { verifier, challenge } = createPkcePair();
      const state = base64url(randomBytes(16));
      const authorizeUrl = `${ACCOUNTS_URL}/authorize?${toQuery({
        response_type: 'code',
        client_id: SPOTIFY_CLIENT_ID,
        scope: SPOTIFY_SCOPES.join(' '),
        redirect_uri: SPOTIFY_REDIRECT_URI,
        state,
        code_challenge_method: 'S256',
        code_challenge: challenge,
      })}`;

      const callback = parseQuery(await authorize(authorizeUrl, SPOTIFY_REDIRECT_URI));
      if (callback.error) {
        throw new Error(
          callback.error === 'access_denied'
            ? 'Spotify access was not granted.'
            : `Spotify sign-in failed: ${callback.error}`,
        );
      }
      if (callback.state !== state) {
        throw new Error('Sign-in response did not match this request. Please try again.');
      }
      if (!callback.code) {
        throw new Error('Spotify did not return an authorization code.');
      }

      await this.requestToken({
        grant_type: 'authorization_code',
        code: callback.code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
        client_id: SPOTIFY_CLIENT_ID,
        code_verifier: verifier,
      });
    } catch (error) {
      if (!(error instanceof AuthCancelledError)) {
        console.error('[auth]', error);
        this.error.set(messageOf(error));
      }
    } finally {
      this.busy.set(false);
    }
  }

  hasScope(scope: string): boolean {
    return (this.session()?.scope ?? '').split(' ').includes(scope);
  }

  cancelSignIn() {
    cancelAuthorization();
  }

  signOut() {
    this.refreshing = null;
    this.session.set(null);
    ApplicationSettings.remove(STORAGE_KEY);
  }

  async accessToken(forceRefresh = false): Promise<string> {
    const session = this.session();
    if (!session) {
      throw new Error('Not signed in');
    }
    if (!forceRefresh && session.expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
      return session.accessToken;
    }
    // Concurrent callers share one refresh.
    this.refreshing ??= this.requestToken({
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
      client_id: SPOTIFY_CLIENT_ID,
    })
      .catch((error) => {
        // Only a rejected refresh token ends the session.
        if (error instanceof TokenError && error.status === 400) {
          this.signOut();
          this.error.set('Your Spotify session has ended. Please sign in again.');
        }
        throw error;
      })
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }

  private async requestToken(params: Record<string, string>): Promise<string> {
    const response = await httpRequest(
      'POST',
      `${ACCOUNTS_URL}/api/token`,
      { 'Content-Type': 'application/x-www-form-urlencoded' },
      toQuery(params),
    );
    const body = jsonOf(response);
    if (response.status < 200 || response.status >= 300 || !body?.access_token) {
      console.error('[auth] token endpoint', response.status, response.text.slice(0, 200));
      throw new TokenError(
        response.status,
        body?.error_description ?? body?.error ?? `Spotify sign-in failed (HTTP ${response.status}).`,
      );
    }
    const previous = this.session();
    const session: StoredSession = {
      accessToken: body.access_token,
      // The refresh token isn't always rotated.
      refreshToken: body.refresh_token ?? previous?.refreshToken ?? '',
      expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000,
      scope: body.scope ?? previous?.scope ?? '',
    };
    ApplicationSettings.setString(STORAGE_KEY, JSON.stringify(session));
    this.session.set(session);
    return session.accessToken;
  }
}

class TokenError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function load(): StoredSession | null {
  try {
    const raw = ApplicationSettings.getString(STORAGE_KEY);
    const session = raw ? (JSON.parse(raw) as StoredSession) : null;
    return session?.refreshToken ? session : null;
  } catch {
    return null;
  }
}

export function messageOf(error: unknown): string {
  return String((error as any)?.message ?? error);
}
