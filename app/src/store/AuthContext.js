import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as authApi from '../modules/auth/api';

const TOKEN_KEY = 'delivery-app:token';
// While we can't confirm the stored token one way or the other, retry this often — independent
// of AppState events, since a killed-and-relaunched app (common on Android after a long
// background) never fires a background->active transition to hang a retry off of.
const OFFLINE_RETRY_MS = 4000;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  // Set only when the stored token could not be validated for a reason OTHER than the backend
  // explicitly rejecting it — offline, backend temporarily unreachable (e.g. the Mac sleeping or
  // restarting), a momentary 5xx. The token stays in AsyncStorage the whole time; this is not a
  // sign-out, just "we couldn't confirm yet".
  const [authError, setAuthError] = useState('');
  const authErrorRef = useRef('');
  const appStateRef = useRef(AppState.currentState);

  // The single source of truth every route guard reads instead of reasoning about isLoading/user
  // separately — that's exactly what let a network hiccup get treated as "logged out" before.
  //   RESTORING          — first check of the stored token, still in flight.
  //   AUTHENTICATED      — confirmed valid: user is set, safe to render protected screens.
  //   TEMPORARILY_OFFLINE— couldn't confirm (no backend response, or a 5xx), token still held, NOT a logout.
  //   UNAUTHENTICATED    — confirmed invalid (no token, a 401/403, or a 404 from GET /me for a
  //                        stale token whose user no longer exists): show the login screen.
  const status = isLoading
    ? 'RESTORING'
    : user
    ? 'AUTHENTICATED'
    : authError
    ? 'TEMPORARILY_OFFLINE'
    : 'UNAUTHENTICATED';

  useEffect(() => {
    authErrorRef.current = authError;
  }, [authError]);

  useEffect(() => {
    restoreSession();
  }, []);

  // If the last restore attempt couldn't even reach the backend, retry when the app returns to
  // the foreground — the same "Mac woke up, backend is back" moment that used to destroy a
  // perfectly valid session. Never retries just because a session is already established.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active' && authErrorRef.current) {
        restoreSession();
      }
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, []);

  // Belt-and-suspenders for the AppState listener above: an Android app killed and relaunched
  // after a long background never emits a background->active transition to hang a retry off of
  // — it's just a fresh mount. Polling while genuinely stuck offline is what makes "the backend
  // comes back" self-heal without the user having to background/foreground or reload manually.
  useEffect(() => {
    if (!authError) {
      return undefined;
    }
    const interval = setInterval(restoreSession, OFFLINE_RETRY_MS);
    return () => clearInterval(interval);
  }, [authError]);

  async function restoreSession() {
    try {
      const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
      if (!storedToken) {
        setAuthError('');
        return;
      }
      const me = await authApi.getMe(storedToken);
      setToken(storedToken);
      setUser(me);
      setAuthError('');
    } catch (err) {
      // A confirmed rejection of THIS token by the backend means the session itself is invalid
      // — that's when we sign out:
      //   401/403 — the token itself is rejected (missing, malformed, expired).
      //   404     — the token is well-formed and was accepted by the auth middleware, but
      //             GET /me found no matching user. That only happens for a stale JWT whose
      //             user record is gone (e.g. a dev DB reset/reseed while the browser still
      //             held the old token) — genuinely invalid, not a connectivity problem. This
      //             404 handling is specific to session restoration (GET /me); it does not
      //             generalize to how the rest of the app treats a 404.
      // Anything else — no `.status` at all (network failure) or a 5xx — is not proof the
      // session is invalid, and must never delete a token that may still be perfectly valid
      // once the backend is reachable again.
      if (err.status === 401 || err.status === 403 || err.status === 404) {
        await AsyncStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
        setAuthError('');
      } else {
        setAuthError(err.message || 'No se pudo conectar con el servidor');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function signIn(email, password) {
    const { token: newToken, user: newUser } = await authApi.login(email, password);
    await AsyncStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
    setAuthError('');
  }

  async function signOut() {
    await AsyncStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setAuthError('');
  }

  const value = { status, token, user, isLoading, authError, signIn, signOut, retryRestoreSession: restoreSession };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
}
