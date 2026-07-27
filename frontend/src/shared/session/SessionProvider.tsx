/**
 * Session context — the frontend's view of who is signed in.
 *
 * ⚠️ CONVENIENCE, NOT ENFORCEMENT (US-ENB-01).
 *
 * Everything here exists to avoid showing people buttons that will fail. It is NOT access
 * control: the role in this context came from the server, but a user can edit it in devtools
 * in five seconds. Every rule is enforced server-side, and `api.test.ts` proves a TEAM_MEMBER
 * calling the API directly is refused on six separate routes.
 *
 * If you find yourself relying on `RequireRole` to protect data rather than to tidy a screen,
 * the protection is missing on the server.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, setUnauthorizedHandler } from '../api/client';
import type { SessionResponse, SessionUser, UserRole } from '../api/types';

interface SessionState {
  user: SessionUser | null;
  ownMemberId: string | null;
  loading: boolean;
  /** Set when a session ended mid-use, so sign-in can explain why (US-ACC-02). */
  expiredNotice: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearExpiredNotice: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }): JSX.Element {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ownMemberId, setOwnMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expiredNotice, setExpiredNotice] = useState(false);

  /**
   * Clears everything a signed-out user must not keep.
   *
   * The query cache is wiped, not merely invalidated: leaving another user's member list in
   * memory across a sign-out means the next person to sign in on the same browser could see
   * it flash on screen before the refetch lands.
   */
  const clearSession = useCallback(() => {
    setUser(null);
    setOwnMemberId(null);
    queryClient.clear();
  }, [queryClient]);

  /** Any unexpected 401 means the session died mid-use. */
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setExpiredNotice(true);
      clearSession();
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  /** Resolve the existing cookie on load, so a refresh does not force a re-login. */
  useEffect(() => {
    let cancelled = false;

    void api
      .get<SessionResponse>('/api/auth/session')
      .then((response) => {
        if (cancelled) return;
        if (response.authenticated && response.user) {
          setUser(response.user);
          setOwnMemberId(response.scope?.ownMemberId ?? null);
        }
      })
      .catch(() => {
        // No session is a normal state on first load, not an error worth surfacing.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const response = await api.post<{ user: SessionUser; scope: { ownMemberId: string | null } }>(
        '/api/auth/login',
        { username, password },
      );
      setUser(response.user);
      setOwnMemberId(response.scope.ownMemberId);
      setExpiredNotice(false);
      // Anything cached before sign-in belonged to nobody, or to the previous user.
      queryClient.clear();
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      // Cleared even if the request failed: the user asked to leave, and a client that still
      // shows their data because the network hiccuped is worse than one that clears eagerly.
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo<SessionState>(
    () => ({
      user,
      ownMemberId,
      loading,
      expiredNotice,
      signIn,
      signOut,
      clearExpiredNotice: () => setExpiredNotice(false),
    }),
    [user, ownMemberId, loading, expiredNotice, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside a SessionProvider.');
  }
  return context;
}

/**
 * Renders children only for permitted roles.
 *
 * ⚠️ Hides UI. Does not protect data. See the file header.
 */
export function RequireRole({
  roles,
  children,
  fallback = null,
}: {
  roles: UserRole[];
  children: ReactNode;
  fallback?: ReactNode;
}): JSX.Element {
  const { user } = useSession();
  const permitted = user !== null && roles.includes(user.role);
  return <>{permitted ? children : fallback}</>;
}

/** The roles that may write (BR-R-01). Mirrors the server, which is the authority. */
export const WRITE_ROLES: UserRole[] = ['ADMIN', 'RESOURCE_MANAGER'];

export function useCanWrite(): boolean {
  const { user } = useSession();
  return user !== null && WRITE_ROLES.includes(user.role);
}
