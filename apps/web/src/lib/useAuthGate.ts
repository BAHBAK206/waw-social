import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useSession } from './session';

/** Wraps an action that needs a signed-in user; guests are sent to the login page and return afterwards. */
export function useAuthGate() {
  const navigate = useNavigate();
  const location = useLocation();
  const authed = useSession((s) => s.status === 'authed');
  return useCallback(
    <A extends unknown[]>(fn: (...args: A) => unknown) =>
      (...args: A) => {
        if (authed) return fn(...args);
        navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
        return undefined;
      },
    [authed, navigate, location.pathname, location.search],
  );
}
