import { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { neoColors, neoRadii, NEO_SHADOW_OFFSET } from '../../shared/neoTheme';

// The one reusable primitive behind every block on the dashboard: a bordered card with a solid,
// hard-edged offset shadow (no blur — that's the neo-brutalist signature) built from two layered
// views rather than shadow* props, so it renders identically on web/iOS/Android instead of
// depending on each platform's shadow implementation.
//
// Tactile by construction, not decoration: pressing translates the card onto its own shadow
// (making it vanish — a real "push"), hovering (web only, harmless no-op elsewhere) lifts it a
// touch. No interaction ever depends on hover — press/tap alone is always fully sufficient.
export default function NeoCard({ children, onPress, accentColor, style, contentStyle, disabled }) {
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const interactive = !!onPress && !disabled;

  const pressOffset = pressed ? NEO_SHADOW_OFFSET : hovered ? -2 : 0;

  const cardProps = interactive
    ? {
        onPress,
        onPressIn: () => setPressed(true),
        onPressOut: () => setPressed(false),
        onHoverIn: () => setHovered(true),
        onHoverOut: () => setHovered(false),
      }
    : {};
  const Wrapper = interactive ? Pressable : View;

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.shadow} />
      <Wrapper
        {...cardProps}
        style={[
          styles.card,
          disabled && styles.cardDisabled,
          { transform: [{ translateX: pressOffset }, { translateY: pressOffset }] },
          contentStyle,
        ]}
      >
        {accentColor ? <View style={[styles.accentBar, { backgroundColor: accentColor }]} /> : null}
        {children}
      </Wrapper>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    marginRight: NEO_SHADOW_OFFSET,
    marginBottom: NEO_SHADOW_OFFSET,
  },
  shadow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: neoColors.ink,
    borderRadius: neoRadii.lg,
    transform: [{ translateX: NEO_SHADOW_OFFSET }, { translateY: NEO_SHADOW_OFFSET }],
  },
  card: {
    backgroundColor: neoColors.surface,
    borderWidth: 2,
    borderColor: neoColors.ink,
    borderRadius: neoRadii.lg,
    overflow: 'hidden',
  },
  cardDisabled: { opacity: 0.55 },
  accentBar: { height: 5, width: '100%' },
});
