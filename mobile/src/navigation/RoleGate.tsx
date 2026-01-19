import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';
import { supabase } from '../services/supabase';

interface RoleGateProps {
  onCustomer: () => void;
  onAdmin: () => void;
  onDistributor: () => void;
  onOnboarding: () => void;
  onAuth: () => void;
}

/**
 * Central role-based router. Decides which stack to show based on auth + role.
 * Supports dev override via EXPO_PUBLIC_FORCE_ROLE.
 */
export const RoleGate: React.FC<RoleGateProps> = ({
  onCustomer,
  onAdmin,
  onDistributor,
  onOnboarding,
  onAuth,
}) => {
  const { isAuthenticated, user, initializing } = useAuthStore();
  // SECURITY: Only allow role override in development mode
  const forceRole = __DEV__ ? (process.env.EXPO_PUBLIC_FORCE_ROLE || '').toLowerCase() : '';

  const [checkingAddress, setCheckingAddress] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (initializing) return;

      if (!isAuthenticated) {
        onAuth();
        return;
      }

      if (forceRole === 'customer') { onCustomer(); return; }
      if (forceRole === 'admin') { onAdmin(); return; }
      if (forceRole === 'distributor') { onDistributor(); return; }

      const role = user?.role;
      if (!role) { onOnboarding(); return; }

      // For customers, ensure at least one canonical address exists or go to onboarding.
      if (role === 'customer') {
        setCheckingAddress(true);
        const { data, error } = await supabase.from('addresses').select('id').limit(1);
        if (!cancelled) {
          setCheckingAddress(false);
          if (error) {
            // On error, still allow navigation but could integrate an inline error later.
            onCustomer();
            return;
          }
          if (!data || data.length === 0) {
            onOnboarding();
            return;
          }
          onCustomer();
          return;
        }
      }

      switch (role) {
        case 'admin': onAdmin(); break;
        case 'distributor': onDistributor(); break;
        default: onOnboarding(); break;
      }
    };
    run();
    return () => { cancelled = true; };
  }, [isAuthenticated, user, initializing, forceRole, onCustomer, onAdmin, onDistributor, onOnboarding, onAuth]);

  if (initializing || checkingAddress) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return null;
};
