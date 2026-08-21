import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../../src/modules/auth/useAuth';
import WorkStatusCard from '../../src/modules/workShifts/WorkStatusCard';

export default function DriverHome() {
  const { user, token, signOut } = useAuth();
  const [hasOpenShift, setHasOpenShift] = useState(false);

  const handleShiftChange = useCallback((shift) => {
    setHasOpenShift(!!shift);
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Hola, {user?.name}</Text>
      <Text style={styles.subtitle}>Panel del chofer</Text>

      <WorkStatusCard token={token} onShiftChange={handleShiftChange} />

      <Link href="/driver/new-sale" asChild>
        <Pressable style={hasOpenShift ? styles.actionButton : styles.actionButtonWaiting}>
          <Text style={styles.actionButtonText}>Nueva venta</Text>
        </Pressable>
      </Link>
      {!hasOpenShift && <Text style={styles.disabledHint}>Inicia tu turno para poder registrar una venta.</Text>}

      <Link href="/driver/my-sales" asChild>
        <Pressable style={styles.actionButtonSecondary}>
          <Text style={styles.actionButtonSecondaryText}>Mis ventas</Text>
        </Pressable>
      </Link>

      <Link href="/driver/inventory" asChild>
        <Pressable style={styles.actionButtonSecondary}>
          <Text style={styles.actionButtonSecondaryText}>Inventario</Text>
        </Pressable>
      </Link>

      <Pressable style={styles.button} onPress={signOut}>
        <Text style={styles.buttonText}>Cerrar sesión</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
    marginBottom: 16,
  },
  actionButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 4,
  },
  actionButtonWaiting: {
    backgroundColor: '#93c5fd',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 4,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  disabledHint: {
    color: '#666',
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 20,
  },
  actionButtonSecondary: {
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButtonSecondaryText: {
    color: '#2563eb',
    fontWeight: '600',
    fontSize: 16,
  },
  button: {
    backgroundColor: '#dc2626',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
