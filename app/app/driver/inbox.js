import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as messagingApi from '../../src/modules/messaging/api';
import ScreenHeader from '../../src/shared/ScreenHeader';

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
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : messages.length === 0 ? (
        <Text style={styles.empty}>No tienes mensajes.</Text>
      ) : (
        messages.map((m) => (
          <Pressable key={m._id} style={[styles.card, m._id === selectedId && styles.cardActive]} onPress={() => openMessage(m)}>
            <View style={styles.cardRow}>
              <Text style={[styles.subject, !m.isRead && styles.subjectUnread]}>{m.subject || '(sin asunto)'}</Text>
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
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 60 },
  error: { color: '#dc2626', marginBottom: 8 },
  empty: { color: '#666', marginTop: 20, textAlign: 'center' },
  card: { borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 10, padding: 12, marginBottom: 10 },
  cardActive: { borderColor: '#2563eb' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  subject: { fontSize: 15, fontWeight: '500', flexShrink: 1 },
  subjectUnread: { fontWeight: '700' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2563eb' },
  meta: { fontSize: 12, color: '#666', marginTop: 2 },
  body: { fontSize: 14, color: '#333', marginTop: 10, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10 },
});
