import type { AuthResponse, User } from '@nexora/contracts';
import { useSyncExternalStore } from 'react';

export interface Session {
  token: string;
  user: User;
  expiresAt: number;
}

const KEY = 'nexora.session';
const listeners = new Set<() => void>();
let current: Session | null = read();

function read(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed.token || !parsed.user || parsed.expiresAt <= Date.now()) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function emit() {
  listeners.forEach((listener) => listener());
}

/**
 * Access-token session. Stored in localStorage so it survives reloads; the token is short-lived (2h by default)
 * and the API re-validates it on every request. See docs/security.md for the trade-offs.
 */
export const session = {
  get(): Session | null {
    if (current && current.expiresAt <= Date.now()) session.clear();
    return current;
  },
  set(auth: AuthResponse) {
    current = { token: auth.accessToken, user: auth.user, expiresAt: Date.now() + auth.expiresIn * 1000 };
    try {
      localStorage.setItem(KEY, JSON.stringify(current));
    } catch {
      // Storage may be unavailable (private mode); the in-memory session still works for this tab.
    }
    emit();
  },
  updateUser(user: User) {
    if (!current) return;
    current = { ...current, user };
    try {
      localStorage.setItem(KEY, JSON.stringify(current));
    } catch {
      /* ignore */
    }
    emit();
  },
  clear() {
    if (!current) return;
    current = null;
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    emit();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

// Keep tabs in sync: signing out in one tab signs out everywhere.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY) return;
    current = read();
    emit();
  });
}

export function useSession(): Session | null {
  return useSyncExternalStore(session.subscribe, session.get, session.get);
}
