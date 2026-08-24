import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as replenishmentApi from '../../src/modules/replenishment/api';
import ScreenHeader from '../../src/shared/ScreenHeader';
import { colors, spacing, radii, typography, softShadow } from '../../src/shared/theme';

// Per-product replenishment settings (coverage days, safety stock) — the one genuine "config"
// concept left after Reabastecimiento's day-to-day suggestions moved into Inventario > Reponer.
export default function SettingsScreen() {
  const { token } = useAuth();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editingProductId, setEditingProductId] = useState(null);
  const [coverageDaysInput, setCoverageDaysInput] = useState('');
  const [safetyStockInput, setSafetyStockInput] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await replenishmentApi.listConfig(token));
    } catch (err) {
      setError(err.message || 'No se pudo cargar la configuración');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(row) {
    setEditingProductId(row.product._id);
    setCoverageDaysInput(String(row.coverageDays));
    setSafetyStockInput(String(row.safetyStock));
  }

  async function saveConfig(productId) {
    const coverageDays = Number(coverageDaysInput);
    const safetyStock = Number(safetyStockInput);
    if (!Number.isFinite(coverageDays) || coverageDays < 0) {
      setError('Días de cobertura debe ser un número válido (>= 0)');
      return;
    }
    if (!Number.isFinite(safetyStock) || safetyStock < 0) {
      setError('Stock de seguridad debe ser un número válido (>= 0)');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await replenishmentApi.setConfig(token, productId, { coverageDays, safetyStock });
      setEditingProductId(null);
      await load();
    } catch (err) {
      setError(err.message || 'No se pudo guardar la configuración');
    } finally {
      setSaving(false);
    }
  }

  async function resetConfig(productId) {
    setSaving(true);
    setError('');
    try {
      await replenishmentApi.resetConfig(token, productId);
      setEditingProductId(null);
      await load();
    } catch (err) {
      setError(err.message || 'No se pudo restablecer la configuración');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader title="Configuración" backHref="/admin" onRefresh={load} refreshing={loading} />

      <Text style={styles.sectionTitle}>Reabastecimiento por producto</Text>
      <Text style={styles.sectionHint}>
        Días de cobertura y stock de seguridad usados para calcular las cantidades sugeridas al reponer.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        rows.map((row) => (
          <View key={row.product._id} style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.productName}>
                {row.product.icon} {row.product.name}
              </Text>
              <Pressable onPress={() => (editingProductId === row.product._id ? setEditingProductId(null) : startEdit(row))}>
                <Text style={styles.link}>{editingProductId === row.product._id ? 'Cerrar' : 'Editar'}</Text>
              </Pressable>
            </View>

            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Días de cobertura</Text>
              <Text style={[styles.metricValue, !row.isOverride && styles.metricValueMuted]}>{row.coverageDays}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Stock de seguridad</Text>
              <Text style={[styles.metricValue, !row.isOverride && styles.metricValueMuted]}>{row.safetyStock}</Text>
            </View>

            {editingProductId === row.product._id && (
              <View style={styles.editBox}>
                <Text style={styles.label}>Días de cobertura</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={coverageDaysInput} onChangeText={setCoverageDaysInput} />
                <Text style={styles.label}>Stock de seguridad</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={safetyStockInput} onChangeText={setSafetyStockInput} />
                <View style={styles.editActions}>
                  <Pressable style={styles.saveButton} onPress={() => saveConfig(row.product._id)} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Guardar</Text>}
                  </Pressable>
                  {row.isOverride && (
                    <Pressable style={styles.resetButton} onPress={() => resetConfig(row.product._id)} disabled={saving}>
                      <Text style={styles.buttonText}>Usar valores por defecto</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  sectionTitle: { ...typography.headline, color: colors.textPrimary, marginBottom: spacing.xs },
  sectionHint: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.md },
  error: { color: colors.danger, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...softShadow,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  productName: { ...typography.headline, color: colors.textPrimary },
  link: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  metricLabel: { ...typography.callout, color: colors.textSecondary },
  metricValue: { ...typography.callout, color: colors.textPrimary, fontWeight: '600' },
  metricValueMuted: { color: colors.textTertiary, fontWeight: '400' },
  editBox: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  label: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    fontSize: 14,
    color: colors.textPrimary,
  },
  editActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  saveButton: { flex: 1, backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: spacing.sm, alignItems: 'center' },
  resetButton: { flex: 1, backgroundColor: colors.neutral, borderRadius: radii.md, paddingVertical: spacing.sm, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
