import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';
import { theme } from '../../theme';

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
  // Avoid setting accessibilityRole="button" here to prevent nested button elements on web
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.base,
        !bordered && styles.noBorder,
        elevation !== 'none' && styles[elevation],
        interactive && styles.interactiveContainer,
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

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  noBorder: { borderWidth: 0 },
  interactiveContainer: { cursor: 'pointer' },
  sm: theme.shadows.sm,
  md: theme.shadows.md,
});
