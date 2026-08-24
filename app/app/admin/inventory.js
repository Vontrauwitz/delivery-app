import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as usersApi from '../../src/modules/users/api';
import * as productsApi from '../../src/modules/products/api';
import * as inventoryApi from '../../src/modules/inventory/api';
import * as inventoryCountsApi from '../../src/modules/inventoryCounts/api';
import * as replenishmentApi from '../../src/modules/replenishment/api';
import QuantityStepper from '../../src/modules/inventory/QuantityStepper';
import { SESSION_STATUS_LABELS, COUNT_TYPE_LABELS } from '../../src/shared/constants';
import ScreenHeader from '../../src/shared/ScreenHeader';
import { colors, spacing, radii, typography, softShadow } from '../../src/shared/theme';

// Mirrors the driver-facing wording in app/driver/inventory.js — the manager should never see
// technical session jargon, just a plain "is this driver's inventory current" read.
const STATUS_LABELS = { OPEN: 'Al día', CLOSING_PENDING: 'Cierre pendiente', CLOSED: 'Última actualización' };
const STATUS_COLORS = { OPEN: colors.success, CLOSING_PENDING: colors.warning, CLOSED: colors.neutral };

export default function InventoryOverviewScreen() {
  const { token } = useAuth();

  const [drivers, setDrivers] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [current, setCurrent] = useState(null); // { source, session, stock }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [mode, setMode] = useState('idle'); // idle | reponer | conteo | historial

  const [reponerQuantities, setReponerQuantities] = useState({});
  const [reponerSubmitting, setReponerSubmitting] = useState(false);
  const [reponerError, setReponerError] = useState('');

  const [conteoQuantities, setConteoQuantities] = useState({});
  const [conteoSubmitting, setConteoSubmitting] = useState(false);
  const [conteoError, setConteoError] = useState('');
  const [conteoResult, setConteoResult] = useState(null);

  const [historial, setHistorial] = useState([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  const [expandedCounts, setExpandedCounts] = useState([]);

  const loadDriversAndProducts = useCallback(async () => {
    try {
      const [usersData, productsData] = await Promise.all([usersApi.listUsers(token), productsApi.listProducts(token)]);
      const driversData = usersData.filter((u) => u.role === 'driver');
      setDrivers(driversData);
      setProducts(productsData.filter((p) => p.active));
      if (driversData.length > 0) {
        setSelectedDriverId((current) => current || driversData[0]._id);
      }
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los datos');
    }
  }, [token]);

  const loadCurrent = useCallback(async () => {
    if (!selectedDriverId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setCurrent(await inventoryApi.getCurrentStock(token, selectedDriverId));
    } catch (err) {
      setError(err.message || 'No se pudo cargar el inventario');
    } finally {
      setLoading(false);
    }
  }, [token, selectedDriverId]);

  useEffect(() => {
    loadDriversAndProducts();
  }, [loadDriversAndProducts]);

  useEffect(() => {
    setMode('idle');
    loadCurrent();
  }, [loadCurrent]);

  async function startReponer() {
    setMode('reponer');
    setReponerError('');
    const initial = {};
    products.forEach((p) => {
      initial[p._id] = 0;
    });
    setReponerQuantities(initial);
    // Prefill with replenishment suggestions so the manager rarely has to think in raw numbers.
    try {
      const suggestions = await replenishmentApi.getSuggestions(token, selectedDriverId);
      const prefilled = { ...initial };
      suggestions.rows.forEach((row) => {
        if (row.suggestedReplenishment > 0) {
          prefilled[row.product._id] = row.suggestedReplenishment;
        }
      });
      setReponerQuantities(prefilled);
    } catch (err) {
      // Suggestions are a convenience, not a requirement — the form still works with zeros.
    }
  }

  function startConteo() {
    setMode('conteo');
    setConteoError('');
    setConteoResult(null);
    const initial = {};
    (current?.stock || []).forEach((s) => {
      initial[s.product._id] = 0;
    });
    setConteoQuantities(initial);
  }

  async function startHistorial() {
    setMode('historial');
    setExpandedSessionId(null);
    setHistorialLoading(true);
    try {
      setHistorial(await inventoryApi.listSessions(token, { driver: selectedDriverId }));
    } catch (err) {
      setError(err.message || 'No se pudo cargar el historial');
    } finally {
      setHistorialLoading(false);
    }
  }

  async function toggleSessionDetail(sessionId) {
    if (expandedSessionId === sessionId) {
      setExpandedSessionId(null);
      return;
    }
    setExpandedSessionId(sessionId);
    try {
      setExpandedCounts(await inventoryCountsApi.listCountsBySession(token, sessionId));
    } catch (err) {
      setExpandedCounts([]);
    }
  }

  async function submitReponer() {
    setReponerError('');
    const items = products
      .map((p) => ({ product: p._id, quantity: reponerQuantities[p._id] || 0 }))
      .filter((i) => i.quantity > 0);
    if (items.length === 0) {
      setReponerError('Indica la cantidad a reponer de al menos un producto');
      return;
    }
    setReponerSubmitting(true);
    try {
      await inventoryApi.replenish(token, { driver: selectedDriverId, items });
      setMode('idle');
      await loadCurrent();
    } catch (err) {
      setReponerError(err.message || 'No se pudo registrar la reposición');
    } finally {
      setReponerSubmitting(false);
    }
  }

  async function submitConteo() {
    setConteoError('');
    setConteoSubmitting(true);
    try {
      const counts = (current?.stock || []).map((s) => ({
        product: s.product._id,
        quantityCounted: conteoQuantities[s.product._id] || 0,
      }));
      const result = await inventoryCountsApi.createWeeklyCount(token, {
        driver: selectedDriverId,
        counts,
        weekOf: new Date().toISOString(),
      });
      setConteoResult(result);
    } catch (err) {
      setConteoError(err.message || 'No se pudo registrar el conteo');
    } finally {
      setConteoSubmitting(false);
    }
  }

  const selectedDriver = drivers.find((d) => d._id === selectedDriverId);
  const statusLabel = current?.session ? STATUS_LABELS[current.session.status] || current.session.status : null;
  const statusColor = current?.session ? STATUS_COLORS[current.session.status] || colors.neutral : colors.neutral;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader title="Inventario" backHref="/admin" onRefresh={loadCurrent} refreshing={loading} />

      <Text style={styles.sectionTitle}>Chofer</Text>
      <View style={styles.driverRow}>
        {drivers.map((d) => (
          <Pressable
            key={d._id}
            style={[styles.driverChip, d._id === selectedDriverId && styles.driverChipActive]}
            onPress={() => setSelectedDriverId(d._id)}
          >
            <Text style={[styles.driverChipText, d._id === selectedDriverId && styles.driverChipTextActive]}>{d.name}</Text>
          </Pressable>
        ))}
      </View>
      {drivers.length === 0 && <Text style={styles.empty}>No hay choferes registrados.</Text>}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : selectedDriver ? (
        <>
          <View style={styles.driverCard}>
            <View style={styles.driverCardHeader}>
              <Text style={styles.driverName}>{selectedDriver.name}</Text>
              {statusLabel && (
                <View style={[styles.statusPill, { backgroundColor: `${statusColor}22` }]}>
                  <Text style={[styles.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
                </View>
              )}
            </View>
            <Text style={styles.driverCardSubtitle}>Inventario actual</Text>

            {(current?.stock || []).length === 0 ? (
              <Text style={styles.empty}>Este chofer todavía no tiene productos en inventario.</Text>
            ) : (
              current.stock.map((s, index) => (
                <View key={s.product._id} style={[styles.stockRow, index === current.stock.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={styles.stockName}>
                    {s.product.icon} {s.product.name}
                  </Text>
                  <Text style={styles.stockQty}>{s.quantityExpected}</Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.actionsRow}>
            <Pressable style={styles.actionButton} onPress={startReponer}>
              <Text style={styles.actionButtonText}>Reponer</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={startConteo}>
              <Text style={styles.actionButtonText}>Hacer conteo</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={startHistorial}>
              <Text style={styles.actionButtonText}>Historial</Text>
            </Pressable>
          </View>

          {mode === 'reponer' && (
            <View style={styles.formBox}>
              <Text style={styles.sectionTitle}>Reponer productos</Text>
              <Text style={styles.formHint}>Las cantidades sugeridas ya están precargadas — ajústalas si hace falta.</Text>
              <QuantityStepper
                items={products.map((p) => ({ product: p }))}
                quantities={reponerQuantities}
                onChangeQuantity={(id, qty) => setReponerQuantities((prev) => ({ ...prev, [id]: qty }))}
              />
              {reponerError ? <Text style={styles.error}>{reponerError}</Text> : null}
              <View style={styles.formActions}>
                <Pressable style={styles.button} onPress={submitReponer} disabled={reponerSubmitting}>
                  {reponerSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Confirmar reposición</Text>}
                </Pressable>
                <Pressable style={styles.buttonSecondary} onPress={() => setMode('idle')}>
                  <Text style={styles.buttonSecondaryText}>Cancelar</Text>
                </Pressable>
              </View>
            </View>
          )}

          {mode === 'conteo' && (
            <View style={styles.formBox}>
              <Text style={styles.sectionTitle}>Conteo — cantidad física</Text>
              {(current?.stock || []).length === 0 ? (
                <Text style={styles.empty}>Este chofer no tiene productos en inventario para contar.</Text>
              ) : (
                <QuantityStepper
                  items={current.stock.map((s) => ({ product: s.product, note: `Esperado: ${s.quantityExpected}` }))}
                  quantities={conteoQuantities}
                  onChangeQuantity={(id, qty) => setConteoQuantities((prev) => ({ ...prev, [id]: qty }))}
                />
              )}
              {conteoError ? <Text style={styles.error}>{conteoError}</Text> : null}
              {!conteoResult && (current?.stock || []).length > 0 && (
                <View style={styles.formActions}>
                  <Pressable style={styles.button} onPress={submitConteo} disabled={conteoSubmitting}>
                    {conteoSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Registrar conteo</Text>}
                  </Pressable>
                  <Pressable style={styles.buttonSecondary} onPress={() => setMode('idle')}>
                    <Text style={styles.buttonSecondaryText}>Cancelar</Text>
                  </Pressable>
                </View>
              )}

              {conteoResult && (
                <View style={styles.resultBox}>
                  <Text style={styles.resultTitle}>Diferencias</Text>
                  {conteoResult.differences.map((d) => (
                    <View key={d.product._id} style={styles.diffRow}>
                      <Text style={styles.diffName}>{d.product.name}</Text>
                      <Text style={styles.diffValue}>
                        contado {d.quantityCounted} / esperado {d.quantityExpected} ({d.difference >= 0 ? '+' : ''}
                        {d.difference})
                      </Text>
                    </View>
                  ))}
                  <Pressable style={[styles.buttonSecondary, { marginTop: spacing.md }]} onPress={() => setMode('idle')}>
                    <Text style={styles.buttonSecondaryText}>Cerrar</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {mode === 'historial' && (
            <View style={styles.formBox}>
              <Text style={styles.sectionTitle}>Historial</Text>
              {historialLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : historial.length === 0 ? (
                <Text style={styles.empty}>Sin historial todavía.</Text>
              ) : (
                historial.map((s) => (
                  <View key={s._id}>
                    <Pressable style={styles.historyRow} onPress={() => toggleSessionDetail(s._id)}>
                      <View>
                        <Text style={styles.historyDate}>{new Date(s.businessDate).toLocaleDateString()}</Text>
                        {s.vehicle?.name && <Text style={styles.historyVehicle}>{s.vehicle.name}</Text>}
                      </View>
                      <Text style={[styles.historyStatus, { color: STATUS_COLORS[s.status] || colors.neutral }]}>
                        {SESSION_STATUS_LABELS[s.status] || s.status}
                      </Text>
                    </Pressable>

                    {expandedSessionId === s._id && (
                      <View style={styles.historyDetail}>
                        {expandedCounts.length === 0 ? (
                          <Text style={styles.empty}>Sin conteos registrados.</Text>
                        ) : (
                          expandedCounts.map((c) => (
                            <View key={c._id} style={styles.countCard}>
                              <Text style={styles.countHeader}>
                                {COUNT_TYPE_LABELS[c.type]} — {new Date(c.createdAt).toLocaleString()}
                              </Text>
                              {c.differences.map((d) => (
                                <View key={d.product._id} style={styles.diffRow}>
                                  <Text style={styles.diffName}>{d.product.name}</Text>
                                  <Text style={styles.diffValue}>
                                    contado {d.quantityCounted} / esperado {d.quantityExpected} ({d.difference >= 0 ? '+' : ''}
                                    {d.difference})
                                  </Text>
                                </View>
                              ))}
                            </View>
                          ))
                        )}
                      </View>
                    )}
                  </View>
                ))
              )}
              <Pressable style={[styles.buttonSecondary, { marginTop: spacing.md }]} onPress={() => setMode('idle')}>
                <Text style={styles.buttonSecondaryText}>Cerrar</Text>
              </Pressable>
            </View>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },

  sectionTitle: { ...typography.headline, color: colors.textPrimary, marginBottom: spacing.sm },
  driverRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  driverChip: { borderWidth: 1, borderColor: colors.primary, borderRadius: radii.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  driverChipActive: { backgroundColor: colors.primary },
  driverChipText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  driverChipTextActive: { color: '#fff' },
  empty: { ...typography.callout, color: colors.textSecondary, marginTop: spacing.sm },
  error: { color: colors.danger, marginTop: spacing.sm },

  driverCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...softShadow,
  },
  driverCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  driverName: { ...typography.title, color: colors.textPrimary },
  driverCardSubtitle: { ...typography.subhead, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.sm },
  statusPill: { borderRadius: radii.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  statusPillText: { fontSize: 12, fontWeight: '700' },

  stockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stockName: { ...typography.body, color: colors.textPrimary },
  stockQty: { ...typography.headline, color: colors.textPrimary },

  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  actionButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  actionButtonText: { color: colors.primary, fontWeight: '600', fontSize: 14 },

  formBox: { marginTop: spacing.xl, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border },
  formHint: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  formActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  button: { flex: 1, backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  buttonSecondary: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center' },
  buttonSecondaryText: { color: colors.textSecondary, fontWeight: '600' },

  resultBox: { marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.background, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  resultTitle: { ...typography.subhead, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  diffRow: { marginBottom: spacing.xs },
  diffName: { ...typography.callout, fontWeight: '600', color: colors.textPrimary },
  diffValue: { ...typography.caption, color: colors.textSecondary },

  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyDate: { ...typography.body, color: colors.textPrimary },
  historyVehicle: { ...typography.caption, color: colors.textSecondary },
  historyStatus: { fontSize: 13, fontWeight: '700' },
  historyDetail: { paddingVertical: spacing.sm, paddingLeft: spacing.sm },
  countCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.sm, marginBottom: spacing.sm },
  countHeader: { ...typography.caption, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
});
