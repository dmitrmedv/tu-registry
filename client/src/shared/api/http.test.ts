import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiError, makeUser, server } from '@/test/server';
import { authEvents } from './authEvents';
import { http } from './http';
import { tokenStore } from './tokenStore';

/** A protected endpoint that accepts only the "fresh" token. */
const protectedPing = mock.get('*/api/v1/ping', ({ request }) =>
  request.headers.get('authorization') === 'Bearer fresh'
    ? HttpResponse.json({ ok: true })
    : apiError(401, 'TOKEN_INVALID'),
);

function collectEvents() {
  const events: string[] = [];
  const unsubscribe = authEvents.subscribe((event) => events.push(event));
  return { events, unsubscribe };
}

describe('http client', () => {
  it('refreshes once for concurrent 401 responses and retries each request', async () => {
    let refreshCalls = 0;
    server.use(
      protectedPing,
      mock.post('*/api/v1/auth/refresh', () => {
        refreshCalls++;
        return HttpResponse.json({ user: makeUser(), accessToken: 'fresh' });
      }),
    );
    tokenStore.set('stale');

    const responses = await Promise.all([http.get('/ping'), http.get('/ping'), http.get('/ping')]);

    expect(responses.map((r) => r.data)).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refreshCalls).toBe(1);
    expect(tokenStore.get()).toBe('fresh');
  });

  it('ends the session when the refresh fails', async () => {
    server.use(
      protectedPing,
      mock.post('*/api/v1/auth/refresh', () => apiError(401, 'SESSION_ENDED')),
    );
    tokenStore.set('stale');
    const { events, unsubscribe } = collectEvents();

    await expect(http.get('/ping')).rejects.toMatchObject({ response: { status: 401 } });

    expect(events).toEqual(['session-ended']);
    expect(tokenStore.get()).toBeNull();
    unsubscribe();
  });

  it('signals that a password change is required', async () => {
    server.use(mock.get('*/api/v1/users', () => apiError(403, 'PASSWORD_CHANGE_REQUIRED')));
    const { events, unsubscribe } = collectEvents();

    await expect(http.get('/users')).rejects.toBeTruthy();

    expect(events).toEqual(['password-change-required']);
    unsubscribe();
  });

  it('does not try to refresh after a failed login', async () => {
    let refreshCalls = 0;
    server.use(
      mock.post('*/api/v1/auth/login', () => apiError(401, 'INVALID_CREDENTIALS')),
      mock.post('*/api/v1/auth/refresh', () => {
        refreshCalls++;
        return HttpResponse.json({});
      }),
    );

    await expect(http.post('/auth/login', {})).rejects.toBeTruthy();

    expect(refreshCalls).toBe(0);
  });
});
