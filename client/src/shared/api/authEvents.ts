/** Signals from the HTTP layer to the auth state, which lives in React. */
export type AuthEvent = 'session-ended' | 'password-change-required';

type Listener = (event: AuthEvent) => void;
const listeners = new Set<Listener>();

export const authEvents = {
  emit(event: AuthEvent) {
    listeners.forEach((listener) => listener(event));
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
