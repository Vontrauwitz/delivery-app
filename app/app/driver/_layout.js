import { ActivityIndicator, View } from 'react-native';
import { Redirect, Slot } from 'expo-router';
import { useAuth } from '../../src/modules/auth/useAuth';
import { ROLES } from '../../src/shared/constants';

export default function DriverLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (user.role !== ROLES.DRIVER) {
    return <Redirect href="/" />;
  }

  return <Slot />;
}
