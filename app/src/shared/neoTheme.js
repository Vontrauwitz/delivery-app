// Design-system prototype for the Manager Dashboard — deliberately separate from theme.js
// (which every other screen still uses). Neo-brutalist personality (strong borders, offset hard
// shadows, bold numbers) reined in for an operational app: no decorative noise, color is a
// status signal, not a pattern. If this direction is approved, these tokens are what would get
// promoted into theme.js for an app-wide migration — hence centralizing everything here now.

export const neoColors = {
  // Warm, very light neutral — not the cool gray of theme.js.
  background: '#F6F1E7',
  surface: '#FFFFFF',
  // Near-black, used for both text and the signature hard border/shadow.
  ink: '#171512',
  textSecondary: '#5A5548',
  textTertiary: '#8C8676',

  // Deep petrol blue — primary actions/navigation.
  primary: '#123B4A',
  primaryMuted: '#DCE9EC',

  // Mint/green — positive, healthy status.
  success: '#1F8A5F',
  successMuted: '#DCF1E4',

  // Mustard — needs attention, not yet an error.
  warning: '#C98A1E',
  warningMuted: '#F7EACB',

  // Coral/red — reserved for real warnings/errors only.
  danger: '#D14B34',
  dangerMuted: '#F8DED7',

  neutral: '#8C8676',
  neutralMuted: '#EBE6D9',
};

export const neoSpacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const neoRadii = { sm: 6, md: 10, lg: 14, xl: 18, full: 999 };

// Bold, chunky, high-contrast — headers read as labels, values read as the point of the card.
export const neoTypography = {
  display: { fontSize: 40, fontWeight: '800', letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '800' },
  headline: { fontSize: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  body: { fontSize: 15, fontWeight: '500' },
  caption: { fontSize: 12, fontWeight: '600' },
};

// The hard-shadow offset used by NeoCard — centralized so every card in the prototype moves in
// lockstep if this gets tuned.
export const NEO_SHADOW_OFFSET = 5;
