const KEY = 'nexora.lastWorkspace';

/** Per-browser convenience only; the server remains the source of truth for access. */
export const lastWorkspace = {
  get(): string | null {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(workspaceId: string) {
    try {
      localStorage.setItem(KEY, workspaceId);
    } catch {
      /* ignore */
    }
  },
};
