import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

// Standard header for every non-dashboard screen: a title, an optional "back to dashboard"
// link (so no screen is a dead end), and an optional refresh action. Centralizing this avoids
// each screen re-implementing its own title/refresh row with slightly different styling.
export default function ScreenHeader({ title, backHref, onRefresh, refreshing }) {
  const router = useRouter();

  return (
    <View style={styles.container}>
      {backHref ? (
        <Pressable onPress={() => router.push(backHref)} hitSlop={8}>
          <Text style={styles.back}>← Panel</Text>
        </Pressable>
      ) : null}
      <View style={styles.row}>
        <Text style={styles.title}>{title}</Text>
        {onRefresh ? (
          <Pressable onPress={onRefresh} disabled={refreshing} hitSlop={8}>
            <Text style={[styles.refresh, refreshing && styles.refreshDisabled]}>
              {refreshing ? 'Actualizando…' : 'Actualizar'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  back: { color: '#2563eb', fontSize: 14, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 22, fontWeight: 'bold', flexShrink: 1 },
  refresh: { color: '#2563eb', fontSize: 14 },
  refreshDisabled: { color: '#93c5fd' },
});
