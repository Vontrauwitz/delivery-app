import { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../../src/modules/auth/useAuth';
import { colors, spacing, radii, typography, softShadow } from '../../src/shared/theme';

export default function LoginScreen() {
  const { status, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const passwordInputRef = useRef(null);

  if (status === 'AUTHENTICATED') {
    return <Redirect href="/" />;
  }

  async function handleSubmit() {
    setError('');
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.title}>Delivery App</Text>
        <Text style={styles.subtitle}>Inicia sesión para continuar</Text>

        <TextInput
          style={styles.input}
          placeholder="Correo electrónico"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          returnKeyType="next"
          value={email}
          onChangeText={setEmail}
          onSubmitEditing={() => passwordInputRef.current?.focus()}
          blurOnSubmit={false}
        />

        {/* secureTextEntry masks with the platform's native bullet dots — no custom masking. The
            eye toggle just flips that flag; RN (and react-native-web) handle re-rendering the
            field's contents either way. */}
        <View style={styles.passwordRow}>
          <TextInput
            ref={passwordInputRef}
            style={styles.passwordInput}
            placeholder="Contraseña"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry={!passwordVisible}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={handleSubmit}
          />
          <Pressable onPress={() => setPasswordVisible((v) => !v)} hitSlop={12} style={styles.eyeButton}>
            <Text style={styles.eyeIcon}>{passwordVisible ? '🙈' : '👁️'}</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Entrar</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // Anchored near the top, not vertically centered — on a short screen with the keyboard open,
  // a centered form has to travel much further before the button clears the keyboard.
  content: { flexGrow: 1, padding: spacing.xl, paddingTop: spacing.xxl * 2, paddingBottom: spacing.xxl },
  title: { ...typography.largeTitle, color: colors.textPrimary, textAlign: 'center' },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.xxl,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
  },
  eyeButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  eyeIcon: { fontSize: 20 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    marginTop: spacing.sm,
    ...softShadow,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  error: { color: colors.danger, marginBottom: spacing.sm, textAlign: 'center' },
});
