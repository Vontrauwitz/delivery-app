import { Slot } from 'expo-router';
import AuthGate from '../../src/modules/auth/AuthGate';
import { ROLES } from '../../src/shared/constants';

export default function DriverLayout() {
  return (
    <AuthGate requiredRole={ROLES.DRIVER}>
      <Slot />
    </AuthGate>
  );
}
