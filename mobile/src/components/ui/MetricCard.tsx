import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme';
import { Card } from './Card';

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
      style={styles.container}
    >
      <View style={[styles.iconWrap, subtle && styles.iconSubtle]}> 
        <Text style={[styles.icon, { color }]}>{icon}</Text>
      </View>
      {loading ? (
        <View style={styles.loaderBar} />
      ) : (
        <Text style={styles.value}>{value}</Text>
      )}
      <Text style={styles.label}>{label}</Text>
      {footer && <Text style={styles.footer}>{footer}</Text>}
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
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
  icon: {
    fontSize: 22,
  },
  value: {
    ...theme.typography.h3,
    fontSize: 20,
    color: theme.colors.text,
  },
  label: {
    ...theme.typography.small,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
  },
  footer: {
    marginTop: 2,
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  loaderBar: {
    height: 18,
    width: '60%',
    borderRadius: 8,
    backgroundColor: '#E0E0E0',
  },
});
