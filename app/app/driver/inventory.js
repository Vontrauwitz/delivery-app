import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as inventoryApi from '../../src/modules/inventory/api';
import * as inventoryCountsApi from '../../src/modules/inventoryCounts/api';
import * as closingApi from '../../src/modules/closing/api';
import QuantityStepper from '../../src/modules/inventory/QuantityStepper';
import { formatCurrency } from '../../src/shared/money';
import ScreenHeader from '../../src/shared/ScreenHeader';
import { colors, spacing, radii, typography, softShadow } from '../../src/shared/theme';

const STATUS_LABELS = { OPEN: 'Al día', CLOSING_PENDING: 'Cierre pendiente', CLOSED: 'Última actualización' };
const STATUS_COLORS = { OPEN: colors.success, CLOSING_PENDING: colors.warning, CLOSED: colors.neutral };

export default function DriverInventoryScreen() {
  const { token } = useAuth();
  const params = useLocalSearchParams();

  const [session, setSession] = useState(null);
  const [expected, setExpected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [mode, setMode] = useState('idle'); // idle | partial | closing
  const [partialQuantities, setPartialQuantities] = useState({});
  const [partialResult, setPartialResult] = useState(null);
  const [partialSubmitting, setPartialSubmitting] = useState(false);
  const [partialError, setPartialError] = useState('');

  const [closingQuantities, setClosingQuantities] = useState({});
  const [reportedCash, setReportedCash] = useState('');
  const [closingResult, setClosingResult] = useState(null);
  const [closingDifferences, setClosingDifferences] = useState([]);
  const [closingSubmitting, setClosingSubmitting] = useState(false);
  const [closingError, setClosingError] = useState('');

  // The exact same read the manager's per-driver inventory screen uses — so what a driver
  // sees here and what their manager sees for them can never disagree.
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const current = await inventoryApi.getMyCurrentStock(token);
      setSession(current.session);
      setExpected(current.stock);
    } catch (err) {
      setSession(null);
      setExpected([]);
      setLoadError('');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Deep link from the driver home "Cierre" tile (?mode=closing): jump straight into the
  // closing form instead of making the driver find it inside this screen themselves.
  useEffect(() => {
    if (params.mode === 'closing' && session?.status === 'OPEN' && expected.length > 0 && mode === 'idle') {
      startClosing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.mode, session, expected]);

  function startPartial() {
    setMode('partial');
    setPartialResult(null);
    setPartialError('');
    const initial = {};
    expected.forEach((e) => {
      initial[e.product._id] = 0;
    });
    setPartialQuantities(initial);
  }

  function startClosing() {
    setMode('closing');
    setClosingResult(null);
    setClosingError('');
    const initial = {};
    expected.forEach((e) => {
      initial[e.product._id] = 0;
    });
    setClosingQuantities(initial);
    setReportedCash('');
  }

  async function submitPartial() {
    setPartialError('');
    setPartialSubmitting(true);
    try {
      const counts = expected.map((e) => ({
        product: e.product._id,
        quantityCounted: partialQuantities[e.product._id] || 0,
      }));
      const result = await inventoryCountsApi.createPartialCount(token, counts);
      setPartialResult(result);
      await load();
    } catch (err) {
      setPartialError(err.message || 'No se pudo registrar el conteo');
    } finally {
      setPartialSubmitting(false);
    }
  }

  async function submitClosing() {
    setClosingError('');
    const cash = Number(reportedCash);
    if (!Number.isFinite(cash) || cash < 0) {
      setClosingError('Indica el efectivo reportado (>= 0)');
      return;
    }
    setClosingSubmitting(true);
    try {
      const counts = expected.map((e) => ({
        product: e.product._id,
        quantityCounted: closingQuantities[e.product._id] || 0,
      }));
      const result = await closingApi.createClosing(token, counts, cash);
      setClosingResult(result);
      const countDetail = await inventoryCountsApi.getCount(token, result.inventoryCount._id);
      setClosingDifferences(countDetail.differences || []);
    } catch (err) {
      setClosingError(err.message || 'No se pudo registrar el cierre');
    } finally {
      setClosingSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <ScreenHeader title="Inventario" backHref="/driver" onRefresh={load} refreshing={loading} />
        </View>
        <View style={styles.emptyCenter}>
          <Text style={styles.emptyIcon}>📦</Text>
          <Text style={styles.emptyTitle}>Sin inventario todavía</Text>
          <Text style={styles.emptyBody}>
            Cuando tu manager te reponga productos, tu inventario aparecerá aquí automáticamente. Mientras tanto,
            puedes seguir vendiendo con normalidad.
          </Text>
        </View>
      </View>
    );
  }

  const statusLabel = STATUS_LABELS[session.status] || session.status;
  const statusColor = STATUS_COLORS[session.status] || colors.neutral;
  const dateLabel =
    session.status === 'CLOSED'
      ? `Cierre del ${new Date(session.businessDate).toLocaleDateString()}`
      : `Desde ${new Date(session.businessDate).toLocaleDateString()}`;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={60}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Inventario" backHref="/driver" onRefresh={load} refreshing={loading} />

        <View style={styles.statusRow}>
          <View style={[styles.statusPill, { backgroundColor: `${statusColor}22` }]}>
            <Text style={[styles.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          <Text style={styles.statusDate}>{dateLabel}</Text>
        </View>

        <Text style={styles.sectionTitle}>Tu inventario actual</Text>
        {expected.length === 0 ? (
          <Text style={styles.notice}>Todavía no tienes productos en inventario.</Text>
        ) : (
          <View style={styles.expectedCard}>
            {expected.map((e, index) => (
              <View key={e.product._id} style={[styles.expectedRow, index === expected.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={styles.expectedName}>
                  {e.product.icon} {e.product.name}
                </Text>
                <Text style={styles.expectedQty}>{e.quantityExpected}</Text>
              </View>
            ))}
          </View>
        )}

        {session.status === 'CLOSING_PENDING' && (
          <Text style={styles.notice}>Ya enviaste tu cierre. Está a la espera de revisión del manager.</Text>
        )}
        {session.status === 'CLOSED' && (
          <Text style={styles.notice}>Volverás a poder contar o cerrar cuando tengas una venta o reposición nueva.</Text>
        )}

        {session.status === 'OPEN' && (
          <View style={styles.actionsRow}>
            <Pressable style={styles.actionButton} onPress={startPartial}>
              <Text style={styles.actionButtonText}>Conteo parcial</Text>
            </Pressable>
            <Pressable style={[styles.actionButton, styles.closingButton]} onPress={startClosing}>
              <Text style={styles.actionButtonText}>Cerrar jornada</Text>
            </Pressable>
          </View>
        )}

        {mode === 'partial' && (
          <View style={styles.formBox}>
            <Text style={styles.sectionTitle}>Conteo parcial — cantidad física</Text>
            <QuantityStepper
              items={expected.map((e) => ({ product: e.product, note: `Esperado: ${e.quantityExpected}` }))}
              quantities={partialQuantities}
              onChangeQuantity={(id, qty) => setPartialQuantities((prev) => ({ ...prev, [id]: qty }))}
            />
            {partialError ? <Text style={styles.error}>{partialError}</Text> : null}
            <Pressable style={styles.button} onPress={submitPartial} disabled={partialSubmitting}>
              {partialSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Registrar conteo</Text>}
            </Pressable>

            {partialResult && (
              <View style={styles.resultBox}>
                <Text style={styles.resultTitle}>Diferencias</Text>
                {partialResult.differences.map((d) => (
                  <View key={d.product._id} style={styles.diffRow}>
                    <Text style={styles.diffName}>{d.product.name}</Text>
                    <Text style={styles.diffValue}>
                      contado {d.quantityCounted} / esperado {d.quantityExpected} ({d.difference >= 0 ? '+' : ''}
                      {d.difference})
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {mode === 'closing' && (
          <View style={styles.formBox}>
            <Text style={styles.sectionTitle}>Cierre de jornada — inventario final</Text>
            <QuantityStepper
              items={expected.map((e) => ({ product: e.product, note: `Esperado: ${e.quantityExpected}` }))}
              quantities={closingQuantities}
              onChangeQuantity={(id, qty) => setClosingQuantities((prev) => ({ ...prev, [id]: qty }))}
            />

            <Text style={styles.sectionTitle}>Efectivo en mano</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
              value={reportedCash}
              onChangeText={setReportedCash}
            />

            {closingError ? <Text style={styles.error}>{closingError}</Text> : null}
            <Pressable style={styles.button} onPress={submitClosing} disabled={closingSubmitting}>
              {closingSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Registrar cierre</Text>}
            </Pressable>

            {closingResult && (
              <View style={styles.resultBox}>
                <Text style={styles.resultTitle}>Resumen de cierre</Text>
                <SummaryRow label="Efectivo esperado" value={formatCurrency(closingResult.expectedCash)} />
                <SummaryRow label="Efectivo reportado" value={formatCurrency(closingResult.reportedCash)} />
                <SummaryRow label="Diferencia" value={formatCurrency(closingResult.cashDifference)} bold />
                <Text style={[styles.resultTitle, { marginTop: 12 }]}>Diferencias de inventario</Text>
                {closingDifferences.map((d) => (
                  <View key={d.product._id} style={styles.diffRow}>
                    <Text style={styles.diffName}>{d.product.name}</Text>
                    <Text style={styles.diffValue}>
                      contado {d.quantityCounted} / esperado {d.quantityExpected} ({d.difference >= 0 ? '+' : ''}
                      {d.difference})
                    </Text>
                  </View>
                ))}
                <Text style={styles.note}>Cierre registrado. Queda pendiente de revisión y finalización por el manager.</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SummaryRow({ label, value, bold }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.summaryValue, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  emptyCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyIcon: { fontSize: 40, marginBottom: spacing.md },
  emptyTitle: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.sm, textAlign: 'center' },
  emptyBody: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  statusPill: { borderRadius: radii.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  statusPillText: { fontSize: 13, fontWeight: '700' },
  statusDate: { ...typography.subhead, color: colors.textSecondary },

  sectionTitle: { ...typography.headline, color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.sm },
  expectedCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    ...softShadow,
  },
  expectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  expectedName: { ...typography.body, color: colors.textPrimary },
  expectedQty: { ...typography.headline, color: colors.textPrimary },

  notice: { ...typography.callout, color: colors.warning, marginTop: spacing.md },

  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  actionButton: { flex: 1, backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center' },
  closingButton: { backgroundColor: colors.success },
  actionButtonText: { color: '#fff', fontWeight: '600' },

  formBox: { marginTop: spacing.xl, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  button: { backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  error: { color: colors.danger, marginBottom: spacing.sm },
  resultBox: { marginTop: spacing.lg, padding: spacing.md, backgroundColor: colors.background, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  resultTitle: { ...typography.subhead, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  diffRow: { marginBottom: spacing.xs },
  diffName: { ...typography.callout, fontWeight: '600', color: colors.textPrimary },
  diffValue: { ...typography.caption, color: colors.textSecondary },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  summaryLabel: { ...typography.callout, color: colors.textPrimary },
  summaryValue: { ...typography.callout, color: colors.textPrimary },
  bold: { fontWeight: '700', fontSize: 16 },
  note: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.md, fontStyle: 'italic' },
});
