import { type NavigateOptions, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

/**
 * Navigates once when `when` becomes true. Unlike <Navigate>, re-renders (e.g. from query or
 * session updates) never start a new navigation, which would supersede the pending one forever.
 */
export function useRedirectOnce(when: boolean, options: () => NavigateOptions) {
  const navigate = useNavigate();
  const done = useRef(false);
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    if (!when) {
      done.current = false;
      return;
    }
    if (done.current) return;
    done.current = true;
    void navigate(latest.current());
  }, [when, navigate]);
}
