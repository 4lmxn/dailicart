import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { AppLayout } from '../../components/AppLayout';
import { AppBar } from '../../components/AppBar';
import { theme } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { ErrorBanner } from '../../components/ErrorBanner';
import { formatCurrency } from '../../utils/helpers';
import { getAuthUserId } from '../../utils/auth';
import { supabase } from '../../services/supabase';
import * as DistributorAPI from '../../services/api/distributors';
import type { DistributorScreenProps } from '../../navigation/types';

interface SalarySlip {
  id: string;
  period_start: string;
  period_end: string;
  base_earnings?: number;
  base_amount?: number;
  bonus_amount: number;
  deductions: number;
  final_amount?: number;
  net_amount?: number;
  deliveries_count: number;
  status: string;
  paid_at: string | null;
  created_at: string;
}

export const SalarySlipsScreen = ({ navigation }: DistributorScreenProps<'SalarySlips'>) => {
  const { user } = useAuthStore();
  const [slips, setSlips] = useState<SalarySlip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSlips();
  }, []);

  const loadSlips = async () => {
    setError(null);
    
    // Get distributor ID from auth user (handles dev mode impersonation)
    const userId = await getAuthUserId();
    if (!userId) return;

    const { data: distributor } = await supabase
      .from('distributors')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!distributor?.id) {
      setError('Distributor not found');
      setLoading(false);
      return;
    }

    const { data, error: err } = await DistributorAPI.getSalarySlips(distributor.id);
    setLoading(false);
    setRefreshing(false);
    if (err) {
      setError(err.message || 'Failed to load salary slips');
    } else {
      setSlips(data || []);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadSlips();
  };

  const renderItem = ({ item }: { item: SalarySlip }) => {
    // Handle both field name variations from API
    const baseAmount = item.base_amount ?? item.base_earnings ?? 0;
    const netAmount = item.net_amount ?? item.final_amount ?? 0;
    
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.periodText}>
            {new Date(item.period_start).toLocaleDateString()} - {new Date(item.period_end).toLocaleDateString()}
          </Text>
          <View style={[styles.statusBadge, item.status === 'paid' && styles.statusPaid]}>
            <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
          </View>
        </View>
        <View style={styles.cardBody}>
          <View style={styles.row}>
            <Text style={styles.label}>Base Earnings:</Text>
            <Text style={styles.value}>{formatCurrency(baseAmount)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Deliveries:</Text>
            <Text style={styles.value}>{item.deliveries_count}</Text>
          </View>
          {item.bonus_amount > 0 && (
            <View style={styles.row}>
              <Text style={[styles.label, { color: theme.colors.success }]}>Bonuses:</Text>
              <Text style={[styles.value, { color: theme.colors.success }]}>+{formatCurrency(item.bonus_amount)}</Text>
            </View>
          )}
          {item.deductions > 0 && (
            <View style={styles.row}>
              <Text style={[styles.label, { color: theme.colors.error }]}>Deductions:</Text>
              <Text style={[styles.value, { color: theme.colors.error }]}>-{formatCurrency(item.deductions)}</Text>
            </View>
          )}
          <View style={[styles.row, styles.totalRow]}>
            <Text style={styles.totalLabel}>Net Amount:</Text>
            <Text style={styles.totalValue}>{formatCurrency(netAmount)}</Text>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <AppLayout>
        <AppBar title="Salary Slips" onBack={() => navigation.goBack()} variant="surface" />
        <SkeletonList count={5} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <AppBar title="Salary Slips" onBack={() => navigation.goBack()} variant="surface" />
      {error && <ErrorBanner message={error} onRetry={loadSlips} style={{ marginHorizontal: theme.spacing.md, marginBottom: theme.spacing.md }} />}
      {slips.length === 0 ? (
        <EmptyState
          icon="📄"
          title="No salary slips"
          description="Salary slips will appear here once generated by admin."
        />
      ) : (
        <FlatList
          data={slips}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.md }} />}
        />
      )}
    </AppLayout>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  list: { padding: theme.spacing.md },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, padding: theme.spacing.md, ...theme.shadows.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md },
  periodText: { ...theme.typography.body, fontSize: 14, fontWeight: '600', color: theme.colors.text },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: theme.borderRadius.md, backgroundColor: theme.colors.warning },
  statusPaid: { backgroundColor: theme.colors.success },
  statusText: { ...theme.typography.small, color: theme.colors.textInverse, fontWeight: '600' },
  cardBody: { gap: theme.spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { ...theme.typography.caption, color: theme.colors.textSecondary },
  value: { ...theme.typography.caption, color: theme.colors.text, fontWeight: '600' },
  totalRow: { borderTopWidth: 1, borderTopColor: theme.colors.borderLight, paddingTop: theme.spacing.sm, marginTop: theme.spacing.sm },
  totalLabel: { ...theme.typography.body, fontSize: 14, fontWeight: '600', color: theme.colors.text },
  totalValue: { ...theme.typography.body, fontSize: 16, fontWeight: '700', color: theme.colors.primary },
});
