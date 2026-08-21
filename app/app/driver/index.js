import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../../src/modules/auth/useAuth';

export default function DriverHome() {
  const { user, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hola, {user?.name}</Text>
      <Text style={styles.subtitle}>Panel del chofer</Text>
      <Text style={styles.info}>
        Registra tus ventas y revisa su estado. El inventario y los mensajes llegarán en próximas fases.
      </Text>

      <Link href="/driver/new-sale" asChild>
        <Pressable style={styles.actionButton}>
          <Text style={styles.actionButtonText}>Nueva venta</Text>
        </Pressable>
      </Link>

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
    marginBottom: 24,
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
