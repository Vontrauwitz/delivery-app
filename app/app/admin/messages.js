import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as usersApi from '../../src/modules/users/api';
import * as messagingApi from '../../src/modules/messaging/api';
import NeoCard from '../../src/modules/dashboard/NeoCard';
import { neoColors, neoSpacing, neoRadii, neoTypography } from '../../src/shared/neoTheme';

// Mensajes is a top-level operational tool reached directly from the dashboard (not nested under
// Configuración), so it uses the same "title + home icon" header as the dashboard itself and
// Configuración's own landing — never a "← X" back-row, which is reserved for screens one level
// under a hub.
function Header({ onHome }) {
  return (
    <View style={styles.headerRow}>
      <Text style={styles.title}>Mensajes</Text>
      <Pressable style={styles.iconButton} onPress={onHome} hitSlop={8}>
        <Ionicons name="home-outline" size={18} color={neoColors.ink} />
      </Pressable>
    </View>
  );
}

export default function MessagesScreen() {
  const { token } = useAuth();
  const router = useRouter();

  const [drivers, setDrivers] = useState([]);
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const [selectedDriverIds, setSelectedDriverIds] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [important, setImportant] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [sent, setSent] = useState([]);
  const [loadingSent, setLoadingSent] = useState(true);
  const [sentError, setSentError] = useState('');

  const loadDrivers = useCallback(async () => {
    setLoadingDrivers(true);
    try {
      const users = await usersApi.listUsers(token);
      setDrivers(users.filter((u) => u.role === 'driver'));
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los choferes');
    } finally {
      setLoadingDrivers(false);
    }
  }, [token]);

  const loadSent = useCallback(async () => {
    setLoadingSent(true);
    setSentError('');
    try {
      setSent(await messagingApi.listAllMessages(token));
    } catch (err) {
      setSentError(err.message || 'No se pudieron cargar los mensajes enviados');
    } finally {
      setLoadingSent(false);
    }
  }, [token]);

  useEffect(() => {
    loadDrivers();
    loadSent();
  }, [loadDrivers, loadSent]);

  function toggleDriver(id) {
    setSelectedDriverIds((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  }

  async function handleSend() {
    setError('');
    setSuccess('');
    if (selectedDriverIds.length === 0) {
      setError('Selecciona al menos un chofer');
      return;
    }
    if (!body.trim()) {
      setError('El mensaje no puede estar vacío');
      return;
    }
    setSending(true);
    try {
      await messagingApi.sendMessage(token, {
        recipients: selectedDriverIds,
        subject: subject.trim(),
        body: body.trim(),
        important,
      });
      setSuccess('Mensaje enviado.');
      setSubject('');
      setBody('');
      setImportant(false);
      setSelectedDriverIds([]);
      await loadSent();
    } catch (err) {
      setError(err.message || 'No se pudo enviar el mensaje');
    } finally {
      setSending(false);
    }
  }

  const canSend = selectedDriverIds.length > 0 && body.trim().length > 0 && !sending;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Header onHome={() => router.push('/admin')} />

      <NeoCard style={styles.cardWrap} contentStyle={styles.cardBody}>
        <Text style={styles.label}>Destinatarios</Text>
        <View style={styles.chipRow}>
          {drivers.map((d) => {
            const selected = selectedDriverIds.includes(d._id);
            return (
              <Pressable key={d._id} style={[styles.chip, selected && styles.chipActive]} onPress={() => toggleDriver(d._id)}>
                <Text style={[styles.chipText, selected && styles.chipTextActive]}>{d.name}</Text>
              </Pressable>
            );
          })}
        </View>
        {loadingDrivers ? (
          <ActivityIndicator color={neoColors.primary} style={{ marginTop: neoSpacing.sm }} />
        ) : drivers.length === 0 ? (
          <Text style={styles.empty}>No hay choferes registrados.</Text>
        ) : null}

        <Text style={styles.label}>Asunto (opcional)</Text>
        <TextInput style={styles.input} value={subject} onChangeText={setSubject} placeholder="Asunto" placeholderTextColor={neoColors.textTertiary} />

        <Text style={styles.label}>Mensaje</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={body}
          onChangeText={setBody}
          placeholder="Escribe tu mensaje"
          placeholderTextColor={neoColors.textTertiary}
          multiline
        />

        <Pressable style={[styles.importantToggle, important && styles.importantToggleActive]} onPress={() => setImportant((v) => !v)}>
          <Ionicons name={important ? 'alert-circle' : 'alert-circle-outline'} size={16} color={important ? neoColors.warning : neoColors.textSecondary} />
          <Text style={[styles.importantToggleText, important && styles.importantToggleTextActive]}>Marcar como importante</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {success ? <Text style={styles.success}>{success}</Text> : null}

        <Pressable style={[styles.sendButton, !canSend && styles.sendButtonDisabled]} onPress={handleSend} disabled={!canSend}>
          {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendButtonText}>Enviar mensaje</Text>}
        </Pressable>
      </NeoCard>

      <Text style={styles.sectionTitle}>Mensajes enviados</Text>
      {sentError ? <Text style={styles.error}>{sentError}</Text> : null}
      {loadingSent ? (
        <ActivityIndicator color={neoColors.primary} style={{ marginTop: neoSpacing.md }} />
      ) : sent.length === 0 ? (
        <Text style={styles.empty}>Todavía no se han enviado mensajes.</Text>
      ) : (
        sent.map((m) => (
          <NeoCard key={m._id} accentColor={m.important ? neoColors.warning : undefined} style={styles.cardWrap} contentStyle={styles.cardBody}>
            <View style={styles.messageHeaderRow}>
              <Text style={styles.messageSubject} numberOfLines={1}>
                {m.subject || '(sin asunto)'}
              </Text>
              {m.important && (
                <View style={styles.importantPill}>
                  <Ionicons name="alert-circle" size={12} color={neoColors.warning} />
                  <Text style={styles.importantPillText}>Importante</Text>
                </View>
              )}
            </View>
            <Text style={styles.messageBody}>{m.body}</Text>
            <Text style={styles.messageMeta}>
              Para: {m.recipients.map((r) => r.name).join(', ')} · {new Date(m.createdAt).toLocaleString()}
            </Text>
            <Text style={styles.messageMeta}>Leído por: {m.readBy.length === 0 ? 'nadie todavía' : m.readBy.map((r) => r.driver.name).join(', ')}</Text>
          </NeoCard>
        ))
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
  },
  textArea: { minHeight: 90, textAlignVertical: 'top' },

  importantToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: neoSpacing.xs,
    alignSelf: 'flex-start',
    marginTop: neoSpacing.md,
    borderWidth: 2,
    borderColor: neoColors.neutralMuted,
    borderRadius: neoRadii.full,
    paddingHorizontal: neoSpacing.md,
    paddingVertical: neoSpacing.xs,
  },
  importantToggleActive: { borderColor: neoColors.warning, backgroundColor: neoColors.warningMuted },
  importantToggleText: { color: neoColors.textSecondary, fontWeight: '700', fontSize: 13 },
  importantToggleTextActive: { color: neoColors.warning },

  error: { color: neoColors.danger, fontWeight: '700', marginTop: neoSpacing.sm },
  success: { color: neoColors.success, fontWeight: '700', marginTop: neoSpacing.sm },
  empty: { color: neoColors.textSecondary, marginTop: neoSpacing.sm },

  sendButton: { backgroundColor: neoColors.primary, borderRadius: neoRadii.md, paddingVertical: neoSpacing.md, alignItems: 'center', marginTop: neoSpacing.lg },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  sectionTitle: { ...neoTypography.title, fontSize: 18, color: neoColors.ink, marginBottom: neoSpacing.md },

  messageHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: neoSpacing.xs },
  messageSubject: { fontSize: 15, fontWeight: '800', color: neoColors.ink, flexShrink: 1 },
  messageBody: { ...neoTypography.body, color: neoColors.ink, marginTop: neoSpacing.xs },
  messageMeta: { ...neoTypography.caption, color: neoColors.textSecondary, marginTop: neoSpacing.xs },

  importantPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: neoColors.warningMuted,
    borderRadius: neoRadii.full,
    paddingHorizontal: neoSpacing.sm,
    paddingVertical: 2,
  },
  importantPillText: { color: neoColors.warning, fontSize: 11, fontWeight: '800' },
});
