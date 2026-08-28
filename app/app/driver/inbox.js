import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as messagingApi from '../../src/modules/messaging/api';
import ScreenHeader from '../../src/shared/ScreenHeader';
import { colors, spacing, radii, typography, softShadow } from '../../src/shared/theme';

export default function InboxScreen() {
  const { token } = useAuth();
  const [messages, setMessages] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setMessages(await messagingApi.listInbox(token));
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los mensajes');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function openMessage(message) {
    const opening = selectedId !== message._id;
    setSelectedId(opening ? message._id : null);

    if (opening && !message.isRead) {
      try {
        const updated = await messagingApi.markRead(token, message._id);
        setMessages((prev) => prev.map((m) => (m._id === updated._id ? updated : m)));
      } catch (err) {
        setError(err.message || 'No se pudo marcar como leído');
      }
    }
  }

  const unreadCount = messages.filter((m) => !m.isRead).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader
        title={unreadCount > 0 ? `Mensajes (${unreadCount} sin leer)` : 'Mensajes'}
        backHref="/driver"
        onRefresh={load}
        refreshing={loading}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : messages.length === 0 ? (
        <Text style={styles.empty}>No tienes mensajes.</Text>
      ) : (
        messages.map((m) => (
          <Pressable key={m._id} style={[styles.card, m._id === selectedId && styles.cardActive]} onPress={() => openMessage(m)}>
            <View style={styles.cardRow}>
              <View style={styles.subjectRow}>
                {m.important && <Ionicons name="alert-circle" size={15} color={colors.warning} style={styles.importantIcon} />}
                <Text style={[styles.subject, !m.isRead && styles.subjectUnread]} numberOfLines={1}>
                  {m.subject || '(sin asunto)'}
                </Text>
              </View>
              {!m.isRead && <View style={styles.unreadDot} />}
            </View>
            <Text style={styles.meta}>
              {m.sender?.name} · {new Date(m.createdAt).toLocaleString()}
            </Text>
            {m._id === selectedId && <Text style={styles.body}>{m.body}</Text>}
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  error: { color: colors.danger, marginBottom: spacing.sm },
  empty: { color: colors.textSecondary, marginTop: spacing.xl, textAlign: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...softShadow,
  },
  cardActive: { borderColor: colors.primary },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  subjectRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  importantIcon: { marginRight: 2 },
  subject: { ...typography.callout, fontWeight: '500', flexShrink: 1, color: colors.textPrimary },
  subjectUnread: { fontWeight: '700' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  body: { ...typography.subhead, color: colors.textPrimary, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
});
