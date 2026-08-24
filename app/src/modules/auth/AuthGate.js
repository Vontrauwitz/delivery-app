import { Redirect } from 'expo-router';
import { useAuth } from './useAuth';
import AuthPendingView from './AuthPendingView';

// The single guard every protected layout uses — the one place that decides between showing a
// pending state, redirecting to login, or rendering the protected screen. Only a CONFIRMED
// invalid session (no token, or a real 401/403) ever redirects to /login; RESTORING and
// TEMPORARILY_OFFLINE both just wait.
//
// `children` must not reference `user` — it's evaluated by the caller before this component runs
// its checks, so `user` may still be null at that point. Put role-gating in `requiredRole`
// instead, which is only evaluated here, after `status === 'AUTHENTICATED'` guarantees `user` exists.
export default function AuthGate({ children, requiredRole, fallbackHref = '/' }) {
  const { status, user, authError } = useAuth();

  if (status === 'RESTORING' || status === 'TEMPORARILY_OFFLINE') {
    return <AuthPendingView status={status} authError={authError} />;
  }

  if (status === 'UNAUTHENTICATED') {
    return <Redirect href="/login" />;
  }

  const roleAllowed = !requiredRole || (Array.isArray(requiredRole) ? requiredRole.includes(user.role) : user.role === requiredRole);
  if (!roleAllowed) {
    return <Redirect href={fallbackHref} />;
  }

  return children;
}
