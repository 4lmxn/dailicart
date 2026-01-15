import React, { useCallback, useRef } from 'react';
import { View, StyleSheet, ViewProps, Text, Pressable, Animated, PressableProps, ViewStyle, StyleProp, GestureResponderEvent, TextStyle } from 'react-native';
import { theme, colors } from '../theme';

// Badge
interface BadgeProps {
  text: string;
  variant?: 'neutral' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md';
  pill?: boolean;
  outline?: boolean;
  icon?: string;
  accessibilityLabel?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  text,
  variant = 'neutral',
  size = 'md',
  pill,
  outline,
  icon,
  accessibilityLabel,
}) => {
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel || text}
      style={[
        badgeStyles.base,
        badgeStyles[variant],
        size === 'sm' && badgeStyles.small,
        pill && badgeStyles.pill,
        outline && badgeStyles.outline,
        outline && (badgeStyles as any)[`outline_${variant}`],
      ]}
    >
      <Text style={[badgeStyles.text, size === 'sm' && badgeStyles.textSmall]} numberOfLines={1}>
        {icon ? `${icon} ${text}` : text}
      </Text>
    </View>
  );
};

const badgeStyles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.md,
    backgroundColor: '#F5F5F5',
  },
  neutral: { backgroundColor: '#F5F5F5' },
  success: { backgroundColor: '#E8F5E9' },
  warning: { backgroundColor: '#FFF8E1' },
  error: { backgroundColor: '#FFEBEE' },
  info: { backgroundColor: '#E3F2FD' },
  text: { fontSize: 12, fontWeight: '600', color: theme.colors.text },
  textSmall: { fontSize: 10 },
  small: { paddingHorizontal: 8, paddingVertical: 4 },
  pill: { borderRadius: 999 },
  outline: { backgroundColor: 'transparent', borderWidth: 1 },
  outline_neutral: { borderColor: '#D6D6D6' },
  outline_success: { borderColor: '#C8E6C9' },
  outline_warning: { borderColor: '#FFE0B2' },
  outline_error: { borderColor: '#FFCDD2' },
  outline_info: { borderColor: '#BBDEFB' },
});

// Card
interface CardProps extends ViewProps {
  elevation?: 'none' | 'sm' | 'md';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  rounded?: 'sm' | 'md' | 'lg' | 'full';
  backgroundColor?: string;
  bordered?: boolean;
  interactive?: boolean;
  accessibilityLabel?: string;
}

export const Card: React.FC<CardProps> = ({
  elevation = 'sm',
  padding = 'md',
  rounded = 'lg',
  backgroundColor = theme.colors.card,
  bordered = true,
  interactive = false,
  accessibilityLabel,
  style,
  children,
  ...rest
}) => {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        cardStyles.base,
        !bordered && cardStyles.noBorder,
        elevation !== 'none' && (cardStyles as any)[elevation],
        interactive && cardStyles.interactiveContainer,
        { backgroundColor, padding: paddingMap[padding], borderRadius: radiusMap[rounded] || theme.borderRadius.lg },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
};

const paddingMap = {
  none: 0,
  sm: theme.spacing.sm,
  md: theme.spacing.md,
  lg: theme.spacing.lg,
};

const radiusMap = {
  sm: theme.borderRadius.sm,
  md: theme.borderRadius.md,
  lg: theme.borderRadius.lg,
  full: 999,
};

const cardStyles = StyleSheet.create({
  base: { borderWidth: 1, borderColor: theme.colors.border },
  noBorder: { borderWidth: 0 },
  interactiveContainer: { cursor: 'pointer' as any },
  sm: theme.shadows.sm,
  md: theme.shadows.md,
});

// MetricCard
interface MetricCardProps {
  icon: string;
  label: string;
  value: string | number;
  color?: string;
  subtle?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  footer?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  icon,
  label,
  value,
  color = theme.colors.primary,
  subtle,
  loading = false,
  accessibilityLabel,
  footer,
}) => {
  return (
    <Card
      elevation={subtle ? 'none' : 'sm'}
      padding="md"
      rounded="lg"
      backgroundColor={subtle ? '#FAFAFA' : '#FFFFFF'}
      accessibilityLabel={accessibilityLabel || `${label} ${value}`}
      style={metricStyles.container}
    >
      <View style={[metricStyles.iconWrap, subtle && metricStyles.iconSubtle]}>
        <Text style={[metricStyles.icon, { color }]}>{icon}</Text>
      </View>
      {loading ? <View style={metricStyles.loaderBar} /> : <Text style={metricStyles.value}>{value}</Text>}
      <Text style={metricStyles.label}>{label}</Text>
      {footer && <Text style={metricStyles.footer}>{footer}</Text>}
    </Card>
  );
};

const metricStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', gap: theme.spacing.xs },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.sm,
    marginBottom: theme.spacing.xs,
  },
  iconSubtle: { backgroundColor: '#EEEEEE' },
  icon: { fontSize: 22 },
  value: { ...theme.typography.h3, fontSize: 20, color: theme.colors.text },
  label: { ...theme.typography.small, fontWeight: '600', color: theme.colors.textSecondary, letterSpacing: 0.5 },
  footer: { marginTop: 2, fontSize: 11, color: theme.colors.textSecondary },
  loaderBar: { height: 18, width: '60%', borderRadius: 8, backgroundColor: '#E0E0E0' },
});

// QuickActionCard
interface QuickActionCardProps {
  icon: string;
  label: string;
  color?: string;
  onPress: () => void;
  accessibilityLabel?: string;
}

export const QuickActionCard: React.FC<QuickActionCardProps> = ({ icon, label, color = theme.colors.primary, onPress, accessibilityLabel }) => {
  return (
    <Card elevation="sm" padding="sm" rounded="lg" bordered style={quickActionStyles.container}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} style={quickActionStyles.touch}>
        <View style={[quickActionStyles.iconWrap, { backgroundColor: (color as string) + '22' }]}>
          <Text style={[quickActionStyles.icon, { color }]}>{icon}</Text>
        </View>
        <Text style={quickActionStyles.label} numberOfLines={1}>{label}</Text>
      </Pressable>
    </Card>
  );
};

const quickActionStyles = StyleSheet.create({
  container: { width: '30%', alignItems: 'center', marginBottom: theme.spacing.md },
  touch: { alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, width: '100%' },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  icon: { fontSize: 24 },
  label: { fontSize: 12, fontWeight: '600', color: theme.colors.text, textAlign: 'center' },
});

// ============================================================================
// StatusBadge - Enhanced badge with preset variants
// ============================================================================

export type StatusBadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary';
export type StatusBadgeSize = 'sm' | 'md' | 'lg';

interface StatusBadgeProps {
  label: string;
  variant?: StatusBadgeVariant;
  size?: StatusBadgeSize;
  icon?: string;
  filled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const statusVariantColors: Record<StatusBadgeVariant, { bg: string; bgFilled: string; text: string }> = {
  success: { bg: `${colors.success}20`, bgFilled: colors.success, text: colors.success },
  warning: { bg: `${colors.warning}30`, bgFilled: colors.warning, text: '#B45309' },
  error: { bg: `${colors.error}20`, bgFilled: colors.error, text: colors.error },
  info: { bg: `${colors.info}20`, bgFilled: colors.info, text: colors.info },
  neutral: { bg: colors.gray[200], bgFilled: colors.gray[500], text: colors.gray[700] },
  primary: { bg: `${colors.primary}20`, bgFilled: colors.primary, text: colors.primary },
};

const statusSizeStyles: Record<StatusBadgeSize, { paddingH: number; paddingV: number; fontSize: number }> = {
  sm: { paddingH: 8, paddingV: 4, fontSize: 10 },
  md: { paddingH: 12, paddingV: 6, fontSize: 12 },
  lg: { paddingH: 14, paddingV: 8, fontSize: 14 },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ label, variant = 'neutral', size = 'md', icon, filled = false, style, textStyle }) => {
  const variantStyle = statusVariantColors[variant];
  const sizeStyle = statusSizeStyles[size];
  return (
    <View style={[statusBadgeStyles.badge, { backgroundColor: filled ? variantStyle.bgFilled : variantStyle.bg, paddingHorizontal: sizeStyle.paddingH, paddingVertical: sizeStyle.paddingV }, style]}>
      {icon && <Text style={{ fontSize: sizeStyle.fontSize, marginRight: 4 }}>{icon}</Text>}
      <Text style={[statusBadgeStyles.text, { color: filled ? '#FFFFFF' : variantStyle.text, fontSize: sizeStyle.fontSize }, textStyle]}>{label}</Text>
    </View>
  );
};

const statusBadgeStyles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, alignSelf: 'flex-start' },
  text: { fontWeight: '600' },
});

// ============================================================================
// PressableScale - Animated press feedback
// ============================================================================

interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  scaleTo?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export const PressableScale: React.FC<PressableScaleProps> = ({ scaleTo = 0.97, style, children, onPressIn, onPressOut, disabled, ...props }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const handlePressIn = useCallback((event: GestureResponderEvent) => {
    Animated.spring(scaleAnim, { toValue: scaleTo, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
    onPressIn?.(event);
  }, [scaleTo, onPressIn]);
  const handlePressOut = useCallback((event: GestureResponderEvent) => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
    onPressOut?.(event);
  }, [onPressOut]);
  return (
    <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} disabled={disabled} {...props}>
      <Animated.View style={[style, { transform: [{ scale: scaleAnim }], opacity: disabled ? 0.5 : 1 }]}>{children}</Animated.View>
    </Pressable>
  );
};

export const PressableCard: React.FC<PressableScaleProps> = (props) => <PressableScale scaleTo={0.98} {...props} />;
export const PressableButton: React.FC<PressableScaleProps> = (props) => <PressableScale scaleTo={0.95} {...props} />;
