import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { theme, colors } from '../../theme';

export type BadgeVariant = 
  | 'success' 
  | 'warning' 
  | 'error' 
  | 'info' 
  | 'neutral'
  | 'primary';

export type BadgeSize = 'sm' | 'md' | 'lg';

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: string;
  /** Makes background more vibrant */
  filled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const variantColors: Record<BadgeVariant, { bg: string; bgFilled: string; text: string }> = {
  success: { 
    bg: `${colors.success}20`, 
    bgFilled: colors.success,
    text: colors.success 
  },
  warning: { 
    bg: `${colors.warning}30`, 
    bgFilled: colors.warning,
    text: '#B45309' // Darker amber for readability
  },
  error: { 
    bg: `${colors.error}20`, 
    bgFilled: colors.error,
    text: colors.error 
  },
  info: { 
    bg: `${colors.info}20`, 
    bgFilled: colors.info,
    text: colors.info 
  },
  neutral: { 
    bg: colors.gray[200], 
    bgFilled: colors.gray[500],
    text: colors.gray[700] 
  },
  primary: { 
    bg: `${colors.primary}20`, 
    bgFilled: colors.primary,
    text: colors.primary 
  },
};

const sizeStyles: Record<BadgeSize, { paddingH: number; paddingV: number; fontSize: number; iconSize: number }> = {
  sm: { paddingH: 8, paddingV: 4, fontSize: 10, iconSize: 10 },
  md: { paddingH: 12, paddingV: 6, fontSize: 12, iconSize: 12 },
  lg: { paddingH: 14, paddingV: 8, fontSize: 14, iconSize: 14 },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  variant = 'neutral',
  size = 'md',
  icon,
  filled = false,
  style,
  textStyle,
}) => {
  const variantStyle = variantColors[variant];
  const sizeStyle = sizeStyles[size];
  
  return (
    <View 
      style={[
        styles.badge,
        {
          backgroundColor: filled ? variantStyle.bgFilled : variantStyle.bg,
          paddingHorizontal: sizeStyle.paddingH,
          paddingVertical: sizeStyle.paddingV,
        },
        style,
      ]}
    >
      {icon && (
        <Text style={[
          styles.icon, 
          { fontSize: sizeStyle.iconSize, marginRight: 4 }
        ]}>
          {icon}
        </Text>
      )}
      <Text 
        style={[
          styles.text,
          {
            color: filled ? '#FFFFFF' : variantStyle.text,
            fontSize: sizeStyle.fontSize,
          },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </View>
  );
};

// Preset badges for common statuses
export const DeliveredBadge: React.FC<{ size?: BadgeSize }> = ({ size }) => (
  <StatusBadge label="Delivered" variant="success" icon="✓" size={size} />
);

export const PendingBadge: React.FC<{ size?: BadgeSize }> = ({ size }) => (
  <StatusBadge label="Pending" variant="info" icon="🕐" size={size} />
);

export const CancelledBadge: React.FC<{ size?: BadgeSize }> = ({ size }) => (
  <StatusBadge label="Cancelled" variant="error" icon="✕" size={size} />
);

export const PausedBadge: React.FC<{ size?: BadgeSize }> = ({ size }) => (
  <StatusBadge label="Paused" variant="warning" icon="⏸️" size={size} />
);

export const ActiveBadge: React.FC<{ size?: BadgeSize }> = ({ size }) => (
  <StatusBadge label="Active" variant="success" icon="●" size={size} />
);

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  icon: {
    marginRight: 2,
  },
  text: {
    fontWeight: '600',
  },
});
