import { View, Text, TextInput, StyleSheet } from 'react-native';

export default function PaymentSplitInput({ cashAmount, transferAmount, onChangeCash, onChangeTransfer, editable = true }) {
  return (
    <View>
      <Text style={styles.label}>Efectivo</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={cashAmount}
        onChangeText={onChangeCash}
        editable={editable}
        placeholder="0"
      />
      <Text style={styles.label}>Transferencia</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={transferAmount}
        onChangeText={onChangeTransfer}
        editable={editable}
        placeholder="0"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, color: '#444', marginBottom: 4, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
});
