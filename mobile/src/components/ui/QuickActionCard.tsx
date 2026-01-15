import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { theme } from '../../theme';
import { Card } from './Card';

interface QuickActionCardProps {
  icon: string;
  label: string;
  color?: string; // base color for icon/accent
  onPress: () => void;
  accessibilityLabel?: string;
}

export const QuickActionCard: React.FC<QuickActionCardProps> = ({ icon, label, color = theme.colors.primary, onPress, accessibilityLabel }) => {
  return (
    <Card elevation="sm" padding="sm" rounded="lg" bordered style={styles.container}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || label}
        style={styles.touch}
      >
        <View style={[styles.iconWrap, { backgroundColor: color + '22' }]}> 
          <Text style={[styles.icon, { color }]}>{icon}</Text>
        </View>
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
      </Pressable>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '30%',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  touch: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    width: '100%',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  icon: {
    fontSize: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text,
    textAlign: 'center',
  },
});

export default QuickActionCard;
