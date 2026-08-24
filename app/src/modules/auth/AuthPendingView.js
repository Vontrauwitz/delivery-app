import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../shared/theme';

// Shown while auth status is RESTORING or TEMPORARILY_OFFLINE — never while UNAUTHENTICATED
// (that's a real redirect to /login) and never while AUTHENTICATED (that's the real screen).
// A network hiccup must look like "give it a moment", not like a login form.
export default function AuthPendingView({ status, authError }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
      {status === 'TEMPORARILY_OFFLINE' && (
        <>
          <Text style={styles.message}>Reconectando…</Text>
          {authError ? <Text style={styles.subMessage}>{authError}</Text> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  message: { ...typography.body, color: colors.textSecondary, marginTop: spacing.md, textAlign: 'center' },
  subMessage: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs, textAlign: 'center' },
});
