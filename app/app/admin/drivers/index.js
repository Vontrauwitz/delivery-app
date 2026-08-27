import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/modules/auth/useAuth';
import * as usersApi from '../../../src/modules/users/api';
import NeoCard from '../../../src/modules/dashboard/NeoCard';
import { neoColors, neoSpacing, neoRadii, neoTypography } from '../../../src/shared/neoTheme';

// "← Configuración" back-row, matching the same pattern used by Reabastecimiento and
// Programación — Choferes has no entry point other than Configuración, so its back action
// returns there (not the dashboard), consistent with the rest of this subsystem.
function Header({ onBack }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.backRow} onPress={onBack} hitSlop={8}>
        <Ionicons name="chevron-back" size={18} color={neoColors.primary} />
        <Text style={styles.backRowText}>Configuración</Text>
      </Pressable>
      <Text style={styles.title}>Choferes</Text>
    </View>
  );
}

// Compact single-row card — avatar placeholder, name + email stacked, status pill, chevron. The
// whole row is the tap target, so there's exactly one obvious way to manage a given driver.
function DriverRow({ driver, onPress }) {
  return (
    <NeoCard onPress={onPress} style={styles.rowWrap} contentStyle={styles.rowContent}>
      <Ionicons name="person-circle-outline" size={34} color={neoColors.textSecondary} />
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>
          {driver.name}
        </Text>
        <Text style={styles.rowEmail} numberOfLines={1}>
          {driver.email}
        </Text>
      </View>
      <View style={[styles.statusPill, driver.active ? styles.statusPillActive : styles.statusPillInactive]}>
        <Text style={[styles.statusPillText, driver.active ? styles.statusPillTextActive : styles.statusPillTextInactive]}>
          {driver.active ? 'Activo' : 'Inactivo'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={neoColors.textTertiary} />
    </NeoCard>
  );
}

export default function DriversScreen() {
  const { token } = useAuth();
  const router = useRouter();

  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const users = await usersApi.listUsers(token);
      setDrivers(users.filter((u) => u.role === 'driver'));
    } catch (err) {
      setError(err.message || 'No se pudo cargar la lista de choferes');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Header onBack={() => router.replace('/admin/settings')} />

      <Pressable style={styles.newButton} onPress={() => router.push('/admin/drivers/new')}>
        <Text style={styles.newButtonText}>+ Nuevo chofer</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color={neoColors.primary} style={{ marginTop: neoSpacing.xl }} />
      ) : drivers.length === 0 ? (
        <Text style={styles.empty}>No hay choferes registrados todavía.</Text>
      ) : (
        drivers.map((driver) => <DriverRow key={driver._id} driver={driver} onPress={() => router.push(`/admin/drivers/${driver._id}`)} />)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neoColors.background },
  content: { padding: neoSpacing.lg, paddingBottom: neoSpacing.xxl },

  header: { marginBottom: neoSpacing.lg },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginBottom: neoSpacing.md },
  backRowText: { color: neoColors.primary, fontWeight: '700', fontSize: 14 },
  title: { ...neoTypography.title, color: neoColors.ink },

  newButton: {
    backgroundColor: neoColors.primary,
    borderRadius: neoRadii.md,
    paddingVertical: neoSpacing.md,
    alignItems: 'center',
    marginBottom: neoSpacing.lg,
  },
  newButtonText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  error: { color: neoColors.danger, fontWeight: '700', marginBottom: neoSpacing.sm },
  empty: { color: neoColors.textSecondary, marginTop: neoSpacing.md },

  rowWrap: { width: '100%' },
  rowContent: { flexDirection: 'row', alignItems: 'center', gap: neoSpacing.sm, padding: neoSpacing.md },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '800', color: neoColors.ink },
  rowEmail: { ...neoTypography.caption, color: neoColors.textSecondary, marginTop: 1 },

  statusPill: { borderRadius: neoRadii.full, paddingHorizontal: neoSpacing.sm, paddingVertical: 4 },
  statusPillActive: { backgroundColor: neoColors.successMuted },
  statusPillInactive: { backgroundColor: neoColors.neutralMuted },
  statusPillText: { fontSize: 11, fontWeight: '800' },
  statusPillTextActive: { color: neoColors.success },
  statusPillTextInactive: { color: neoColors.textSecondary },
});
