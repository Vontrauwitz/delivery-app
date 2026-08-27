import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/modules/auth/useAuth';
import * as usersApi from '../../../src/modules/users/api';
import NeoCard from '../../../src/modules/dashboard/NeoCard';
import { neoColors, neoSpacing, neoRadii, neoTypography } from '../../../src/shared/neoTheme';

const DELETE_CONFIRM_WORD = 'ELIMINAR';

function Header({ title, onBack }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.backRow} onPress={onBack} hitSlop={8}>
        <Ionicons name="chevron-back" size={18} color={neoColors.primary} />
        <Text style={styles.backRowText}>Choferes</Text>
      </Pressable>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

export default function DriverDetailScreen() {
  const { id } = useLocalSearchParams();
  const isNew = id === 'new';
  const { token } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [active, setActive] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [banner, setBanner] = useState('');

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteBlocked, setDeleteBlocked] = useState(null);

  const load = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    setLoadError('');
    try {
      const driver = await usersApi.getDriver(token, id);
      setName(driver.name);
      setEmail(driver.email);
      setActive(driver.active);
    } catch (err) {
      setLoadError(err.message || 'No se pudo cargar el chofer');
    } finally {
      setLoading(false);
    }
  }, [token, id, isNew]);

  useEffect(() => {
    load();
  }, [load]);

  const nameOk = name.trim().length > 0;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordOk = isNew ? password.length >= 6 : !showPasswordField || password.length >= 6;
  const canSave = nameOk && emailOk && passwordOk && !saving;

  function closeDeleteModal() {
    setDeleteModalOpen(false);
    setConfirmText('');
    setDeleteError('');
    setDeleteBlocked(null);
  }

  async function handleSave() {
    setSaveError('');
    setBanner('');
    if (!nameOk || !emailOk || !passwordOk) {
      setSaveError('Revisa el nombre, el email y la contraseña antes de guardar.');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = await usersApi.createDriver(token, { name: name.trim(), email: email.trim(), password });
        // A confirmed successful create is done — go straight to managing this new driver
        // rather than leaving the manager on a form that looks unchanged.
        router.replace(`/admin/drivers/${created._id}`);
        return;
      }
      const payload = { name: name.trim(), email: email.trim(), active };
      if (showPasswordField && password) payload.password = password;
      await usersApi.updateDriver(token, id, payload);
      setPassword('');
      setShowPasswordField(false);
      setBanner('Cambios guardados.');
    } catch (err) {
      setSaveError(err.message || 'No se pudo guardar el chofer');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    setSaveError('');
    setBanner('');
    setSaving(true);
    try {
      const updated = await usersApi.updateDriver(token, id, { name: name.trim(), email: email.trim(), active: !active });
      setActive(updated.active);
      setBanner(updated.active ? 'Chofer activado.' : 'Chofer desactivado.');
    } catch (err) {
      setSaveError(err.message || 'No se pudo actualizar el chofer');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete() {
    setDeleteError('');
    setDeleting(true);
    try {
      await usersApi.deleteDriver(token, id);
      // No optimistic disappearance — only leave once the backend has actually confirmed the
      // delete succeeded.
      router.replace('/admin/drivers');
    } catch (err) {
      if (err.status === 409 && err.details?.code === 'DRIVER_HAS_REFERENCES') {
        setDeleteBlocked({ message: err.message });
      } else {
        setDeleteError(err.message || 'No se pudo eliminar el chofer');
      }
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeactivateFromBlockedModal() {
    closeDeleteModal();
    await handleToggleActive();
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Header title="Chofer" onBack={() => router.replace('/admin/drivers')} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={neoColors.primary} />
        </View>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Header title="Chofer" onBack={() => router.replace('/admin/drivers')} />
        </View>
        <View style={styles.center}>
          <Text style={styles.error}>{loadError}</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Header title={isNew ? 'Nuevo chofer' : name || 'Chofer'} onBack={() => router.replace('/admin/drivers')} />

      {banner ? <Text style={styles.success}>{banner}</Text> : null}
      {saveError ? <Text style={styles.error}>{saveError}</Text> : null}

      <NeoCard style={styles.cardWrap} contentStyle={styles.cardBody}>
        {!isNew && (
          <View style={styles.statusRow}>
            <Text style={styles.cardEyebrow}>Estado</Text>
            <Pressable style={[styles.toggle, active && styles.toggleActive]} onPress={handleToggleActive} disabled={saving}>
              <Text style={[styles.toggleText, active && styles.toggleTextActive]}>{active ? 'Activo' : 'Inactivo'}</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.label}>Nombre</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nombre del chofer" placeholderTextColor={neoColors.textTertiary} />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="chofer@correo.com"
          placeholderTextColor={neoColors.textTertiary}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        {isNew ? (
          <>
            <Text style={styles.label}>Contraseña</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Mínimo 6 caracteres"
              placeholderTextColor={neoColors.textTertiary}
              secureTextEntry
            />
          </>
        ) : !showPasswordField ? (
          <Pressable style={styles.passwordToggle} onPress={() => setShowPasswordField(true)}>
            <Ionicons name="key-outline" size={14} color={neoColors.primary} />
            <Text style={styles.passwordToggleText}>Cambiar contraseña</Text>
          </Pressable>
        ) : (
          <>
            <Text style={styles.label}>Nueva contraseña</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Mínimo 6 caracteres"
              placeholderTextColor={neoColors.textTertiary}
              secureTextEntry
            />
            <Pressable
              style={styles.passwordCancel}
              onPress={() => {
                setShowPasswordField(false);
                setPassword('');
              }}
            >
              <Text style={styles.passwordCancelText}>Cancelar cambio de contraseña</Text>
            </Pressable>
          </>
        )}

        <Pressable style={[styles.saveButton, !canSave && styles.saveButtonDisabled]} onPress={handleSave} disabled={!canSave}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{isNew ? 'Guardar chofer' : 'Guardar cambios'}</Text>}
        </Pressable>
      </NeoCard>

      {!isNew && (
        <>
          <Pressable style={styles.actionRow} onPress={() => router.push(`/admin/schedule?driver=${id}&from=driver`)}>
            <Ionicons name="calendar-outline" size={16} color={neoColors.primary} />
            <Text style={styles.actionRowText}>Horario</Text>
          </Pressable>

          <Pressable style={styles.deleteLink} onPress={() => setDeleteModalOpen(true)} hitSlop={8}>
            <Text style={styles.deleteLinkText}>Eliminar chofer</Text>
          </Pressable>
        </>
      )}

      <Modal visible={deleteModalOpen} transparent animationType="fade" onRequestClose={closeDeleteModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            {deleteBlocked ? (
              <>
                <View style={styles.modalHeaderRow}>
                  <Ionicons name="alert-circle-outline" size={22} color={neoColors.warning} />
                  <Text style={styles.modalTitle}>No se puede eliminar</Text>
                </View>
                <Text style={styles.modalText}>{deleteBlocked.message}</Text>
                <Pressable style={styles.deactivateButton} onPress={handleDeactivateFromBlockedModal} disabled={saving}>
                  <Text style={styles.deactivateButtonText}>Desactivar chofer en su lugar</Text>
                </Pressable>
                <Pressable style={styles.modalCancel} onPress={closeDeleteModal}>
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.modalHeaderRow}>
                  <Ionicons name="warning-outline" size={22} color={neoColors.danger} />
                  <Text style={styles.modalTitle}>Eliminar chofer</Text>
                </View>
                <Text style={styles.modalText}>
                  Esta acción es permanente y no se puede deshacer. Se eliminará por completo la cuenta de {name || 'este chofer'}.
                </Text>
                <Text style={styles.modalLabel}>Escribe {DELETE_CONFIRM_WORD} para confirmar</Text>
                <TextInput
                  style={styles.modalInput}
                  value={confirmText}
                  onChangeText={setConfirmText}
                  placeholder={DELETE_CONFIRM_WORD}
                  placeholderTextColor={neoColors.textTertiary}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                {deleteError ? <Text style={styles.error}>{deleteError}</Text> : null}
                <Pressable
                  style={[styles.destructiveButton, (confirmText !== DELETE_CONFIRM_WORD || deleting) && styles.destructiveButtonDisabled]}
                  onPress={handleConfirmDelete}
                  disabled={confirmText !== DELETE_CONFIRM_WORD || deleting}
                >
                  {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.destructiveButtonText}>Eliminar permanentemente</Text>}
                </Pressable>
                <Pressable style={styles.modalCancel} onPress={closeDeleteModal} disabled={deleting}>
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neoColors.background },
  content: { padding: neoSpacing.lg, paddingBottom: neoSpacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: neoSpacing.lg },

  header: { marginBottom: neoSpacing.lg },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginBottom: neoSpacing.md },
  backRowText: { color: neoColors.primary, fontWeight: '700', fontSize: 14 },
  title: { ...neoTypography.title, fontSize: 20, color: neoColors.ink },

  error: { color: neoColors.danger, fontWeight: '700', marginBottom: neoSpacing.sm },
  success: { color: neoColors.success, fontWeight: '700', marginBottom: neoSpacing.sm },

  cardWrap: { marginBottom: neoSpacing.md },
  cardBody: { padding: neoSpacing.md },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: neoSpacing.sm },
  cardEyebrow: { ...neoTypography.headline, fontSize: 12, color: neoColors.textSecondary },
  toggle: { borderWidth: 2, borderColor: neoColors.ink, borderRadius: neoRadii.full, paddingHorizontal: neoSpacing.md, paddingVertical: 4 },
  toggleActive: { backgroundColor: neoColors.successMuted, borderColor: neoColors.success },
  toggleText: { fontSize: 12, fontWeight: '800', color: neoColors.textSecondary },
  toggleTextActive: { color: neoColors.success },

  label: { ...neoTypography.headline, fontSize: 12, color: neoColors.textSecondary, marginBottom: neoSpacing.xs, marginTop: neoSpacing.sm },
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
  },

  passwordToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: neoSpacing.md },
  passwordToggleText: { color: neoColors.primary, fontWeight: '700', fontSize: 13 },
  passwordCancel: { alignSelf: 'flex-start', marginTop: neoSpacing.xs },
  passwordCancelText: { color: neoColors.textSecondary, fontSize: 12, fontWeight: '600' },

  saveButton: { backgroundColor: neoColors.primary, borderRadius: neoRadii.md, paddingVertical: neoSpacing.md, alignItems: 'center', marginTop: neoSpacing.lg },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: neoSpacing.xs,
    alignSelf: 'flex-start',
    marginBottom: neoSpacing.lg,
  },
  actionRowText: { color: neoColors.primary, fontWeight: '700', fontSize: 14 },

  deleteLink: { alignSelf: 'center', marginTop: neoSpacing.xl },
  deleteLinkText: { color: neoColors.danger, fontSize: 13, fontWeight: '700' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: neoSpacing.lg },
  modalSheet: {
    backgroundColor: neoColors.surface,
    borderWidth: 2,
    borderColor: neoColors.ink,
    borderRadius: neoRadii.lg,
    padding: neoSpacing.lg,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: neoSpacing.xs, marginBottom: neoSpacing.sm },
  modalTitle: { fontSize: 17, fontWeight: '800', color: neoColors.ink },
  modalText: { ...neoTypography.body, color: neoColors.textSecondary, marginBottom: neoSpacing.md },
  modalLabel: { ...neoTypography.headline, fontSize: 12, color: neoColors.textSecondary, marginBottom: neoSpacing.xs },
  modalInput: {
    borderWidth: 2,
    borderColor: neoColors.danger,
    borderRadius: neoRadii.md,
    paddingHorizontal: neoSpacing.md,
    paddingVertical: neoSpacing.md,
    fontSize: 14,
    fontWeight: '700',
    backgroundColor: neoColors.surface,
    color: neoColors.ink,
    marginBottom: neoSpacing.md,
  },
  destructiveButton: { backgroundColor: neoColors.danger, borderRadius: neoRadii.md, paddingVertical: neoSpacing.md, alignItems: 'center' },
  destructiveButtonDisabled: { opacity: 0.4 },
  destructiveButtonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  deactivateButton: { backgroundColor: neoColors.primary, borderRadius: neoRadii.md, paddingVertical: neoSpacing.md, alignItems: 'center' },
  deactivateButtonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  modalCancel: { alignItems: 'center', marginTop: neoSpacing.md },
  modalCancelText: { color: neoColors.textSecondary, fontWeight: '700', fontSize: 13 },
});
