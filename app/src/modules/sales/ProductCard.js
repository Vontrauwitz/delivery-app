import { View, Text, Pressable, StyleSheet } from 'react-native';
import { formatCurrency } from '../../shared/money';
import { colors, spacing, radii, typography, softShadow } from '../../shared/theme';

export default function ProductCard({ product, quantity, promotion, onIncrement, onDecrement, style }) {
  const selected = quantity > 0;

  return (
    <Pressable style={[styles.card, selected && styles.cardSelected, style]} onPress={onIncrement}>
      {selected && (
        <View style={styles.qtyBadge}>
          <Text style={styles.qtyBadgeText}>{quantity}</Text>
        </View>
      )}
      <Text style={styles.icon}>{product.icon || '📦'}</Text>
      <Text style={styles.name} numberOfLines={2}>
        {product.name}
      </Text>
      <Text style={styles.price}>{formatCurrency(product.basePrice)}</Text>
      {promotion && (
        <Text style={styles.promoTag}>
          {promotion.quantity} x {formatCurrency(promotion.bundlePrice)}
        </Text>
      )}
      {selected && (
        <Pressable
          style={styles.removeButton}
          hitSlop={10}
          onPress={(event) => {
            event?.stopPropagation?.();
            onDecrement();
          }}
        >
          <Text style={styles.removeButtonText}>−</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexBasis: '47%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    minHeight: 128,
    backgroundColor: colors.surface,
    ...softShadow,
  },
  cardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  icon: { fontSize: 34, marginBottom: spacing.xs },
  name: { ...typography.headline, color: colors.textPrimary, textAlign: 'center' },
  price: { ...typography.callout, color: colors.textSecondary, marginTop: 2 },
  promoTag: { ...typography.caption, color: colors.primary, fontWeight: '700', marginTop: spacing.xs },
  qtyBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    minWidth: 26,
    height: 26,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBadgeText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  removeButton: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    width: 30,
    height: 30,
    borderRadius: radii.full,
    backgroundColor: colors.neutralMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: { fontSize: 20, fontWeight: '700', color: colors.textSecondary, lineHeight: 22 },
});
