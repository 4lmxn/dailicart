// Shared StyleSheet patterns used across screens
// Reduces code duplication for common UI patterns: modals, cards, forms, buttons
import { StyleSheet, ViewStyle, TextStyle, Dimensions } from 'react-native';
import { theme } from './index';

const { width: screenWidth } = Dimensions.get('window');

// ─────────────────────────────────────────────────────
// MODAL STYLES - Used across all screens with modals
// ─────────────────────────────────────────────────────
export const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  closeButton: {
    fontSize: 24,
    color: theme.colors.textSecondary,
    padding: 4,
  },
  description: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    marginBottom: 20,
    lineHeight: 22,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 8,
    marginTop: 16,
  },
  applyButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  applyButtonDisabled: {
    backgroundColor: theme.colors.gray[300],
  },
});

// ─────────────────────────────────────────────────────
// CARD STYLES - Common card patterns
// ─────────────────────────────────────────────────────
export const cardStyles = StyleSheet.create({
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  base: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
  },
  large: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 24,
    marginTop: 16,
    borderRadius: 12,
    padding: 20,
  },
});

// ─────────────────────────────────────────────────────
// FORM STYLES - Inputs, selectors, toggles
// ─────────────────────────────────────────────────────
export const formStyles = StyleSheet.create({
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  inputFocused: {
    borderColor: theme.colors.primary,
    backgroundColor: '#FFFFFF',
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  error: {
    fontSize: 12,
    color: theme.colors.error,
    marginTop: 4,
  },
});

// ─────────────────────────────────────────────────────
// BUTTON STYLES - Common button variants
// ─────────────────────────────────────────────────────
export const buttonStyles = StyleSheet.create({
  primary: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  primaryText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  } as TextStyle,
  secondary: {
    backgroundColor: '#F5F5F5',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  secondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  } as TextStyle,
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  } as ViewStyle,
  outlineText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.primary,
  } as TextStyle,
  ghost: {
    backgroundColor: 'transparent',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  } as ViewStyle,
  ghostText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  } as TextStyle,
  disabled: {
    opacity: 0.5,
  },
  small: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  // Action buttons (commonly used in cards)
  action: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  } as ViewStyle,
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
  } as TextStyle,
  actionDanger: {
    backgroundColor: theme.colors.error + '10',
  },
  actionDangerText: {
    color: theme.colors.error,
  },
});

// ─────────────────────────────────────────────────────
// SECTION STYLES - Common layout sections
// ─────────────────────────────────────────────────────
export const sectionStyles = StyleSheet.create({
  container: {
    marginTop: 24,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 16,
  },
});

// ─────────────────────────────────────────────────────
// BADGE STYLES - Status badges, tags
// ─────────────────────────────────────────────────────
export const badgeStyles = StyleSheet.create({
  base: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
  success: {
    backgroundColor: theme.colors.success + '20',
  },
  successText: {
    color: theme.colors.success,
  },
  warning: {
    backgroundColor: theme.colors.warning + '20',
  },
  warningText: {
    color: '#B45309', // Darker amber for readability
  },
  error: {
    backgroundColor: theme.colors.error + '20',
  },
  errorText: {
    color: theme.colors.error,
  },
  info: {
    backgroundColor: theme.colors.primary + '20',
  },
  infoText: {
    color: theme.colors.primary,
  },
  neutral: {
    backgroundColor: '#F5F5F5',
  },
  neutralText: {
    color: theme.colors.text,
  },
});

// ─────────────────────────────────────────────────────
// EMPTY STATE STYLES
// ─────────────────────────────────────────────────────
export const emptyStateStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  text: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
});

// ─────────────────────────────────────────────────────
// LIST ITEM STYLES
// ─────────────────────────────────────────────────────
export const listStyles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 2,
  },
  itemSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  itemChevron: {
    fontSize: 18,
    color: theme.colors.textSecondary,
  },
});

// ─────────────────────────────────────────────────────
// SELECTOR STYLES - Chip selectors, toggle groups
// ─────────────────────────────────────────────────────
export const selectorStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: theme.colors.primary + '10',
    borderColor: theme.colors.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
  },
  chipTextActive: {
    color: theme.colors.primary,
  },
  // Day selector (Mon, Tue, etc.)
  dayChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayChipActive: {
    backgroundColor: theme.colors.primary,
  },
  dayChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  dayChipTextActive: {
    color: '#FFFFFF',
  },
  // Option cards (e.g., frequency options)
  optionCard: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '08',
  },
  optionCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
  },
  optionCardTitleActive: {
    color: theme.colors.primary,
  },
  optionCardSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
});

// ─────────────────────────────────────────────────────
// HEADER STYLES
// ─────────────────────────────────────────────────────
export const headerStyles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.primary,
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 28,
    color: '#FFFFFF',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
});

// ─────────────────────────────────────────────────────
// CONVENIENCE HELPERS
// ─────────────────────────────────────────────────────
export const flex = {
  row: { flexDirection: 'row' } as ViewStyle,
  rowCenter: { flexDirection: 'row', alignItems: 'center' } as ViewStyle,
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } as ViewStyle,
  center: { alignItems: 'center', justifyContent: 'center' } as ViewStyle,
  grow: { flex: 1 } as ViewStyle,
};

export const gap = {
  xs: { gap: 4 } as ViewStyle,
  sm: { gap: 8 } as ViewStyle,
  md: { gap: 12 } as ViewStyle,
  lg: { gap: 16 } as ViewStyle,
  xl: { gap: 24 } as ViewStyle,
};
