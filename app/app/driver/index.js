import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../../src/modules/auth/useAuth';
import WorkStatusCard from '../../src/modules/workShifts/WorkStatusCard';
import LocationStatusCard from '../../src/modules/locations/LocationStatusCard';
import * as messagingApi from '../../src/modules/messaging/api';
import * as dispatchApi from '../../src/modules/dispatch/api';
import * as inventoryApi from '../../src/modules/inventory/api';

const SESSION_STATUS_LABELS = {
  OPEN: 'Sesión de inventario abierta',
  CLOSING_PENDING: 'Cierre pendiente de revisión',
};
const SESSION_STATUS_COLORS = {
  OPEN: '#16a34a',
  CLOSING_PENDING: '#d97706',
};

export default function DriverHome() {
  const { user, token, signOut } = useAuth();
  const [hasOpenShift, setHasOpenShift] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingDispatchCount, setPendingDispatchCount] = useState(0);
  const [inventorySession, setInventorySession] = useState(null);

  const handleShiftChange = useCallback((shift) => {
    setHasOpenShift(!!shift);
  }, []);

  useEffect(() => {
    messagingApi
      .listInbox(token)
      .then((messages) => setUnreadCount(messages.filter((m) => !m.isRead).length))
      .catch(() => {});
    dispatchApi
      .listMine(token)
      .then((dispatches) => setPendingDispatchCount(dispatches.filter((d) => d.status === 'PENDING' || d.status === 'ACCEPTED').length))
      .catch(() => {});
    inventoryApi
      .getMyActiveSession(token)
      .then(setInventorySession)
      .catch(() => setInventorySession(null));
  }, [token]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Hola, {user?.name}</Text>
      <Text style={styles.subtitle}>Panel del chofer</Text>

      <WorkStatusCard token={token} onShiftChange={handleShiftChange} />
      <LocationStatusCard token={token} />

      {inventorySession && (
        <View style={[styles.sessionPill, { borderColor: SESSION_STATUS_COLORS[inventorySession.status] }]}>
          <Text style={[styles.sessionPillText, { color: SESSION_STATUS_COLORS[inventorySession.status] }]}>
            {SESSION_STATUS_LABELS[inventorySession.status] || inventorySession.status}
          </Text>
        </View>
      )}

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

      <Link href="/driver/inbox" asChild>
        <Pressable style={styles.actionButtonSecondary}>
          <View style={styles.buttonRow}>
            <Text style={styles.actionButtonSecondaryText}>Mensajes</Text>
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>
        </Pressable>
      </Link>

      <Link href="/driver/dispatch" asChild>
        <Pressable style={styles.actionButtonSecondary}>
          <View style={styles.buttonRow}>
            <Text style={styles.actionButtonSecondaryText}>Dispatch</Text>
            {pendingDispatchCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingDispatchCount}</Text>
              </View>
            )}
          </View>
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
  sessionPill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  sessionPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    backgroundColor: '#dc2626',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
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
