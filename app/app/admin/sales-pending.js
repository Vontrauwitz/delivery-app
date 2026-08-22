import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as approvalsApi from '../../src/modules/approvals/api';
import { formatCurrency } from '../../src/shared/money';
import ScreenHeader from '../../src/shared/ScreenHeader';

export default function SalesPendingScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await approvalsApi.listPendingSales(token);
      setSales(data);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las ventas pendientes');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Ventas pendientes" backHref="/admin" onRefresh={load} refreshing={loading} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={sales}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No hay ventas pendientes.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => router.push(`/admin/sale/${item._id}`)}>
              <View style={styles.cardRow}>
                <Text style={styles.driver}>{item.driver?.name}</Text>
                <Text style={styles.total}>{formatCurrency(item.totalFinal)}</Text>
              </View>
              <Text style={styles.date}>Creada: {new Date(item.createdAt).toLocaleString()}</Text>
              <Text style={styles.itemsCount}>{item.items.length} producto(s)</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  error: { color: '#dc2626', marginBottom: 8 },
  empty: { color: '#666', marginTop: 20, textAlign: 'center' },
  list: { paddingBottom: 20 },
  card: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  driver: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  total: { fontSize: 16, fontWeight: '700' },
  date: { fontSize: 13, color: '#666' },
  itemsCount: { fontSize: 13, color: '#666', marginTop: 2 },
});
