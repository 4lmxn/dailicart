import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { supabase } from '../../services/supabase';
import { ErrorBanner } from '../../components/ErrorBanner';
import { EmptyState } from '../../components/EmptyState';
import { useTheme } from '../../theme';

export const SupplierPaymentsScreen: React.FC = () => {
  const theme = useTheme();
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      // Note: supplier_payments table doesn't exist in current schema
      // Return empty array - feature needs schema update
      setPayments([]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: theme.spacing.md }}>
      <Text style={{ fontSize: 22, fontWeight: '600', color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>Supplier Payments</Text>

      {loading && <ActivityIndicator color={theme.colors.primary} />}
      {error && <ErrorBanner message={error} onRetry={load} />}
      {!loading && !error && payments.length === 0 && (
        <EmptyState title="No payments" description="Record payments made to suppliers." />
      )}

      {!loading && !error && payments.map((p) => (
        <View key={p.id} style={{
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
          marginBottom: theme.spacing.sm,
        }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.textPrimary }}>{p.suppliers?.name || 'Supplier'}</Text>
          <Text style={{ color: theme.colors.textSecondary }}>Date: {p.payment_date}</Text>
          <Text style={{ color: theme.colors.textSecondary }}>Amount: ₹{p.amount}</Text>
          {p.method && <Text style={{ color: theme.colors.textSecondary }}>Method: {p.method}</Text>}
          {p.reference && <Text style={{ color: theme.colors.textSecondary }}>Ref: {p.reference}</Text>}
        </View>
      ))}

      <TouchableOpacity style={{
        backgroundColor: theme.colors.primary,
        padding: theme.spacing.md,
        borderRadius: theme.radius.md,
        marginTop: theme.spacing.lg,
      }}>
        <Text style={{ color: theme.colors.onPrimary, textAlign: 'center', fontWeight: '600' }}>Record Payment</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};
