import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as locationsApi from '../../src/modules/locations/api';
import * as dispatchApi from '../../src/modules/dispatch/api';
import { openInMaps } from '../../src/shared/openInMaps';
import NeoCard from '../../src/modules/dashboard/NeoCard';
import { DISPATCH_STATUS_LABELS, DISPATCH_STATUS_COLORS } from '../../src/shared/constants';
import { neoColors, neoSpacing, neoRadii, neoTypography } from '../../src/shared/neoTheme';

// No in-app map canvas exists in this project yet (no react-native-maps / mapping provider —
// adding one now would mean a native rebuild plus, on Android, a paid Google Maps API key, which
// this checkpoint explicitly does not select without approval). This screen is the operational
// picture instead: driver + destination state, assignment, and freshness as a board — each
// item's "Abrir en mapa" reuses the exact same platform-safe deep link Dispatch already uses to
// hand off to the device's own native maps app for actual geography.
function Header({ onHome }) {
  return (
    <View style={styles.headerRow}>
      <Text style={styles.title}>Mapa operativo</Text>
      <Pressable style={styles.iconButton} onPress={onHome} hitSlop={8}>
        <Ionicons name="home-outline" size={18} color={neoColors.ink} />
      </Pressable>
    </View>
  );
}

function driverMapsUrl(location) {
  if (!location) return null;
  return `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
}

function formatFreshness(location, isStale) {
  if (!location) return 'Sin ubicación registrada';
  const ageMs = Date.now() - new Date(location.serverTimestamp).getTime();
  const ageMin = Math.round(ageMs / 60000);
  const ageLabel = ageMin < 1 ? 'hace instantes' : `hace ${ageMin} min`;
  return isStale ? `Desactualizada (${ageLabel})` : `Actualizada (${ageLabel})`;
}

export default function AdminMapScreen() {
  const { token } = useAuth();
  const router = useRouter();

  const [driverLocations, setDriverLocations] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [locations, dispatchList] = await Promise.all([locationsApi.getCurrentLocations(token), dispatchApi.listAll(token)]);
      setDriverLocations(locations);
      setDispatches(dispatchList);
    } catch (err) {
      setError(err.message || 'No se pudo cargar el mapa operativo');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const activeDispatches = useMemo(() => dispatches.filter((d) => d.status === 'PENDING' || d.status === 'ACCEPTED'), [dispatches]);
  const unassigned = useMemo(() => dispatches.filter((d) => d.status === 'UNASSIGNED'), [dispatches]);

  const activeStopsByDriver = useMemo(() => {
    const map = new Map();
    for (const d of activeDispatches) {
      const key = d.driver?._id;
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [activeDispatches]);

  const visibleDrivers = useMemo(
    () => (selectedDriverId === 'ALL' ? driverLocations : driverLocations.filter((dl) => dl.driver._id === selectedDriverId)),
    [driverLocations, selectedDriverId]
  );
  const visibleActiveDispatches = useMemo(
    () => (selectedDriverId === 'ALL' ? activeDispatches : activeDispatches.filter((d) => d.driver?._id === selectedDriverId)),
    [activeDispatches, selectedDriverId]
  );

  function renderDestinationCard(d) {
    return (
      <NeoCard key={d._id} accentColor={DISPATCH_STATUS_COLORS[d.status]} style={styles.cardWrap} contentStyle={styles.cardBody}>
        <View style={styles.rowBetween}>
          <Text style={styles.destinationLabel} numberOfLines={1}>
            {d.destinationLabel || d.address}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: `${DISPATCH_STATUS_COLORS[d.status]}22` }]}>
            <Text style={[styles.statusPillText, { color: DISPATCH_STATUS_COLORS[d.status] }]}>{DISPATCH_STATUS_LABELS[d.status]}</Text>
          </View>
        </View>
        {d.driver ? <Text style={styles.meta}>{d.driver.name}</Text> : null}
        <Pressable onPress={() => openInMaps(d.mapsUrl)}>
          <Text style={[styles.meta, styles.link]}>{d.address}</Text>
        </Pressable>
        {d.latitude == null && <Text style={styles.metaMuted}>Sin coordenadas — solo dirección de texto</Text>}
      </NeoCard>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Header onHome={() => router.push('/admin')} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.summaryRow}>
        <NeoCard style={styles.summaryCard} contentStyle={styles.summaryCardBody}>
          <Text style={styles.summaryValue}>{driverLocations.length}</Text>
          <Text style={styles.summaryLabel}>choferes</Text>
        </NeoCard>
        <NeoCard style={styles.summaryCard} contentStyle={styles.summaryCardBody}>
          <Text style={styles.summaryValue}>{activeDispatches.length}</Text>
          <Text style={styles.summaryLabel}>paradas activas</Text>
        </NeoCard>
        <NeoCard style={styles.summaryCard} contentStyle={styles.summaryCardBody}>
          <Text style={styles.summaryValue}>{unassigned.length}</Text>
          <Text style={styles.summaryLabel}>sin asignar</Text>
        </NeoCard>
      </View>

      <View style={styles.chipRow}>
        <Pressable style={[styles.chip, selectedDriverId === 'ALL' && styles.chipActive]} onPress={() => setSelectedDriverId('ALL')}>
          <Text style={[styles.chipText, selectedDriverId === 'ALL' && styles.chipTextActive]}>Todos los choferes</Text>
        </Pressable>
        {driverLocations.map((dl) => (
          <Pressable
            key={dl.driver._id}
            style={[styles.chip, selectedDriverId === dl.driver._id && styles.chipActive]}
            onPress={() => setSelectedDriverId(dl.driver._id)}
          >
            <Text style={[styles.chipText, selectedDriverId === dl.driver._id && styles.chipTextActive]}>{dl.driver.name}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Choferes</Text>
      {loading ? (
        <ActivityIndicator color={neoColors.primary} style={{ marginTop: neoSpacing.md }} />
      ) : visibleDrivers.length === 0 ? (
        <Text style={styles.empty}>No hay choferes que mostrar.</Text>
      ) : (
        visibleDrivers.map((dl) => (
          <NeoCard key={dl.driver._id} style={styles.cardWrap} contentStyle={styles.cardBody}>
            <View style={styles.rowBetween}>
              <Text style={styles.destinationLabel}>{dl.driver.name}</Text>
              <Text style={styles.stopCount}>{activeStopsByDriver.get(dl.driver._id) || 0} paradas activas</Text>
            </View>
            {dl.vehicle ? <Text style={styles.meta}>{dl.vehicle.name}</Text> : null}
            <Text style={[styles.meta, dl.isStale && styles.metaWarning]}>{formatFreshness(dl.location, dl.isStale)}</Text>
            {dl.location && (
              <Pressable onPress={() => openInMaps(driverMapsUrl(dl.location))}>
                <Text style={[styles.meta, styles.link]}>Abrir última ubicación en mapa</Text>
              </Pressable>
            )}
          </NeoCard>
        ))
      )}

      <Text style={styles.sectionTitle}>Destinos activos</Text>
      {loading ? (
        <ActivityIndicator color={neoColors.primary} style={{ marginTop: neoSpacing.md }} />
      ) : visibleActiveDispatches.length === 0 ? (
        <Text style={styles.empty}>Sin destinos activos para esta selección.</Text>
      ) : (
        visibleActiveDispatches.map(renderDestinationCard)
      )}

      {selectedDriverId === 'ALL' && (
        <>
          <Text style={styles.sectionTitle}>Sin asignar {unassigned.length > 0 ? `(${unassigned.length})` : ''}</Text>
          {unassigned.length === 0 ? (
            <Text style={styles.empty}>No hay destinos sin asignar.</Text>
          ) : (
            <>
              {unassigned.slice(0, 5).map(renderDestinationCard)}
              <Pressable style={styles.panelLink} onPress={() => router.push('/admin/dispatch')}>
                <Text style={styles.panelLinkText}>Ir a Dispatch para asignarlos →</Text>
              </Pressable>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neoColors.background },
  content: { padding: neoSpacing.lg, paddingBottom: neoSpacing.xxl },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: neoSpacing.lg },
  title: { ...neoTypography.title, color: neoColors.ink },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: neoRadii.md,
    borderWidth: 2,
    borderColor: neoColors.ink,
    backgroundColor: neoColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  error: { color: neoColors.danger, fontWeight: '700', marginBottom: neoSpacing.sm },
  empty: { color: neoColors.textSecondary, marginTop: neoSpacing.sm },

  summaryRow: { flexDirection: 'row', gap: neoSpacing.sm, marginBottom: neoSpacing.lg },
  summaryCard: { flex: 1 },
  summaryCardBody: { padding: neoSpacing.md, alignItems: 'center' },
  summaryValue: { ...neoTypography.display, fontSize: 28, color: neoColors.ink },
  summaryLabel: { ...neoTypography.caption, color: neoColors.textSecondary, marginTop: 2, textAlign: 'center' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: neoSpacing.sm, marginBottom: neoSpacing.md },
  chip: { borderWidth: 2, borderColor: neoColors.ink, borderRadius: neoRadii.full, paddingHorizontal: neoSpacing.md, paddingVertical: neoSpacing.sm, backgroundColor: neoColors.surface },
  chipActive: { backgroundColor: neoColors.primary, borderColor: neoColors.primary },
  chipText: { color: neoColors.ink, fontWeight: '700' },
  chipTextActive: { color: '#fff' },

  sectionTitle: { ...neoTypography.title, fontSize: 18, color: neoColors.ink, marginTop: neoSpacing.lg, marginBottom: neoSpacing.md },

  cardWrap: { marginBottom: neoSpacing.md },
  cardBody: { padding: neoSpacing.md },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: neoSpacing.xs },
  destinationLabel: { fontSize: 15, fontWeight: '800', color: neoColors.ink, flexShrink: 1 },
  meta: { ...neoTypography.caption, color: neoColors.textSecondary, marginTop: neoSpacing.xs },
  metaMuted: { ...neoTypography.caption, color: neoColors.textTertiary, marginTop: neoSpacing.xs, fontStyle: 'italic' },
  metaWarning: { color: neoColors.warning, fontWeight: '700' },
  link: { color: neoColors.primary },
  stopCount: { ...neoTypography.caption, color: neoColors.textSecondary, fontWeight: '700' },
  statusPill: { borderRadius: neoRadii.full, paddingHorizontal: neoSpacing.sm, paddingVertical: 4 },
  statusPillText: { fontSize: 11, fontWeight: '800' },

  panelLink: { marginTop: neoSpacing.sm, alignItems: 'center' },
  panelLinkText: { ...neoTypography.caption, color: neoColors.primary },
});
