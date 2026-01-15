import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { theme } from '../../theme';

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
        styles.base,
        styles[variant],
        size === 'sm' && styles.small,
        pill && styles.pill,
        outline && styles.outline,
        outline && styles[`outline_${variant}`],
      ]}
    >
      <Text style={[styles.text, size === 'sm' && styles.textSmall]} numberOfLines={1}>
        {icon ? `${icon} ${text}` : text}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.md,
    backgroundColor: '#F5F5F5',
  },
  neutral: {
    backgroundColor: '#F5F5F5',
  },
  success: {
    backgroundColor: '#E8F5E9',
  },
  warning: {
    backgroundColor: '#FFF8E1',
  },
  error: {
    backgroundColor: '#FFEBEE',
  },
  info: {
    backgroundColor: '#E3F2FD',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text,
  },
  textSmall: {
    fontSize: 10,
  },
  small: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pill: {
    borderRadius: 999,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  outline_neutral: { borderColor: '#D6D6D6' },
  outline_success: { borderColor: '#C8E6C9' },
  outline_warning: { borderColor: '#FFE0B2' },
  outline_error: { borderColor: '#FFCDD2' },
  outline_info: { borderColor: '#BBDEFB' },
});
