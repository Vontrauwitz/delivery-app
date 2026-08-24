import { Redirect } from 'expo-router';
import { useAuth } from '../src/modules/auth/useAuth';
import AuthPendingView from '../src/modules/auth/AuthPendingView';
import { ROLES } from '../src/shared/constants';

export default function Index() {
  const { status, user, authError } = useAuth();

  if (status === 'RESTORING' || status === 'TEMPORARILY_OFFLINE') {
    return <AuthPendingView status={status} authError={authError} />;
  }

  if (status === 'UNAUTHENTICATED') {
    return <Redirect href="/login" />;
  }

  if (user.role === ROLES.DRIVER) {
    return <Redirect href="/driver" />;
  }

  return <Redirect href="/admin" />;
}
