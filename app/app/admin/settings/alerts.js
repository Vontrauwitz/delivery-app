import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/modules/auth/useAuth';
import * as alertsApi from '../../../src/modules/alerts/api';
import NeoCard from '../../../src/modules/dashboard/NeoCard';
import { ALERT_RULE_LABELS, ALERT_SEVERITY_LABELS } from '../../../src/shared/constants';
import { neoColors, neoSpacing, neoRadii, neoTypography } from '../../../src/shared/neoTheme';

const SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'];

// Human label + input hint per config field name — the only three that exist across all
// supported rules (see backend alerts.service's CONFIG_FIELDS_BY_RULE). A rule with no
// applicable fields (LOW_INVENTORY) simply has an empty config object and renders none of these.
const CONFIG_FIELD_LABELS = {
  graceMinutes: 'Minutos de tolerancia',
  staleMinutes: 'Minutos sin ubicación',
  pendingMinutes: 'Minutos de espera',
};

function Header({ onBack }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.backRow} onPress={onBack} hitSlop={8}>
        <Ionicons name="chevron-back" size={18} color={neoColors.primary} />
        <Text style={styles.backRowText}>Configuración</Text>
      </Pressable>
      <Text style={styles.title}>Alertas</Text>
    </View>
  );
}

export default function AlertRulesSettingsScreen() {
  const { token } = useAuth();
  const router = useRouter();

  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editingKey, setEditingKey] = useState(null);
  const [editSeverity, setEditSeverity] = useState('WARNING');
  const [editConfigInputs, setEditConfigInputs] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRules(await alertsApi.listRules(token));
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las reglas de alerta');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleEnabled(rule) {
    setError('');
    try {
      const updated = await alertsApi.updateRule(token, rule.key, { enabled: !rule.enabled });
      setRules((prev) => prev.map((r) => (r.key === updated.key ? updated : r)));
    } catch (err) {
      setError(err.message || 'No se pudo actualizar la regla');
    }
  }

  function startEdit(rule) {
    setEditingKey(rule.key);
    setEditSeverity(rule.severity);
    const inputs = {};
    Object.entries(rule.config || {}).forEach(([field, value]) => {
      inputs[field] = String(value);
    });
    setEditConfigInputs(inputs);
  }

  async function saveEdit(rule) {
    setError('');
    const config = {};
    for (const [field, raw] of Object.entries(editConfigInputs)) {
      const num = Number(raw);
      if (!Number.isInteger(num) || num <= 0) {
        setError(`${CONFIG_FIELD_LABELS[field] || field} debe ser un número entero positivo`);
        return;
      }
      config[field] = num;
    }

    setSaving(true);
    try {
      const updated = await alertsApi.updateRule(token, rule.key, {
        severity: editSeverity,
        ...(Object.keys(config).length > 0 ? { config } : {}),
      });
      setRules((prev) => prev.map((r) => (r.key === updated.key ? updated : r)));
      setEditingKey(null);
    } catch (err) {
      setError(err.message || 'No se pudo guardar la regla');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Header onBack={() => router.replace('/admin/settings')} />

      <Text style={styles.sectionHint}>
        Reglas que generan alertas operativas automáticamente. Activa o desactiva cada una, ajusta su severidad y sus umbrales.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: neoSpacing.xl }} color={neoColors.primary} />
      ) : (
        rules.map((rule) => (
          <NeoCard key={rule.key} style={styles.cardWrap} contentStyle={styles.cardBody}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.ruleName}>{ALERT_RULE_LABELS[rule.key] || rule.key}</Text>
              <Pressable style={[styles.enabledPill, rule.enabled && styles.enabledPillOn]} onPress={() => toggleEnabled(rule)}>
                <Text style={[styles.enabledPillText, rule.enabled && styles.enabledPillTextOn]}>{rule.enabled ? 'Activada' : 'Desactivada'}</Text>
              </Pressable>
            </View>

            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Severidad</Text>
              <Text style={styles.metricValue}>{ALERT_SEVERITY_LABELS[rule.severity]}</Text>
            </View>
            {Object.entries(rule.config || {}).map(([field, value]) => (
              <View style={styles.metricRow} key={field}>
                <Text style={styles.metricLabel}>{CONFIG_FIELD_LABELS[field] || field}</Text>
                <Text style={styles.metricValue}>{value}</Text>
              </View>
            ))}

            {editingKey === rule.key ? (
              <View style={styles.editBox}>
                <Text style={styles.label}>Severidad</Text>
                <View style={styles.chipRow}>
                  {SEVERITIES.map((sev) => (
                    <Pressable
                      key={sev}
                      style={[styles.chip, editSeverity === sev && styles.chipActive]}
                      onPress={() => setEditSeverity(sev)}
                    >
                      <Text style={[styles.chipText, editSeverity === sev && styles.chipTextActive]}>{ALERT_SEVERITY_LABELS[sev]}</Text>
                    </Pressable>
                  ))}
                </View>

                {Object.keys(editConfigInputs).map((field) => (
                  <View key={field}>
                    <Text style={styles.label}>{CONFIG_FIELD_LABELS[field] || field}</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={editConfigInputs[field]}
                      onChangeText={(text) => setEditConfigInputs((prev) => ({ ...prev, [field]: text }))}
                      placeholderTextColor={neoColors.textTertiary}
                    />
                  </View>
                ))}

                <View style={styles.editActions}>
                  <Pressable style={styles.saveButton} onPress={() => saveEdit(rule)} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Guardar</Text>}
                  </Pressable>
                  <Pressable style={styles.cancelButton} onPress={() => setEditingKey(null)} disabled={saving}>
                    <Text style={styles.buttonText}>Cancelar</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable style={styles.editLink} onPress={() => startEdit(rule)}>
                <Text style={styles.editLinkText}>Editar</Text>
              </Pressable>
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

  cardWrap: { marginBottom: neoSpacing.md },
  cardBody: { padding: neoSpacing.md },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: neoSpacing.xs, gap: neoSpacing.sm },
  ruleName: { fontSize: 15, fontWeight: '800', color: neoColors.ink, flex: 1 },

  enabledPill: { borderWidth: 2, borderColor: neoColors.ink, borderRadius: neoRadii.full, paddingHorizontal: neoSpacing.md, paddingVertical: 4, backgroundColor: neoColors.surface },
  enabledPillOn: { backgroundColor: neoColors.success, borderColor: neoColors.success },
  enabledPillText: { fontSize: 11, fontWeight: '800', color: neoColors.textSecondary },
  enabledPillTextOn: { color: '#fff' },

  metricRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  metricLabel: { ...neoTypography.body, color: neoColors.textSecondary },
  metricValue: { ...neoTypography.body, color: neoColors.ink, fontWeight: '800' },

  editLink: { marginTop: neoSpacing.sm, alignSelf: 'flex-start' },
  editLinkText: { color: neoColors.primary, fontSize: 13, fontWeight: '700' },

  editBox: { marginTop: neoSpacing.sm, borderTopWidth: 2, borderTopColor: neoColors.neutralMuted, paddingTop: neoSpacing.sm },
  label: { ...neoTypography.headline, fontSize: 12, color: neoColors.textSecondary, marginBottom: neoSpacing.xs, marginTop: neoSpacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: neoSpacing.sm },
  chip: { borderWidth: 2, borderColor: neoColors.ink, borderRadius: neoRadii.full, paddingHorizontal: neoSpacing.md, paddingVertical: neoSpacing.sm },
  chipActive: { backgroundColor: neoColors.primary, borderColor: neoColors.primary },
  chipText: { color: neoColors.ink, fontWeight: '700' },
  chipTextActive: { color: '#fff' },
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
  cancelButton: { flex: 1, backgroundColor: neoColors.neutral, borderRadius: neoRadii.md, paddingVertical: neoSpacing.sm, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
