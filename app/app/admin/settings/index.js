import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import NeoCard from '../../../src/modules/dashboard/NeoCard';
import { neoColors, neoSpacing, neoRadii, neoTypography } from '../../../src/shared/neoTheme';

// Configuración is a category landing, not a form itself — each row below owns its own screen.
// "Zona peligrosa" is a planned future category here, deliberately not built yet.
const CATEGORIES = [
  {
    key: 'drivers',
    icon: 'people-outline',
    title: 'Choferes',
    description: 'Gestiona usuarios, estado y acceso.',
    href: '/admin/drivers',
  },
  {
    key: 'schedule',
    icon: 'calendar-outline',
    title: 'Horarios',
    description: 'Configura horarios normales, cambios por día y turnos especiales.',
    href: '/admin/schedule?from=settings',
  },
  {
    key: 'replenishment',
    icon: 'cube-outline',
    title: 'Reabastecimiento',
    description: 'Define cobertura y stock de seguridad por producto.',
    href: '/admin/settings/replenishment',
  },
  {
    key: 'alerts',
    icon: 'warning-outline',
    title: 'Alertas',
    description: 'Activa, desactiva y ajusta las reglas de alerta operativa.',
    href: '/admin/settings/alerts',
  },
];

function CategoryRow({ icon, title, description, onPress }) {
  return (
    <NeoCard onPress={onPress} style={styles.rowWrap} contentStyle={styles.rowContent}>
      <View style={styles.rowIconWrap}>
        <Ionicons name={icon} size={22} color={neoColors.primary} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={neoColors.textTertiary} />
    </NeoCard>
  );
}

export default function SettingsScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Configuración</Text>
        <Pressable style={styles.iconButton} onPress={() => router.push('/admin')} hitSlop={8}>
          <Ionicons name="home-outline" size={18} color={neoColors.ink} />
        </Pressable>
      </View>

      {CATEGORIES.map((category) => (
        <CategoryRow
          key={category.key}
          icon={category.icon}
          title={category.title}
          description={category.description}
          onPress={() => router.push(category.href)}
        />
      ))}
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

  rowWrap: { width: '100%' },
  rowContent: { flexDirection: 'row', alignItems: 'center', gap: neoSpacing.sm, padding: neoSpacing.md },
  rowIconWrap: {
    width: 40,
    height: 40,
    borderRadius: neoRadii.md,
    backgroundColor: neoColors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '800', color: neoColors.ink },
  rowDescription: { ...neoTypography.caption, color: neoColors.textSecondary, marginTop: 2 },
});
