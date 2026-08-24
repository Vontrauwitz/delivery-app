import { Slot } from 'expo-router';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/store/AuthContext';

// Applies the top safe-area inset once, for every screen, instead of each screen guessing a
// status-bar height. Only the top edge is handled here — screens already manage their own
// bottom padding (scroll content, keyboard-avoiding forms, etc), so we don't want to double up.
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <Slot />
        </SafeAreaView>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
