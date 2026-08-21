import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../../src/modules/auth/useAuth';

export default function AdminHome() {
  const { user, signOut } = useAuth();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Hola, {user?.name}</Text>
      <Text style={styles.subtitle}>Panel administrativo</Text>
      <Text style={styles.info}>
        Revisa y autoriza las ventas de los choferes, administra inventario, cierres y turnos.
      </Text>

      <Link href="/admin/sales-pending" asChild>
        <Pressable style={styles.actionButton}>
          <Text style={styles.actionButtonText}>Ventas pendientes</Text>
        </Pressable>
      </Link>

      <Link href="/admin/inventory" asChild>
        <Pressable style={styles.actionButtonSecondary}>
          <Text style={styles.actionButtonSecondaryText}>Inventario</Text>
        </Pressable>
      </Link>

      <Link href="/admin/inventory-open" asChild>
        <Pressable style={styles.actionButtonSecondary}>
          <Text style={styles.actionButtonSecondaryText}>Abrir sesión</Text>
        </Pressable>
      </Link>

      <Link href="/admin/closings" asChild>
        <Pressable style={styles.actionButtonSecondary}>
          <Text style={styles.actionButtonSecondaryText}>Cierres</Text>
        </Pressable>
      </Link>

      <Link href="/admin/shifts" asChild>
        <Pressable style={styles.actionButtonSecondary}>
          <Text style={styles.actionButtonSecondaryText}>Turnos</Text>
        </Pressable>
      </Link>

      <Link href="/admin/replenishment" asChild>
        <Pressable style={styles.actionButtonSecondary}>
          <Text style={styles.actionButtonSecondaryText}>Reabastecimiento</Text>
        </Pressable>
      </Link>

      <Link href="/admin/weekly-count" asChild>
        <Pressable style={styles.actionButtonSecondary}>
          <Text style={styles.actionButtonSecondaryText}>Conteo semanal</Text>
        </Pressable>
      </Link>

      <Link href="/admin/weekly-report" asChild>
        <Pressable style={styles.actionButtonSecondary}>
          <Text style={styles.actionButtonSecondaryText}>Reporte semanal</Text>
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
  info: {
    fontSize: 14,
    color: '#444',
    marginBottom: 24,
  },
  actionButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
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
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
