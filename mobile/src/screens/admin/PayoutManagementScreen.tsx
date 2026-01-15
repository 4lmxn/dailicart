import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { AppLayout } from '../../components/AppLayout';
import { theme } from '../../theme';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { ErrorBanner } from '../../components/ErrorBanner';
import { useToast } from '../../components/Toast';
import { supabase } from '../../services/supabase';

interface Slip {
  id: any;
  distributor: any;
  period_start: any;
  period_end: any;
  total_earnings: any;
  bonuses: any;
  penalties: any;
  status: any;
}

export const PayoutManagementScreen = () => {
  const { show: showToast } = useToast();
  const [slips, setSlips] = useState<Slip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSlips();
  }, []);

  const loadSlips = async () => {
    setError(null);
    const { data, error: err } = await supabase
      .from('distributor_payouts')
      .select('id,period_start,period_end,base_earnings,bonus_amount,deductions,final_amount,status,distributor:distributors(id,user:users(name,phone))')
      .order('period_start', { ascending: false });
    setLoading(false);
    setRefreshing(false);
    if (err) {
      setError(err.message || 'Failed to load payouts');
    } else {
      // Map to expected shape
      setSlips((data || []).map((p: any) => ({
        ...p,
        total_earnings: p.base_earnings,
        bonuses: p.bonus_amount,
        penalties: p.deductions,
      })));
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadSlips();
  };

  const renderItem = ({ item }: { item: Slip }) => {
    const net = item.total_earnings + item.bonuses - item.penalties;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.distributorName}>{(item.distributor as any)?.user?.name || 'Unknown'}</Text>
          <View style={[styles.statusBadge, item.status === 'paid' && styles.statusPaid]}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.periodText}>
            {new Date(item.period_start).toLocaleDateString()} - {new Date(item.period_end).toLocaleDateString()}
          </Text>
          <View style={styles.row}>
            <Text style={styles.label}>Net:</Text>
            <Text style={styles.netValue}>₹{net.toFixed(2)}</Text>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <AppLayout>
        <Text style={styles.title}>Payout Management</Text>
        <SkeletonList count={5} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Text style={styles.title}>Payout Management</Text>
      {error && <ErrorBanner message={error} onRetry={loadSlips} style={{ marginHorizontal: theme.spacing.md, marginBottom: theme.spacing.md }} />}
      {slips.length === 0 ? (
        <EmptyState icon="💰" title="No payouts" description="No salary slips generated yet. Create new slips to manage distributor payouts." />
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
  title: { ...theme.typography.h2, color: theme.colors.text, marginHorizontal: theme.spacing.md, marginVertical: theme.spacing.md },
  list: { padding: theme.spacing.md },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, padding: theme.spacing.md, ...theme.shadows.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.sm },
  distributorName: { ...theme.typography.h3, fontSize: 16, color: theme.colors.text },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: theme.borderRadius.md, backgroundColor: theme.colors.warning },
  statusPaid: { backgroundColor: theme.colors.success },
  statusText: { ...theme.typography.small, color: theme.colors.textInverse, fontWeight: '600' },
  cardBody: { gap: 4 },
  periodText: { ...theme.typography.caption, color: theme.colors.textSecondary, marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { ...theme.typography.body, fontSize: 14, color: theme.colors.textSecondary },
  netValue: { ...theme.typography.body, fontSize: 16, fontWeight: '700', color: theme.colors.primary },
});
