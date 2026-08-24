// Shared design tokens for the premium, minimal visual direction (calm, spacious, restrained
// color, strong hierarchy). Applied first to the driver screens — the ones meant to feel like a
// premium mobile POS — and to newly-built manager screens; existing manager screens keep their
// current (already digestible) styling unless touched for another reason.

export const colors = {
  background: '#FAFAFA',
  surface: '#FFFFFF',
  border: '#E5E5EA',
  borderStrong: '#D1D1D6',

  textPrimary: '#1C1C1E',
  textSecondary: '#8E8E93',
  textTertiary: '#C7C7CC',

  primary: '#007AFF',
  primaryMuted: '#CDE4FF',
  success: '#34C759',
  successMuted: '#DFF5E4',
  warning: '#FF9500',
  warningMuted: '#FFEBCC',
  danger: '#FF3B30',
  dangerMuted: '#FFE1DE',
  neutral: '#8E8E93',
  neutralMuted: '#EDEDF0',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
};

export const typography = {
  largeTitle: { fontSize: 30, fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '700' },
  headline: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 16, fontWeight: '400' },
  callout: { fontSize: 15, fontWeight: '400' },
  subhead: { fontSize: 13, fontWeight: '500' },
  caption: { fontSize: 12, fontWeight: '400' },
};

// A soft, low-contrast card shadow — subtle, never harsh. Works on iOS/Android/web via RN's
// shadow* + elevation.
export const softShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 2,
};
