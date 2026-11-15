// The access token lives only in memory: never in localStorage, where any injected
// script could read it. After a page reload the session is restored via the cookie.
let accessToken: string | null = null;

export const tokenStore = {
  get: () => accessToken,
  set: (token: string | null) => {
    accessToken = token;
  },
};
