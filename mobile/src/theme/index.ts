// iDaily Brand Colors and Theme
// Base color scales (grayscale + brand palettes)
const gray = {
  50: '#FAFAFA',
  100: '#F5F5F5',
  200: '#EEEEEE',
  300: '#E0E0E0',
  400: '#BDBDBD',
  500: '#9E9E9E',
  600: '#757575',
  700: '#616161',
  800: '#424242',
  900: '#212121',
};

const purple = {
  50: '#F3E5F5',
  100: '#E1BEE7',
  200: '#CE93D8',
  300: '#BA68C8',
  400: '#AB47BC',
  500: '#9C27B0',
  600: '#8E24AA',
  700: '#7B1FA2',
  800: '#6A1B9A',
  900: '#4A148C',
};

// Semantic colors consumed by UI components
export const colors = {
  // Brand / Primary
  primary: '#2196F3',
  primaryLight: '#64B5F6',
  primaryDark: '#1976D2',
  brand: purple[500],
  brandMuted: purple[50],

  // Accent / Secondary
  secondary: '#FF9800',
  secondaryLight: '#FFB74D',
  secondaryDark: '#F57C00',

  // Status
  success: '#4CAF50',
  error: '#F44336',
  warning: '#FFC107',
  info: '#2196F3',

  // Grayscale references
  gray,

  // Surfaces
  background: gray[100],
  backgroundAlt: gray[50],
  surface: '#FFFFFF',
  card: '#FFFFFF',
  surfaceAlt: gray[50],
  elevated: '#FFFFFF',

  // Text
  text: gray[900],
  textPrimary: gray[900],
  textSecondary: gray[600],
  textInverse: '#FFFFFF',
  textMuted: gray[500],
  textLight: '#FFFFFF',

  // On-colors (for content on primary/secondary surfaces)
  onPrimary: '#FFFFFF',
  onSecondary: '#FFFFFF',
  onSurface: gray[900],

  // Borders / Dividers
  border: gray[300],
  borderLight: gray[200],
  borderStrong: gray[400],

  // Misc / Brand
  milkWhite: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.5)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const typography = {
  h1: {
    fontSize: 32,
    fontWeight: '600' as const,
    lineHeight: 40,
  },
  h2: {
    fontSize: 24,
    fontWeight: '600' as const,
    lineHeight: 32,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 28,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
  },
  caption: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
  small: {
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 16,
  },
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
};

// Elevation semantic mapping (Android/iOS consistency abstraction)
export const elevation = {
  level0: { backgroundColor: colors.surface },
  level1: { backgroundColor: colors.elevated, ...shadows.sm },
  level2: { backgroundColor: colors.elevated, ...shadows.md },
  level3: { backgroundColor: colors.elevated, ...shadows.lg },
};

// Export everything as a theme object
export const theme = {
  colors,
  spacing,
  typography,
  borderRadius,
  radius: borderRadius, // Alias for borderRadius
  shadows,
  elevation,
};

export type Theme = typeof theme;

// useTheme hook for components that need theme access
export const useTheme = () => theme;
