import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/modules/auth/useAuth';
import * as replenishmentApi from '../../../src/modules/replenishment/api';
import NeoCard from '../../../src/modules/dashboard/NeoCard';
import { neoColors, neoSpacing, neoRadii, neoTypography } from '../../../src/shared/neoTheme';

// "← Configuración" back-row, matching Choferes and Programación — this screen has no entry
// point other than Configuración.
function Header({ onBack }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.backRow} onPress={onBack} hitSlop={8}>
        <Ionicons name="chevron-back" size={18} color={neoColors.primary} />
        <Text style={styles.backRowText}>Configuración</Text>
      </Pressable>
      <Text style={styles.title}>Reabastecimiento</Text>
    </View>
  );
}

// Per-product replenishment settings (coverage days, safety stock) — the one genuine "config"
// concept left after Reabastecimiento's day-to-day suggestions moved into Inventario > Reponer.
export default function ReplenishmentSettingsScreen() {
  const { token } = useAuth();
  const router = useRouter();

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
      <Header onBack={() => router.replace('/admin/settings')} />

      <Text style={styles.sectionHint}>
        Días de cobertura y stock de seguridad usados para calcular las cantidades sugeridas al reponer.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: neoSpacing.xl }} color={neoColors.primary} />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>No hay productos configurados.</Text>
      ) : (
        rows.map((row) => (
          <NeoCard key={row.product._id} style={styles.cardWrap} contentStyle={styles.cardBody}>
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
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={coverageDaysInput}
                  onChangeText={setCoverageDaysInput}
                  placeholderTextColor={neoColors.textTertiary}
                />
                <Text style={styles.label}>Stock de seguridad</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={safetyStockInput}
                  onChangeText={setSafetyStockInput}
                  placeholderTextColor={neoColors.textTertiary}
                />
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
          </NeoCard>
        ))
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

  sectionHint: { ...neoTypography.caption, color: neoColors.textSecondary, marginBottom: neoSpacing.lg },
  error: { color: neoColors.danger, fontWeight: '700', marginBottom: neoSpacing.sm },
  empty: { color: neoColors.textSecondary, marginTop: neoSpacing.sm },

  cardWrap: { marginBottom: neoSpacing.md },
  cardBody: { padding: neoSpacing.md },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: neoSpacing.xs },
  productName: { fontSize: 15, fontWeight: '800', color: neoColors.ink },
  link: { color: neoColors.primary, fontSize: 13, fontWeight: '700' },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  metricLabel: { ...neoTypography.body, color: neoColors.textSecondary },
  metricValue: { ...neoTypography.body, color: neoColors.ink, fontWeight: '800' },
  metricValueMuted: { color: neoColors.textTertiary, fontWeight: '500' },
  editBox: { marginTop: neoSpacing.sm, borderTopWidth: 2, borderTopColor: neoColors.neutralMuted, paddingTop: neoSpacing.sm },
  label: { ...neoTypography.headline, fontSize: 12, color: neoColors.textSecondary, marginBottom: neoSpacing.xs, marginTop: neoSpacing.sm },
  input: {
    borderWidth: 2,
    borderColor: neoColors.ink,
    borderRadius: neoRadii.md,
    paddingHorizontal: neoSpacing.md,
    paddingVertical: neoSpacing.md,
    marginBottom: neoSpacing.sm,
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: neoColors.surface,
    color: neoColors.ink,
  },
  editActions: { flexDirection: 'row', gap: neoSpacing.sm, marginTop: neoSpacing.xs },
  saveButton: { flex: 1, backgroundColor: neoColors.primary, borderRadius: neoRadii.md, paddingVertical: neoSpacing.sm, alignItems: 'center' },
  resetButton: { flex: 1, backgroundColor: neoColors.neutral, borderRadius: neoRadii.md, paddingVertical: neoSpacing.sm, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
