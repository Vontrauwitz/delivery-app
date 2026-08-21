import { View, Text, Pressable, StyleSheet } from 'react-native';

export default function ProductPicker({ products, quantities, onChangeQuantity }) {
  return (
    <View>
      {products.map((product) => {
        const quantity = quantities[product._id] || 0;
        return (
          <View key={product._id} style={styles.card}>
            <Text style={styles.icon}>{product.icon || '📦'}</Text>
            <View style={styles.info}>
              <Text style={styles.name}>{product.name}</Text>
              <Text style={styles.price}>${product.basePrice.toFixed(2)}</Text>
            </View>
            <View style={styles.stepper}>
              <Pressable
                style={styles.stepperButton}
                onPress={() => onChangeQuantity(product._id, Math.max(0, quantity - 1))}
              >
                <Text style={styles.stepperText}>-</Text>
              </Pressable>
              <Text style={styles.quantity}>{quantity}</Text>
              <Pressable
                style={styles.stepperButton}
                onPress={() => onChangeQuantity(product._id, quantity + 1)}
              >
                <Text style={styles.stepperText}>+</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  icon: { fontSize: 28, marginRight: 12 },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  price: { fontSize: 14, color: '#666', marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  quantity: { width: 32, textAlign: 'center', fontSize: 16, fontWeight: '600' },
});
