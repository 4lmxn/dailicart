import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { theme } from '../theme';

interface ListItemProps {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  dense?: boolean;
  badge?: string;
  variant?: 'default' | 'danger' | 'warning' | 'success' | 'info';
}

export const ListItem: React.FC<ListItemProps> = ({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  disabled,
  loading,
  dense,
  badge,
  variant = 'default',
}) => {
  const content = (
    <View style={[styles.wrapper, dense && styles.wrapperDense, disabled && styles.disabled]}>\n      <View style={styles.left}>\n        {leading && <View style={styles.leading}>{leading}</View>}\n        <View style={styles.textGroup}>\n          <Text style={styles.title}>{title}</Text>\n          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}\n          {!!badge && (
            <View style={[styles.badge, variantStyles[variant]]}>\n              <Text style={[styles.badgeText, variantTextStyles[variant]]}>{badge}</Text>\n            </View>
          )}
        </View>\n      </View>\n      <View style={styles.right}>\n        {loading ? <ActivityIndicator size="small" color={theme.colors.primary} /> : trailing}\n      </View>\n    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} disabled={disabled || loading} style={styles.touch}>\n        {content}\n      </TouchableOpacity>
    );
  }
  return content;
};

const variantStyles = {
  default: { backgroundColor: theme.colors.backgroundAlt },
  success: { backgroundColor: '#E8F5E9' },
  danger: { backgroundColor: '#FFEBEE' },
  warning: { backgroundColor: '#FFF8E1' },
  info: { backgroundColor: '#E3F2FD' },
};

const variantTextStyles = {
  default: { color: theme.colors.textSecondary },
  success: { color: theme.colors.success },
  danger: { color: theme.colors.error },
  warning: { color: theme.colors.warning },
  info: { color: theme.colors.primary },
};

const styles = StyleSheet.create({
  touch: { marginBottom: theme.spacing.md },
  wrapper: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  wrapperDense: { paddingVertical: theme.spacing.sm },
  disabled: { opacity: 0.5 },
  left: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  leading: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.brandMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  textGroup: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: theme.colors.text, marginBottom: 2 },
  subtitle: { fontSize: 12, color: theme.colors.textSecondary },
  right: { marginLeft: theme.spacing.md, alignItems: 'flex-end', justifyContent: 'center' },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
});

export default ListItem;