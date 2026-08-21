import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as productsApi from '../../src/modules/products/api';
import * as salesApi from '../../src/modules/sales/api';
import ProductPicker from '../../src/modules/sales/ProductPicker';
import PaymentSplitInput from '../../src/modules/sales/PaymentSplitInput';
import { round2, formatCurrency } from '../../src/shared/money';

export default function NewSaleScreen() {
  const { token } = useAuth();
  const router = useRouter();

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [quantities, setQuantities] = useState({});
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [transferAmount, setTransferAmount] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    setLoadingProducts(true);
    setLoadError('');
    try {
      const data = await productsApi.listProducts(token);
      setProducts(data.filter((product) => product.active));
    } catch (err) {
      setLoadError(err.message || 'No se pudieron cargar los productos');
    } finally {
      setLoadingProducts(false);
    }
  }

  function handleChangeQuantity(productId, quantity) {
    setQuantities((prev) => ({ ...prev, [productId]: quantity }));
  }

  const items = products
    .map((product) => ({ product, quantity: quantities[product._id] || 0 }))
    .filter((item) => item.quantity > 0);

  const subtotal = round2(items.reduce((sum, item) => sum + item.product.basePrice * item.quantity, 0));
  const adjustmentValue = round2(Number(adjustmentAmount) || 0);
  const totalFinal = round2(subtotal + adjustmentValue);
  const cashValue = round2(Number(cashAmount) || 0);
  const transferValue = round2(Number(transferAmount) || 0);
  const paymentsSum = round2(cashValue + transferValue);
  const paymentsMatch = paymentsSum === totalFinal;
  const needsReason = adjustmentValue !== 0;
  const reasonOk = !needsReason || adjustmentReason.trim().length > 0;
  const canSubmit = items.length > 0 && totalFinal > 0 && paymentsMatch && reasonOk && !submitting;

  async function handleSubmit() {
    setError('');
    setSuccessMessage('');
    setSubmitting(true);
    try {
      const payments = [];
      if (cashValue > 0) payments.push({ method: 'cash', amount: cashValue });
      if (transferValue > 0) payments.push({ method: 'transfer', amount: transferValue });

      await salesApi.createSale(token, {
        items: items.map((item) => ({ product: item.product._id, quantity: item.quantity })),
        adjustment: { amount: adjustmentValue, reason: adjustmentReason.trim() },
        payments,
      });

      setSuccessMessage('Venta registrada. Estado: PENDIENTE, a la espera de revisión del manager.');
      setQuantities({});
      setAdjustmentAmount('');
      setAdjustmentReason('');
      setCashAmount('');
      setTransferAmount('');
    } catch (err) {
      setError(err.message || 'No se pudo registrar la venta');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingProducts) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Nueva venta</Text>

      {loadError ? <Text style={styles.error}>{loadError}</Text> : null}

      <ProductPicker products={products} quantities={quantities} onChangeQuantity={handleChangeQuantity} />

      <Text style={styles.sectionTitle}>Ajuste (opcional)</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder="Monto del ajuste (ej. -5 o 10)"
        value={adjustmentAmount}
        onChangeText={setAdjustmentAmount}
      />
      <TextInput
        style={styles.input}
        placeholder={needsReason ? 'Motivo del ajuste (obligatorio)' : 'Motivo del ajuste'}
        value={adjustmentReason}
        onChangeText={setAdjustmentReason}
      />

      <Text style={styles.sectionTitle}>Pago</Text>
      <PaymentSplitInput
        cashAmount={cashAmount}
        transferAmount={transferAmount}
        onChangeCash={setCashAmount}
        onChangeTransfer={setTransferAmount}
      />

      <View style={styles.summary}>
        <SummaryRow label="Subtotal" value={formatCurrency(subtotal)} />
        <SummaryRow label="Ajuste" value={formatCurrency(adjustmentValue)} />
        <SummaryRow label="Total" value={formatCurrency(totalFinal)} bold />
        <SummaryRow label="Suma de pagos" value={formatCurrency(paymentsSum)} />
        {!paymentsMatch && (
          <Text style={styles.warning}>La suma de los pagos debe ser igual al total.</Text>
        )}
        {needsReason && !reasonOk && (
          <Text style={styles.warning}>El motivo del ajuste es obligatorio.</Text>
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}

      <Pressable
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit}
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Registrar venta</Text>}
      </Pressable>

      <Pressable style={styles.linkButton} onPress={() => router.push('/driver/my-sales')}>
        <Text style={styles.linkText}>Ver mis ventas</Text>
      </Pressable>
    </ScrollView>
  );
}

function SummaryRow({ label, value, bold }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.summaryValue, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    fontSize: 16,
  },
  summary: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  summaryLabel: { fontSize: 14, color: '#333' },
  summaryValue: { fontSize: 14, color: '#333' },
  bold: { fontWeight: '700', fontSize: 16 },
  warning: { color: '#dc2626', marginTop: 6, fontSize: 13 },
  error: { color: '#dc2626', marginBottom: 8 },
  success: { color: '#16a34a', marginBottom: 8 },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  linkButton: { marginTop: 16, alignItems: 'center' },
  linkText: { color: '#2563eb', fontSize: 14 },
});
