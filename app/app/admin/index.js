import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as approvalsApi from '../../src/modules/approvals/api';
import { colors, spacing, radii, typography, softShadow } from '../../src/shared/theme';

// Primary business actions only — the four things a manager actually does every day. Anything
// technical (sessions, accounting periods, weekly counts as a separate concept...) lives one
// level down, inside the screen it belongs to, never as its own top-level button here.
const PRIMARY = [
  { href: '/admin/sales-pending', label: 'Ventas pendientes', icon: '🧾' },
  { href: '/admin/drivers-map', label: 'Choferes trabajando', icon: '📍' },
  { href: '/admin/inventory', label: 'Inventario', icon: '📦' },
  { href: '/admin/closings', label: 'Cierre', icon: '✅' },
];

const SECONDARY = [
  { href: '/admin/schedule', label: 'Programación' },
  { href: '/admin/promotions', label: 'Promociones' },
  { href: '/admin/weekly-report', label: 'Reportes' },
  { href: '/admin/settings', label: 'Configuración' },
];

export default function AdminHome() {
  const { user, token, signOut } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    approvalsApi
      .listPendingSales(token)
      .then((sales) => setPendingCount(sales.length))
      .catch(() => {});
  }, [token]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.greeting}>Hola, {user?.name}</Text>
      <Text style={styles.subtitle}>Panel administrativo</Text>

      <View style={styles.primaryGrid}>
        {PRIMARY.map((item) => (
          <Link key={item.href} href={item.href} asChild>
            <Pressable style={styles.primaryCard}>
              {item.href === '/admin/sales-pending' && pendingCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{pendingCount}</Text>
                </View>
              )}
              <Text style={styles.primaryIcon}>{item.icon}</Text>
              <Text style={styles.primaryLabel}>{item.label}</Text>
            </Pressable>
          </Link>
        ))}
      </View>

      <View style={styles.secondaryList}>
        {SECONDARY.map((item, index) => (
          <Link key={item.href} href={item.href} asChild>
            <Pressable
              style={StyleSheet.flatten([
                styles.secondaryRow,
                index === SECONDARY.length - 1 && { borderBottomWidth: 0 },
              ])}
            >
              <Text style={styles.secondaryLabel}>{item.label}</Text>
              <Text style={styles.secondaryChevron}>›</Text>
            </Pressable>
          </Link>
        ))}
      </View>

      <View style={styles.tertiaryRow}>
        <Link href="/admin/messages" asChild>
          <Pressable>
            <Text style={styles.tertiaryLink}>Mensajes</Text>
          </Pressable>
        </Link>
        <Link href="/admin/dispatch" asChild>
          <Pressable>
            <Text style={styles.tertiaryLink}>Dispatch</Text>
          </Pressable>
        </Link>
      </View>

      <Pressable style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Cerrar sesión</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },

  greeting: { ...typography.title, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.xl },

  primaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  primaryCard: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...softShadow,
  },
  primaryIcon: { fontSize: 28, marginBottom: spacing.sm },
  primaryLabel: { ...typography.headline, color: colors.textPrimary, textAlign: 'center' },
  badge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.danger,
    borderRadius: radii.full,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  secondaryList: {
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  secondaryLabel: { ...typography.body, color: colors.textPrimary },
  secondaryChevron: { color: colors.textTertiary, fontSize: 18 },

  tertiaryRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl, marginTop: spacing.xl },
  tertiaryLink: { color: colors.textSecondary, fontSize: 13 },

  signOutButton: { alignItems: 'center', marginTop: spacing.xxl },
  signOutText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
});
