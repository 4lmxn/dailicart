import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppLayout } from '../../components/AppLayout';
import { AppBar } from '../../components/AppBar';
import { theme } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { setSelectedDevBypassRole } from '../../utils/devBypass';

const ROLE_OPTIONS = [
  {
    role: 'customer' as const,
    title: 'Customer',
    description: 'Open the customer app flow without logging in.',
  },
  {
    role: 'admin' as const,
    title: 'Admin',
    description: 'Open admin screens for operational testing.',
  },
  {
    role: 'distributor' as const,
    title: 'Distributor',
    description: 'Open the distributor delivery and earnings flow.',
  },
];

export const DevRoleSelectorScreen = () => {
  const [loadingRole, setLoadingRole] = useState<string | null>(null);

  const handleSelectRole = async (role: 'customer' | 'admin' | 'distributor') => {
    try {
      setLoadingRole(role);
      await setSelectedDevBypassRole(role);
      await useAuthStore.getState().loadUserFromStorage();
    } catch (error) {
      console.error('Failed to apply dev role bypass', error);
      Alert.alert('Error', 'Unable to apply the selected role.');
    } finally {
      setLoadingRole(null);
    }
  };

  return (
    <AppLayout>
      <AppBar title="Dev Role Selector" />
      <View style={styles.container}>
        <Text style={styles.title}>Choose a role to test</Text>
        <Text style={styles.subtitle}>
          This bypass is temporary. Remove EXPO_PUBLIC_DEV_MODE_ROLE from mobile/.env when testing is done.
        </Text>

        {ROLE_OPTIONS.map((option) => {
          const isLoading = loadingRole === option.role;

          return (
            <Pressable
              key={option.role}
              accessibilityRole="button"
              disabled={Boolean(loadingRole)}
              onPress={() => handleSelectRole(option.role)}
              style={({ pressed }) => [
                styles.card,
                pressed && !isLoading ? styles.cardPressed : null,
                isLoading ? styles.cardDisabled : null,
              ]}
            >
              <Text style={styles.cardTitle}>{option.title}</Text>
              <Text style={styles.cardDescription}>{option.description}</Text>
              <Text style={styles.cardAction}>{isLoading ? 'Applying...' : 'Use this role'}</Text>
            </Pressable>
          );
        })}
      </View>
    </AppLayout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  card: {
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    marginBottom: theme.spacing.md,
  },
  cardPressed: {
    opacity: 0.9,
  },
  cardDisabled: {
    opacity: 0.6,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
  },
  cardDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  cardAction: {
    marginTop: theme.spacing.sm,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
});