import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, radii } from '../../shared/theme';

const MODES = [
  { value: 'CASH', label: 'Efectivo' },
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'MIXED', label: 'Mixto' },
];

export default function PaymentModeSelector({ value, onChange }) {
  return (
    <View style={styles.row}>
      {MODES.map((mode) => (
        <Pressable
          key={mode.value}
          style={[styles.button, value === mode.value && styles.buttonActive]}
          onPress={() => onChange(mode.value)}
        >
          <Text style={[styles.buttonText, value === mode.value && styles.buttonTextActive]}>{mode.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  button: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  buttonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  buttonText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },
  buttonTextActive: { color: '#fff' },
});
