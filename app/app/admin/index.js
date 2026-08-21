import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../../src/modules/auth/useAuth';

export default function AdminHome() {
  const { user, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hola, {user?.name}</Text>
      <Text style={styles.subtitle}>Panel administrativo</Text>
      <Text style={styles.info}>
        Revisa y autoriza las ventas de los choferes. Inventarios, cierres y más llegarán en próximas fases.
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

      <Pressable style={styles.button} onPress={signOut}>
        <Text style={styles.buttonText}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#fff',
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
