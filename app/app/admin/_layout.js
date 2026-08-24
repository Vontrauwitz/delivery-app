import { Slot } from 'expo-router';
import AuthGate from '../../src/modules/auth/AuthGate';
import { ROLES } from '../../src/shared/constants';

export default function AdminLayout() {
  return (
    <AuthGate requiredRole={[ROLES.MANAGER, ROLES.ADMIN]}>
      <Slot />
    </AuthGate>
  );
}
