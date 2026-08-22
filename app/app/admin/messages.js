import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as usersApi from '../../src/modules/users/api';
import * as messagingApi from '../../src/modules/messaging/api';
import ScreenHeader from '../../src/shared/ScreenHeader';

export default function MessagesScreen() {
  const { token } = useAuth();

  const [drivers, setDrivers] = useState([]);
  const [selectedDriverIds, setSelectedDriverIds] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [sent, setSent] = useState([]);
  const [loadingSent, setLoadingSent] = useState(true);

  const loadDrivers = useCallback(async () => {
    try {
      const users = await usersApi.listUsers(token);
      setDrivers(users.filter((u) => u.role === 'driver'));
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los choferes');
    }
  }, [token]);

  const loadSent = useCallback(async () => {
    setLoadingSent(true);
    try {
      setSent(await messagingApi.listAllMessages(token));
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los mensajes enviados');
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
      await messagingApi.sendMessage(token, { recipients: selectedDriverIds, subject: subject.trim(), body: body.trim() });
      setSuccess('Mensaje enviado.');
      setSubject('');
      setBody('');
      setSelectedDriverIds([]);
      await loadSent();
    } catch (err) {
      setError(err.message || 'No se pudo enviar el mensaje');
    } finally {
      setSending(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader
        title="Mensajes"
        backHref="/admin"
        onRefresh={() => {
          loadDrivers();
          loadSent();
        }}
        refreshing={loadingSent}
      />

      <Text style={styles.sectionTitle}>Destinatarios</Text>
      <View style={styles.driverRow}>
        {drivers.map((d) => {
          const selected = selectedDriverIds.includes(d._id);
          return (
            <Pressable key={d._id} style={[styles.driverChip, selected && styles.driverChipActive]} onPress={() => toggleDriver(d._id)}>
              <Text style={[styles.driverChipText, selected && styles.driverChipTextActive]}>{d.name}</Text>
            </Pressable>
          );
        })}
      </View>
      {drivers.length === 0 && <Text style={styles.empty}>No hay choferes registrados.</Text>}

      <Text style={styles.sectionTitle}>Asunto (opcional)</Text>
      <TextInput style={styles.input} value={subject} onChangeText={setSubject} placeholder="Asunto" />

      <Text style={styles.sectionTitle}>Mensaje</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={body}
        onChangeText={setBody}
        placeholder="Escribe tu mensaje"
        multiline
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {success ? <Text style={styles.success}>{success}</Text> : null}

      <Pressable style={styles.button} onPress={handleSend} disabled={sending}>
        {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Enviar mensaje</Text>}
      </Pressable>

      <Text style={styles.sectionTitle}>Mensajes enviados</Text>
      {loadingSent ? (
        <ActivityIndicator />
      ) : sent.length === 0 ? (
        <Text style={styles.empty}>Todavía no se han enviado mensajes.</Text>
      ) : (
        sent.map((m) => (
          <View key={m._id} style={styles.card}>
            <Text style={styles.cardSubject}>{m.subject || '(sin asunto)'}</Text>
            <Text style={styles.cardBody}>{m.body}</Text>
            <Text style={styles.cardMeta}>
              Para: {m.recipients.map((r) => r.name).join(', ')} · {new Date(m.createdAt).toLocaleString()}
            </Text>
            <Text style={styles.cardMeta}>Leído por: {m.readBy.length === 0 ? 'nadie todavía' : m.readBy.map((r) => r.driver.name).join(', ')}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 60 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  driverRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  driverChip: { borderWidth: 1, borderColor: '#2563eb', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  driverChipActive: { backgroundColor: '#2563eb' },
  driverChipText: { color: '#2563eb', fontWeight: '600' },
  driverChipTextActive: { color: '#fff' },
  empty: { color: '#666', marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  error: { color: '#dc2626', marginTop: 8 },
  success: { color: '#16a34a', marginTop: 8 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  card: { borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 10, padding: 12, marginBottom: 10 },
  cardSubject: { fontSize: 15, fontWeight: '700' },
  cardBody: { fontSize: 13, color: '#333', marginTop: 4 },
  cardMeta: { fontSize: 12, color: '#666', marginTop: 6 },
});
