import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as usersApi from '../../src/modules/users/api';
import * as dispatchApi from '../../src/modules/dispatch/api';
import { openInMaps } from '../../src/shared/openInMaps';
import NeoCard from '../../src/modules/dashboard/NeoCard';
import { DISPATCH_STATUS_LABELS, DISPATCH_STATUS_COLORS } from '../../src/shared/constants';
import { neoColors, neoSpacing, neoRadii, neoTypography } from '../../src/shared/neoTheme';

// Dispatch is a top-level operational tool reached directly from the dashboard (not nested under
// Configuración) — same "title + home icon" header as Mensajes and the dashboard itself.
function Header({ onHome }) {
  return (
    <View style={styles.headerRow}>
      <Text style={styles.title}>Dispatch</Text>
      <Pressable style={styles.iconButton} onPress={onHome} hitSlop={8}>
        <Ionicons name="home-outline" size={18} color={neoColors.ink} />
      </Pressable>
    </View>
  );
}

function DriverChipRow({ drivers, selectedId, onSelect, includeUnassigned }) {
  return (
    <View style={styles.chipRow}>
      {includeUnassigned && (
        <Pressable style={[styles.chip, !selectedId && styles.chipActive]} onPress={() => onSelect(null)}>
          <Text style={[styles.chipText, !selectedId && styles.chipTextActive]}>Sin asignar</Text>
        </Pressable>
      )}
      {drivers.map((d) => (
        <Pressable key={d._id} style={[styles.chip, selectedId === d._id && styles.chipActive]} onPress={() => onSelect(d._id)}>
          <Text style={[styles.chipText, selectedId === d._id && styles.chipTextActive]}>{d.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function AdminDispatchScreen() {
  const { token } = useAuth();
  const router = useRouter();

  const [drivers, setDrivers] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // --- Create: single vs. batch ------------------------------------------------------------
  const [createMode, setCreateMode] = useState('single'); // 'single' | 'batch'

  const [newDriverId, setNewDriverId] = useState(null); // null = create UNASSIGNED
  const [destinationLabel, setDestinationLabel] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [batchText, setBatchText] = useState('');
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [batchError, setBatchError] = useState('');
  const [batchResult, setBatchResult] = useState(null);

  // --- Selection + batch assignment for the UNASSIGNED pool ---------------------------------
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchAssignDriverId, setBatchAssignDriverId] = useState(null);
  const [batchAssigning, setBatchAssigning] = useState(false);
  const [batchAssignError, setBatchAssignError] = useState('');

  // --- Per-card inline actions ---------------------------------------------------------------
  const [assignPickerId, setAssignPickerId] = useState(null); // which card's driver-picker is open
  const [assigningId, setAssigningId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editAddress, setEditAddress] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // --- Filter for Activos/Historial ----------------------------------------------------------
  const [filterDriverId, setFilterDriverId] = useState('ALL');

  const loadDrivers = useCallback(async () => {
    try {
      const users = await usersApi.listUsers(token);
      setDrivers(users.filter((u) => u.role === 'driver'));
    } catch (err) {
      setLoadError(err.message || 'No se pudieron cargar los choferes');
    }
  }, [token]);

  const loadDispatches = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setDispatches(await dispatchApi.listAll(token));
    } catch (err) {
      setLoadError(err.message || 'No se pudieron cargar los dispatches');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadDrivers();
    loadDispatches();
  }, [loadDrivers, loadDispatches]);

  const unassigned = useMemo(() => dispatches.filter((d) => d.status === 'UNASSIGNED'), [dispatches]);
  const active = useMemo(
    () =>
      dispatches.filter(
        (d) => (d.status === 'PENDING' || d.status === 'ACCEPTED') && (filterDriverId === 'ALL' || d.driver?._id === filterDriverId)
      ),
    [dispatches, filterDriverId]
  );
  const past = useMemo(
    () =>
      dispatches.filter(
        (d) => (d.status === 'COMPLETED' || d.status === 'CANCELLED') && (filterDriverId === 'ALL' || d.driver?._id === filterDriverId)
      ),
    [dispatches, filterDriverId]
  );

  async function handleCreate() {
    setCreateError('');
    if (!address.trim()) {
      setCreateError('La dirección es requerida');
      return;
    }
    setCreating(true);
    try {
      await dispatchApi.createDispatch(token, {
        driver: newDriverId || undefined,
        destinationLabel: destinationLabel.trim(),
        address: address.trim(),
        note: note.trim(),
      });
      setDestinationLabel('');
      setAddress('');
      setNote('');
      await loadDispatches();
    } catch (err) {
      setCreateError(err.message || 'No se pudo crear el dispatch');
    } finally {
      setCreating(false);
    }
  }

  async function handleBatchCreate() {
    setBatchError('');
    setBatchResult(null);
    const lines = batchText.split('\n');
    if (lines.every((l) => !l.trim())) {
      setBatchError('Escribe al menos una dirección');
      return;
    }
    setBatchSubmitting(true);
    try {
      const result = await dispatchApi.createBatch(token, lines);
      setBatchResult(result);
      if (result.errorCount === 0) {
        setBatchText('');
      }
      await loadDispatches();
    } catch (err) {
      setBatchError(err.message || 'No se pudieron crear los destinos');
    } finally {
      setBatchSubmitting(false);
    }
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBatchAssign() {
    setBatchAssignError('');
    if (!batchAssignDriverId) {
      setBatchAssignError('Selecciona un chofer');
      return;
    }
    setBatchAssigning(true);
    try {
      const result = await dispatchApi.batchAssign(token, Array.from(selectedIds), batchAssignDriverId);
      if (result.failed.length > 0) {
        setBatchAssignError(`${result.failed.length} destino(s) no se pudieron asignar (probablemente cambiaron de estado mientras tanto).`);
      }
      setSelectedIds(new Set());
      setBatchAssignDriverId(null);
      await loadDispatches();
    } catch (err) {
      setBatchAssignError(err.message || 'No se pudo asignar el lote');
    } finally {
      setBatchAssigning(false);
    }
  }

  async function handleAssign(id, driverId) {
    setAssigningId(id);
    setLoadError('');
    try {
      await dispatchApi.assignDispatch(token, id, driverId);
      setAssignPickerId(null);
      await loadDispatches();
    } catch (err) {
      setLoadError(err.message || 'No se pudo asignar el destino');
    } finally {
      setAssigningId(null);
    }
  }

  async function handleCancel(id) {
    setCancellingId(id);
    setLoadError('');
    try {
      await dispatchApi.cancelDispatch(token, id);
      await loadDispatches();
    } catch (err) {
      setLoadError(err.message || 'No se pudo cancelar el dispatch');
    } finally {
      setCancellingId(null);
    }
  }

  function startEdit(d) {
    setEditingId(d._id);
    setEditAddress(d.address);
    setEditLabel(d.destinationLabel || '');
    setEditError('');
  }

  async function saveEdit(id) {
    setEditError('');
    if (!editAddress.trim()) {
      setEditError('La dirección no puede quedar vacía');
      return;
    }
    setEditSaving(true);
    try {
      await dispatchApi.updateDestination(token, id, { address: editAddress.trim(), destinationLabel: editLabel.trim() });
      setEditingId(null);
      await loadDispatches();
    } catch (err) {
      setEditError(err.message || 'No se pudo guardar la dirección');
    } finally {
      setEditSaving(false);
    }
  }

  function renderCard(d, { selectable, showDriver } = {}) {
    const isSelected = selectedIds.has(d._id);
    const isEditing = editingId === d._id;
    const canEditDestination = ['UNASSIGNED', 'PENDING', 'ACCEPTED'].includes(d.status);
    const canCancel = ['UNASSIGNED', 'PENDING', 'ACCEPTED'].includes(d.status);
    const canAssign = ['UNASSIGNED', 'PENDING'].includes(d.status);

    return (
      <NeoCard key={d._id} accentColor={DISPATCH_STATUS_COLORS[d.status]} style={styles.cardWrap} contentStyle={styles.cardBody}>
        <View style={styles.dispatchHeaderRow}>
          {selectable && (
            <Pressable onPress={() => toggleSelected(d._id)} hitSlop={8}>
              <Ionicons name={isSelected ? 'checkbox' : 'square-outline'} size={20} color={neoColors.primary} />
            </Pressable>
          )}
          <Text style={styles.dispatchLabel} numberOfLines={1}>
            {d.destinationLabel || d.address}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: `${DISPATCH_STATUS_COLORS[d.status]}22` }]}>
            <Text style={[styles.statusPillText, { color: DISPATCH_STATUS_COLORS[d.status] }]}>{DISPATCH_STATUS_LABELS[d.status]}</Text>
          </View>
        </View>

        <Pressable onPress={() => openInMaps(d.mapsUrl)}>
          <Text style={[styles.dispatchMeta, styles.addressLink]}>
            {showDriver && d.driver ? `${d.driver.name} · ` : ''}
            {d.address}
            {d.latitude == null ? ' (sin coordenadas)' : ''}
          </Text>
        </Pressable>
        {d.note ? <Text style={styles.dispatchMeta}>Nota: {d.note}</Text> : null}

        {isEditing ? (
          <View style={styles.editBox}>
            <Text style={styles.label}>Dirección</Text>
            <TextInput style={styles.input} value={editAddress} onChangeText={setEditAddress} placeholderTextColor={neoColors.textTertiary} />
            <Text style={styles.label}>Cliente / referencia (opcional)</Text>
            <TextInput style={styles.input} value={editLabel} onChangeText={setEditLabel} placeholderTextColor={neoColors.textTertiary} />
            {editError ? <Text style={styles.error}>{editError}</Text> : null}
            <View style={styles.editActions}>
              <Pressable style={styles.saveButton} onPress={() => saveEdit(d._id)} disabled={editSaving}>
                {editSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Guardar</Text>}
              </Pressable>
              <Pressable style={styles.cancelEditButton} onPress={() => setEditingId(null)} disabled={editSaving}>
                <Text style={styles.buttonText}>Cancelar</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.actionsRow}>
            {canEditDestination && (
              <Pressable onPress={() => startEdit(d)} hitSlop={8}>
                <Text style={styles.linkAction}>Editar dirección</Text>
              </Pressable>
            )}
            {canAssign && (
              <Pressable onPress={() => setAssignPickerId(assignPickerId === d._id ? null : d._id)} hitSlop={8}>
                <Text style={styles.linkAction}>{d.status === 'UNASSIGNED' ? 'Asignar' : 'Reasignar'}</Text>
              </Pressable>
            )}
            {canCancel && (
              <Pressable style={styles.cancelButton} onPress={() => handleCancel(d._id)} disabled={cancellingId === d._id} hitSlop={8}>
                {cancellingId === d._id ? (
                  <ActivityIndicator color={neoColors.danger} size="small" />
                ) : (
                  <Text style={styles.cancelButtonText}>Cancelar</Text>
                )}
              </Pressable>
            )}
          </View>
        )}

        {assignPickerId === d._id && (
          <View style={styles.editBox}>
            <Text style={styles.label}>Elegir chofer</Text>
            <View style={styles.chipRow}>
              {drivers
                .filter((driver) => driver._id !== d.driver?._id)
                .map((driver) => (
                  <Pressable
                    key={driver._id}
                    style={styles.chip}
                    onPress={() => handleAssign(d._id, driver._id)}
                    disabled={assigningId === d._id}
                  >
                    <Text style={styles.chipText}>{driver.name}</Text>
                  </Pressable>
                ))}
            </View>
            {assigningId === d._id && <ActivityIndicator color={neoColors.primary} style={{ marginTop: neoSpacing.sm }} />}
          </View>
        )}
      </NeoCard>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Header onHome={() => router.push('/admin')} />

      {loadError ? <Text style={styles.error}>{loadError}</Text> : null}

      {/* CREATE */}
      <NeoCard style={styles.cardWrap} contentStyle={styles.cardBody}>
        <View style={styles.dispatchHeaderRow}>
          <Text style={styles.cardEyebrow}>Nuevo destino</Text>
          <View style={styles.segmentRow}>
            <Pressable style={[styles.segment, createMode === 'single' && styles.segmentActive]} onPress={() => setCreateMode('single')}>
              <Text style={[styles.segmentText, createMode === 'single' && styles.segmentTextActive]}>Uno</Text>
            </Pressable>
            <Pressable style={[styles.segment, createMode === 'batch' && styles.segmentActive]} onPress={() => setCreateMode('batch')}>
              <Text style={[styles.segmentText, createMode === 'batch' && styles.segmentTextActive]}>Varias</Text>
            </Pressable>
          </View>
        </View>

        {createMode === 'single' ? (
          <>
            <Text style={styles.label}>Chofer (opcional — sin elegir queda sin asignar)</Text>
            <DriverChipRow drivers={drivers} selectedId={newDriverId} onSelect={setNewDriverId} includeUnassigned />

            <Text style={styles.label}>Dirección</Text>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="Dirección completa"
              placeholderTextColor={neoColors.textTertiary}
            />

            <Text style={styles.label}>Cliente / referencia (opcional)</Text>
            <TextInput
              style={styles.input}
              value={destinationLabel}
              onChangeText={setDestinationLabel}
              placeholder="Ej. Bodega Norte"
              placeholderTextColor={neoColors.textTertiary}
            />

            <Text style={styles.label}>Instrucciones / nota (opcional)</Text>
            <TextInput
              style={styles.input}
              value={note}
              onChangeText={setNote}
              placeholder="Ej. Tocar el timbre del lado izquierdo"
              placeholderTextColor={neoColors.textTertiary}
            />

            {createError ? <Text style={styles.error}>{createError}</Text> : null}

            <Pressable style={[styles.createButton, !address.trim() && styles.createButtonDisabled]} onPress={handleCreate} disabled={!address.trim() || creating}>
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createButtonText}>Crear destino</Text>}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.sectionHint}>Una dirección por línea. Los espacios se recortan y las líneas vacías se ignoran.</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={batchText}
              onChangeText={setBatchText}
              placeholder={'Av. Insurgentes 100\nCalle Falsa 123\nAv. Reforma 200'}
              placeholderTextColor={neoColors.textTertiary}
              multiline
            />
            {batchError ? <Text style={styles.error}>{batchError}</Text> : null}
            <Pressable style={styles.createButton} onPress={handleBatchCreate} disabled={batchSubmitting}>
              {batchSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.createButtonText}>Agregar direcciones</Text>}
            </Pressable>

            {batchResult && (
              <View style={styles.editBox}>
                <Text style={styles.dispatchMeta}>
                  {batchResult.createdCount} creado(s), {batchResult.errorCount} con error.
                </Text>
                {batchResult.results
                  .filter((r) => r.status === 'error')
                  .map((r, idx) => (
                    <Text key={idx} style={styles.error}>
                      "{r.address}": {r.error}
                    </Text>
                  ))}
              </View>
            )}
          </>
        )}
      </NeoCard>

      {/* UNASSIGNED POOL */}
      <Text style={styles.sectionTitle}>Sin asignar {unassigned.length > 0 ? `(${unassigned.length})` : ''}</Text>
      {loading ? (
        <ActivityIndicator color={neoColors.primary} style={{ marginTop: neoSpacing.md }} />
      ) : unassigned.length === 0 ? (
        <Text style={styles.empty}>No hay destinos sin asignar.</Text>
      ) : (
        <>
          {selectedIds.size > 0 && (
            <NeoCard style={styles.cardWrap} contentStyle={styles.cardBody}>
              <Text style={styles.cardEyebrow}>Asignar {selectedIds.size} a…</Text>
              <DriverChipRow drivers={drivers} selectedId={batchAssignDriverId} onSelect={setBatchAssignDriverId} />
              {batchAssignError ? <Text style={styles.error}>{batchAssignError}</Text> : null}
              <View style={styles.editActions}>
                <Pressable style={styles.saveButton} onPress={handleBatchAssign} disabled={batchAssigning || !batchAssignDriverId}>
                  {batchAssigning ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Confirmar asignación</Text>}
                </Pressable>
                <Pressable style={styles.cancelEditButton} onPress={() => setSelectedIds(new Set())} disabled={batchAssigning}>
                  <Text style={styles.buttonText}>Limpiar selección</Text>
                </Pressable>
              </View>
            </NeoCard>
          )}
          {unassigned.map((d) => renderCard(d, { selectable: true }))}
        </>
      )}

      {/* FILTER */}
      <Text style={styles.sectionTitle}>Choferes</Text>
      <View style={styles.chipRow}>
        <Pressable style={[styles.chip, filterDriverId === 'ALL' && styles.chipActive]} onPress={() => setFilterDriverId('ALL')}>
          <Text style={[styles.chipText, filterDriverId === 'ALL' && styles.chipTextActive]}>Todos los choferes</Text>
        </Pressable>
        {drivers.map((d) => (
          <Pressable key={d._id} style={[styles.chip, filterDriverId === d._id && styles.chipActive]} onPress={() => setFilterDriverId(d._id)}>
            <Text style={[styles.chipText, filterDriverId === d._id && styles.chipTextActive]}>{d.name}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Activos</Text>
      {loading ? (
        <ActivityIndicator color={neoColors.primary} style={{ marginTop: neoSpacing.md }} />
      ) : active.length === 0 ? (
        <Text style={styles.empty}>No hay dispatches activos.</Text>
      ) : (
        active.map((d) => renderCard(d, { showDriver: filterDriverId === 'ALL' }))
      )}

      {past.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Historial</Text>
          {past.map((d) => renderCard(d, { showDriver: filterDriverId === 'ALL' }))}
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

  cardWrap: { marginBottom: neoSpacing.md },
  cardBody: { padding: neoSpacing.md },
  cardEyebrow: { ...neoTypography.headline, fontSize: 12, color: neoColors.textSecondary, marginBottom: neoSpacing.xs },

  segmentRow: { flexDirection: 'row', borderWidth: 2, borderColor: neoColors.ink, borderRadius: neoRadii.md, overflow: 'hidden' },
  segment: { paddingHorizontal: neoSpacing.md, paddingVertical: 4, backgroundColor: neoColors.surface },
  segmentActive: { backgroundColor: neoColors.primary },
  segmentText: { fontWeight: '700', fontSize: 12, color: neoColors.ink },
  segmentTextActive: { color: '#fff' },

  sectionHint: { ...neoTypography.caption, color: neoColors.textSecondary, marginBottom: neoSpacing.sm },
  sectionTitle: { ...neoTypography.title, fontSize: 18, color: neoColors.ink, marginTop: neoSpacing.lg, marginBottom: neoSpacing.md },

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
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: neoColors.surface,
    color: neoColors.ink,
    marginTop: neoSpacing.xs,
  },
  textarea: { minHeight: 100, textAlignVertical: 'top' },

  error: { color: neoColors.danger, fontWeight: '700', marginTop: neoSpacing.sm },
  empty: { color: neoColors.textSecondary, marginTop: neoSpacing.sm },

  createButton: { backgroundColor: neoColors.primary, borderRadius: neoRadii.md, paddingVertical: neoSpacing.md, alignItems: 'center', marginTop: neoSpacing.lg },
  createButtonDisabled: { opacity: 0.5 },
  createButtonText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  dispatchHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: neoSpacing.xs },
  dispatchLabel: { fontSize: 15, fontWeight: '800', color: neoColors.ink, flexShrink: 1, flexGrow: 1 },
  dispatchMeta: { ...neoTypography.caption, color: neoColors.textSecondary, marginTop: neoSpacing.xs },
  addressLink: { color: neoColors.primary },
  statusPill: { borderRadius: neoRadii.full, paddingHorizontal: neoSpacing.sm, paddingVertical: 4 },
  statusPillText: { fontSize: 11, fontWeight: '800' },

  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: neoSpacing.md, marginTop: neoSpacing.sm, alignItems: 'center' },
  linkAction: { color: neoColors.primary, fontSize: 12, fontWeight: '700' },

  editBox: { marginTop: neoSpacing.sm, borderTopWidth: 2, borderTopColor: neoColors.neutralMuted, paddingTop: neoSpacing.sm },
  editActions: { flexDirection: 'row', gap: neoSpacing.sm, marginTop: neoSpacing.sm },
  saveButton: { flex: 1, backgroundColor: neoColors.primary, borderRadius: neoRadii.md, paddingVertical: neoSpacing.sm, alignItems: 'center' },
  cancelEditButton: { flex: 1, backgroundColor: neoColors.neutral, borderRadius: neoRadii.md, paddingVertical: neoSpacing.sm, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  cancelButton: { marginLeft: 'auto' },
  cancelButtonText: { color: neoColors.danger, fontSize: 12, fontWeight: '700' },
});
