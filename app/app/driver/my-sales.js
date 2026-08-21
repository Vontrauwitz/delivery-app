import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as salesApi from '../../src/modules/sales/api';
import { formatCurrency } from '../../src/shared/money';
import { SALE_STATUS_LABELS, SALE_STATUS_COLORS } from '../../src/shared/constants';

export default function MySalesScreen() {
  const { token } = useAuth();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await salesApi.listMySales(token);
      setSales(data);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar tus ventas');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Mis ventas</Text>
        <Pressable onPress={load}>
          <Text style={styles.refresh}>Actualizar</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={sales}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no has registrado ventas.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.total}>{formatCurrency(item.totalFinal)}</Text>
                <Text style={[styles.status, { color: SALE_STATUS_COLORS[item.status] }]}>
                  {SALE_STATUS_LABELS[item.status]}
                </Text>
              </View>
              <Text style={styles.date}>{new Date(item.createdAt).toLocaleString()}</Text>
              <Text style={styles.itemsCount}>{item.items.length} producto(s)</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: 'bold' },
  refresh: { color: '#2563eb', fontSize: 14 },
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
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  total: { fontSize: 18, fontWeight: '700' },
  status: { fontSize: 14, fontWeight: '600' },
  date: { fontSize: 13, color: '#666' },
  itemsCount: { fontSize: 13, color: '#666', marginTop: 2 },
});
