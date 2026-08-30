import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/modules/auth/useAuth';
import * as replenishmentApi from '../../../src/modules/replenishment/api';
import * as replenishmentRequestsApi from '../../../src/modules/replenishmentRequests/api';
import * as usersApi from '../../../src/modules/users/api';
import * as vehiclesApi from '../../../src/modules/vehicles/api';
import * as productsApi from '../../../src/modules/products/api';
import { shareReplenishmentTicket } from '../../../src/modules/replenishmentRequests/shareTicket';
import QuantityStepper from '../../../src/modules/inventory/QuantityStepper';
import NeoCard from '../../../src/modules/dashboard/NeoCard';
import { REPLENISHMENT_REQUEST_STATUS_LABELS, REPLENISHMENT_REQUEST_STATUS_COLORS } from '../../../src/shared/constants';
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

// Two sub-sections under the same Configuración > Reabastecimiento screen, switched by a simple
// segmented control — keeps the per-product coverage/safety-stock config and the ticket workflow
// each digestible on their own, instead of one long combined form.
function SectionTabs({ section, onChange }) {
  return (
    <View style={styles.segmentRow}>
      <Pressable style={[styles.segment, section === 'config' && styles.segmentActive]} onPress={() => onChange('config')}>
        <Text style={[styles.segmentText, section === 'config' && styles.segmentTextActive]}>Configuración</Text>
      </Pressable>
      <Pressable style={[styles.segment, section === 'solicitudes' && styles.segmentActive]} onPress={() => onChange('solicitudes')}>
        <Text style={[styles.segmentText, section === 'solicitudes' && styles.segmentTextActive]}>Solicitudes</Text>
      </Pressable>
    </View>
  );
}

export default function ReplenishmentSettingsScreen() {
  const { token } = useAuth();
  const router = useRouter();

  const [section, setSection] = useState('config');

  // --- Per-product config (unchanged from before tickets existed) --------------------------
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

  // --- Replenishment request tickets ---------------------------------------------------------
  const [ticketDrivers, setTicketDrivers] = useState([]);
  const [ticketVehicles, setTicketVehicles] = useState([]);
  const [activeProducts, setActiveProducts] = useState([]);

  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [formTicketId, setFormTicketId] = useState(null); // null = creating a new ticket, otherwise editing that DRAFT
  const [formDriverId, setFormDriverId] = useState(null);
  const [formVehicleId, setFormVehicleId] = useState(null);
  const [formQuantities, setFormQuantities] = useState({});
  const [formNote, setFormNote] = useState('');
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [expandedTicketId, setExpandedTicketId] = useState(null);
  const [transitioningId, setTransitioningId] = useState(null);
  const [sharingId, setSharingId] = useState(null);
  const [shareFeedback, setShareFeedback] = useState('');

  const loadTicketDeps = useCallback(async () => {
    try {
      const [users, vehiclesData, productsData] = await Promise.all([
        usersApi.listUsers(token),
        vehiclesApi.listVehicles(token),
        productsApi.listProducts(token),
      ]);
      setTicketDrivers(users.filter((u) => u.role === 'driver'));
      setTicketVehicles(vehiclesData);
      setActiveProducts(productsData.filter((p) => p.active));
    } catch (err) {
      setTicketsError(err.message || 'No se pudieron cargar los datos de apoyo');
    }
  }, [token]);

  const loadTickets = useCallback(async () => {
    setTicketsLoading(true);
    setTicketsError('');
    try {
      setTickets(await replenishmentRequestsApi.listRequests(token));
    } catch (err) {
      setTicketsError(err.message || 'No se pudieron cargar las solicitudes');
    } finally {
      setTicketsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadTicketDeps();
    loadTickets();
  }, [loadTicketDeps, loadTickets]);

  function openCreateForm() {
    setFormTicketId(null);
    setFormDriverId(null);
    setFormVehicleId(null);
    setFormQuantities({});
    setFormNote('');
    setFormError('');
    setFormOpen(true);
  }

  function openEditForm(ticket) {
    setFormTicketId(ticket._id);
    setFormDriverId(ticket.driver ? ticket.driver._id : null);
    setFormVehicleId(ticket.vehicle ? ticket.vehicle._id : null);
    const quantities = {};
    ticket.items.forEach((item) => {
      quantities[item.product] = item.quantity;
    });
    setFormQuantities(quantities);
    setFormNote(ticket.note || '');
    setFormError('');
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
  }

  async function submitForm() {
    setFormError('');
    const items = Object.entries(formQuantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([product, quantity]) => ({ product, quantity }));

    if (items.length === 0) {
      setFormError('Selecciona al menos un producto con cantidad mayor a 0');
      return;
    }

    setFormSaving(true);
    try {
      const payload = {
        driver: formDriverId || undefined,
        vehicle: formVehicleId || undefined,
        items,
        note: formNote.trim() || undefined,
      };
      if (formTicketId) {
        await replenishmentRequestsApi.updateDraft(token, formTicketId, payload);
      } else {
        await replenishmentRequestsApi.createRequest(token, payload);
      }
      setFormOpen(false);
      await loadTickets();
    } catch (err) {
      setFormError(err.message || 'No se pudo guardar la solicitud');
    } finally {
      setFormSaving(false);
    }
  }

  const TRANSITION_FNS = {
    send: replenishmentRequestsApi.sendRequest,
    fulfill: replenishmentRequestsApi.fulfillRequest,
    cancel: replenishmentRequestsApi.cancelRequest,
  };

  async function handleTransition(id, action) {
    setTransitioningId(id);
    setTicketsError('');
    try {
      const updated = await TRANSITION_FNS[action](token, id);
      setTickets((prev) => prev.map((t) => (t._id === updated._id ? updated : t)));
    } catch (err) {
      setTicketsError(err.message || 'No se pudo actualizar la solicitud');
    } finally {
      setTransitioningId(null);
    }
  }

  async function handleShare(ticket) {
    setSharingId(ticket._id);
    setShareFeedback('');
    setTicketsError('');
    try {
      const result = await shareReplenishmentTicket(ticket.shareText);
      if (!result.cancelled) {
        setShareFeedback(result.method === 'clipboard' ? 'Texto copiado al portapapeles' : 'Pedido compartido');
      }
    } catch (err) {
      setTicketsError(err.message || 'No se pudo compartir el pedido');
    } finally {
      setSharingId(null);
    }
  }

  const activeTickets = tickets.filter((t) => t.status === 'DRAFT' || t.status === 'SENT');
  const pastTickets = tickets.filter((t) => t.status === 'FULFILLED' || t.status === 'CANCELLED');

  function renderTicketCard(t) {
    const isExpanded = expandedTicketId === t._id;
    const itemsSummary = t.items.map((i) => `${i.productSnapshot.name} x${i.quantity}`).join(', ');

    return (
      <NeoCard key={t._id} accentColor={REPLENISHMENT_REQUEST_STATUS_COLORS[t.status]} style={styles.cardWrap} contentStyle={styles.cardBody}>
        <Pressable onPress={() => setExpandedTicketId(isExpanded ? null : t._id)}>
          <View style={styles.ticketHeaderRow}>
            <Text style={styles.ticketLabel} numberOfLines={1}>
              {t.driver ? t.driver.name : t.vehicle ? t.vehicle.name : 'Solicitud'}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: `${REPLENISHMENT_REQUEST_STATUS_COLORS[t.status]}22` }]}>
              <Text style={[styles.statusPillText, { color: REPLENISHMENT_REQUEST_STATUS_COLORS[t.status] }]}>
                {REPLENISHMENT_REQUEST_STATUS_LABELS[t.status]}
              </Text>
            </View>
          </View>
          <Text style={styles.ticketMeta} numberOfLines={isExpanded ? undefined : 1}>
            {itemsSummary}
          </Text>
        </Pressable>

        {isExpanded && (
          <View style={styles.detailBox}>
            {t.driver ? <Text style={styles.detailLine}>Chofer: {t.driver.name}</Text> : null}
            {t.vehicle ? <Text style={styles.detailLine}>Vehículo: {t.vehicle.name}</Text> : null}
            {t.note ? <Text style={styles.detailLine}>Nota: {t.note}</Text> : null}
            <Text style={styles.detailLine}>Creado por: {t.requestedBy ? t.requestedBy.name : '—'}</Text>

            <View style={styles.ticketActions}>
              <Pressable style={styles.shareButton} onPress={() => handleShare(t)} disabled={sharingId === t._id} hitSlop={8}>
                {sharingId === t._id ? (
                  <ActivityIndicator color={neoColors.primary} size="small" />
                ) : (
                  <Text style={styles.shareButtonText}>Compartir pedido</Text>
                )}
              </Pressable>

              {t.status === 'DRAFT' && (
                <>
                  <Pressable style={styles.linkButton} onPress={() => openEditForm(t)} hitSlop={8}>
                    <Text style={styles.linkButtonText}>Editar</Text>
                  </Pressable>
                  <Pressable
                    style={styles.primaryActionButton}
                    onPress={() => handleTransition(t._id, 'send')}
                    disabled={transitioningId === t._id}
                    hitSlop={8}
                  >
                    <Text style={styles.primaryActionButtonText}>Enviar</Text>
                  </Pressable>
                  <Pressable
                    style={styles.cancelButton}
                    onPress={() => handleTransition(t._id, 'cancel')}
                    disabled={transitioningId === t._id}
                    hitSlop={8}
                  >
                    <Text style={styles.cancelButtonText}>Cancelar</Text>
                  </Pressable>
                </>
              )}

              {t.status === 'SENT' && (
                <>
                  <Pressable
                    style={styles.primaryActionButton}
                    onPress={() => handleTransition(t._id, 'fulfill')}
                    disabled={transitioningId === t._id}
                    hitSlop={8}
                  >
                    <Text style={styles.primaryActionButtonText}>Marcar cumplida</Text>
                  </Pressable>
                  <Pressable
                    style={styles.cancelButton}
                    onPress={() => handleTransition(t._id, 'cancel')}
                    disabled={transitioningId === t._id}
                    hitSlop={8}
                  >
                    <Text style={styles.cancelButtonText}>Cancelar</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        )}
      </NeoCard>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Header onBack={() => router.replace('/admin/settings')} />
      <SectionTabs section={section} onChange={setSection} />

      {section === 'config' && (
        <>
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
        </>
      )}

      {section === 'solicitudes' && (
        <>
          {!formOpen && (
            <Pressable style={styles.newTicketButton} onPress={openCreateForm}>
              <Text style={styles.newTicketButtonText}>+ Nueva solicitud</Text>
            </Pressable>
          )}

          {formOpen && (
            <NeoCard style={styles.cardWrap} contentStyle={styles.cardBody}>
              <Text style={styles.cardEyebrow}>{formTicketId ? 'Editar borrador' : 'Nueva solicitud'}</Text>

              <Text style={styles.label}>Chofer (opcional)</Text>
              <View style={styles.chipRow}>
                <Pressable style={[styles.chip, !formDriverId && styles.chipActive]} onPress={() => setFormDriverId(null)}>
                  <Text style={[styles.chipText, !formDriverId && styles.chipTextActive]}>Ninguno</Text>
                </Pressable>
                {ticketDrivers.map((d) => (
                  <Pressable key={d._id} style={[styles.chip, formDriverId === d._id && styles.chipActive]} onPress={() => setFormDriverId(d._id)}>
                    <Text style={[styles.chipText, formDriverId === d._id && styles.chipTextActive]}>{d.name}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Vehículo (opcional)</Text>
              <View style={styles.chipRow}>
                <Pressable style={[styles.chip, !formVehicleId && styles.chipActive]} onPress={() => setFormVehicleId(null)}>
                  <Text style={[styles.chipText, !formVehicleId && styles.chipTextActive]}>Ninguno</Text>
                </Pressable>
                {ticketVehicles.map((v) => (
                  <Pressable key={v._id} style={[styles.chip, formVehicleId === v._id && styles.chipActive]} onPress={() => setFormVehicleId(v._id)}>
                    <Text style={[styles.chipText, formVehicleId === v._id && styles.chipTextActive]}>{v.name}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Productos</Text>
              <QuantityStepper
                items={activeProducts.map((p) => ({ product: p }))}
                quantities={formQuantities}
                onChangeQuantity={(id, qty) => setFormQuantities((prev) => ({ ...prev, [id]: qty }))}
              />

              <Text style={styles.label}>Nota (opcional)</Text>
              <TextInput
                style={styles.input}
                value={formNote}
                onChangeText={setFormNote}
                placeholder="Ej. Entregar antes del viernes"
                placeholderTextColor={neoColors.textTertiary}
                multiline
              />

              {formError ? <Text style={styles.error}>{formError}</Text> : null}

              <View style={styles.editActions}>
                <Pressable style={styles.saveButton} onPress={submitForm} disabled={formSaving}>
                  {formSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Guardar borrador</Text>}
                </Pressable>
                <Pressable style={styles.resetButton} onPress={closeForm} disabled={formSaving}>
                  <Text style={styles.buttonText}>Cancelar</Text>
                </Pressable>
              </View>
            </NeoCard>
          )}

          {shareFeedback ? <Text style={styles.success}>{shareFeedback}</Text> : null}
          {ticketsError ? <Text style={styles.error}>{ticketsError}</Text> : null}

          {ticketsLoading ? (
            <ActivityIndicator style={{ marginTop: neoSpacing.xl }} color={neoColors.primary} />
          ) : tickets.length === 0 ? (
            <Text style={styles.empty}>No hay solicitudes de reabastecimiento.</Text>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Activas</Text>
              {activeTickets.length === 0 ? <Text style={styles.empty}>No hay solicitudes activas.</Text> : activeTickets.map(renderTicketCard)}

              {pastTickets.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Historial</Text>
                  {pastTickets.map(renderTicketCard)}
                </>
              )}
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

  header: { marginBottom: neoSpacing.lg },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginBottom: neoSpacing.md },
  backRowText: { color: neoColors.primary, fontWeight: '700', fontSize: 14 },
  title: { ...neoTypography.title, color: neoColors.ink },

  segmentRow: {
    flexDirection: 'row',
    borderWidth: 2,
    borderColor: neoColors.ink,
    borderRadius: neoRadii.md,
    marginBottom: neoSpacing.lg,
    overflow: 'hidden',
  },
  segment: { flex: 1, paddingVertical: neoSpacing.sm, alignItems: 'center', backgroundColor: neoColors.surface },
  segmentActive: { backgroundColor: neoColors.primary },
  segmentText: { fontWeight: '700', fontSize: 13, color: neoColors.ink },
  segmentTextActive: { color: '#fff' },

  sectionHint: { ...neoTypography.caption, color: neoColors.textSecondary, marginBottom: neoSpacing.lg },
  sectionTitle: { ...neoTypography.title, fontSize: 18, color: neoColors.ink, marginTop: neoSpacing.md, marginBottom: neoSpacing.md },
  error: { color: neoColors.danger, fontWeight: '700', marginBottom: neoSpacing.sm },
  success: { color: neoColors.primary, fontWeight: '700', marginBottom: neoSpacing.sm },
  empty: { color: neoColors.textSecondary, marginTop: neoSpacing.sm },

  cardWrap: { marginBottom: neoSpacing.md },
  cardBody: { padding: neoSpacing.md },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: neoSpacing.xs },
  cardEyebrow: { ...neoTypography.headline, fontSize: 12, color: neoColors.textSecondary, marginBottom: neoSpacing.xs },
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

  newTicketButton: {
    borderWidth: 2,
    borderColor: neoColors.ink,
    borderRadius: neoRadii.md,
    paddingVertical: neoSpacing.md,
    alignItems: 'center',
    backgroundColor: neoColors.surface,
    marginBottom: neoSpacing.lg,
  },
  newTicketButtonText: { color: neoColors.primary, fontWeight: '800', fontSize: 14 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: neoSpacing.sm },
  chip: { borderWidth: 2, borderColor: neoColors.ink, borderRadius: neoRadii.full, paddingHorizontal: neoSpacing.md, paddingVertical: neoSpacing.sm },
  chipActive: { backgroundColor: neoColors.primary, borderColor: neoColors.primary },
  chipText: { color: neoColors.ink, fontWeight: '700' },
  chipTextActive: { color: '#fff' },

  ticketHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: neoSpacing.xs },
  ticketLabel: { fontSize: 15, fontWeight: '800', color: neoColors.ink, flexShrink: 1 },
  ticketMeta: { ...neoTypography.caption, color: neoColors.textSecondary, marginTop: neoSpacing.xs },
  statusPill: { borderRadius: neoRadii.full, paddingHorizontal: neoSpacing.sm, paddingVertical: 4 },
  statusPillText: { fontSize: 11, fontWeight: '800' },

  detailBox: { marginTop: neoSpacing.sm, borderTopWidth: 2, borderTopColor: neoColors.neutralMuted, paddingTop: neoSpacing.sm },
  detailLine: { ...neoTypography.caption, color: neoColors.textSecondary, marginTop: 2 },

  ticketActions: { flexDirection: 'row', flexWrap: 'wrap', gap: neoSpacing.sm, marginTop: neoSpacing.sm, alignItems: 'center' },
  shareButton: {
    borderWidth: 2,
    borderColor: neoColors.ink,
    borderRadius: neoRadii.md,
    paddingHorizontal: neoSpacing.md,
    paddingVertical: neoSpacing.xs,
    backgroundColor: neoColors.surface,
  },
  shareButtonText: { color: neoColors.ink, fontWeight: '700', fontSize: 12 },
  linkButton: { paddingHorizontal: neoSpacing.sm, paddingVertical: neoSpacing.xs },
  linkButtonText: { color: neoColors.primary, fontWeight: '700', fontSize: 12 },
  primaryActionButton: { backgroundColor: neoColors.primary, borderRadius: neoRadii.md, paddingHorizontal: neoSpacing.md, paddingVertical: neoSpacing.xs },
  primaryActionButtonText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  cancelButton: { paddingHorizontal: neoSpacing.sm, paddingVertical: neoSpacing.xs },
  cancelButtonText: { color: neoColors.danger, fontSize: 12, fontWeight: '700' },
});
