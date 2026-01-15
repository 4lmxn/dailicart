import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import { theme } from '../theme';

interface SectionAction {
  label: string;
  onPress: () => void;
}

interface SectionProps {
  title?: string;
  subtitle?: string;
  actions?: SectionAction[];
  children?: React.ReactNode;
  style?: ViewStyle;
  dense?: boolean;
  divider?: boolean;
}

export const Section: React.FC<SectionProps> = ({
  title,
  subtitle,
  actions,
  children,
  style,
  dense = false,
  divider = false,
}) => {
  return (
    <View style={[styles.container, dense && styles.containerDense, style]}>
      {(title || actions?.length) && (
        <View style={[styles.header, divider && styles.headerDivider]}>
          <View style={styles.headerTextGroup}>
            {!!title && <Text style={styles.title}>{title}</Text>}
            {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
          {actions?.length ? (
            <View style={styles.actions}>
              {actions.map((a) => (
                <TouchableOpacity key={a.label} onPress={a.onPress} style={styles.actionBtn}>
                  <Text style={styles.actionText}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      )}
      <View style={styles.content}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl - theme.spacing.sm,
  },
  containerDense: {
    marginTop: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: theme.spacing.sm,
  },
  headerDivider: {
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  headerTextGroup: { flex: 1 },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  actions: { flexDirection: 'row', gap: theme.spacing.sm },
  actionBtn: {
    backgroundColor: theme.colors.brandMuted,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs + 2,
    borderRadius: 20,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.brand,
  },
  content: {},
});

export default Section;