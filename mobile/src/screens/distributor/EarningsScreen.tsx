import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { DistributorScreenProps } from '../../navigation/types';
import { Skeleton } from '../../components/Skeleton';
import { ErrorBanner } from '../../components/ErrorBanner';
import { getAuthUserId } from '../../utils/auth';
import { getLocalDateString, getLocalDateOffsetString } from '../../utils/helpers';
import { supabase } from '../../services/supabase';
import * as DistributorAPI from '../../services/api/distributors';

const { width } = Dimensions.get('window');

interface EarningsData {
  total_earnings: number;
  total_orders: number;
  total_units: number;
}

interface DailyEarning {
  date: string;
  amount: number;
  orders: number;
}

export const EarningsScreen = ({ navigation }: DistributorScreenProps<'Earnings'>) => {
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [dailyEarnings, setDailyEarnings] = useState<DailyEarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');

  useEffect(() => {
    loadEarnings();
  }, [period]);

  const loadEarnings = async () => {
    setError(null);
    if (!loading) setLoading(true);
    
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

    const today = getLocalDateString();
    let start = today;
    let days = 1;
    
    if (period === 'week') {
      start = getLocalDateOffsetString(-6);
      days = 7;
    } else if (period === 'month') {
      start = getLocalDateOffsetString(-29);
      days = 30;
    }

    try {
      const { data, error: err } = await DistributorAPI.getEarnings(distributor.id, start, today);
      
      if (err) {
        setError(err.message || 'Failed to load earnings');
      } else {
        setEarnings(data?.[0] || { total_earnings: 0, total_orders: 0, total_units: 0 });
      }

      // Fetch daily breakdown - earnings from ALL delivered orders (not filtered by building assignment)
      const { data: ordersData } = await supabase
        .from('orders')
        .select('delivery_date, total_amount, quantity')
        .eq('assigned_distributor_id', distributor.id)
        .eq('status', 'delivered')
        .gte('delivery_date', start)
        .lte('delivery_date', today)
        .order('delivery_date', { ascending: true });

      // Group by date
      const dailyMap = new Map<string, DailyEarning>();
      
      // Initialize all days
      for (let i = 0; i < days; i++) {
        const dateStr = getLocalDateOffsetString(-(days - 1 - i));
        dailyMap.set(dateStr, { date: dateStr, amount: 0, orders: 0 });
      }

      // Fill with actual data (10% commission)
      ordersData?.forEach(order => {
        const existing = dailyMap.get(order.delivery_date);
        if (existing) {
          existing.amount += (order.total_amount || 0) * 0.1;
          existing.orders += 1;
        }
      });

      setDailyEarnings(Array.from(dailyMap.values()));
    } catch (e: any) {
      setError(e.message || 'Failed to load earnings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadEarnings();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatShortDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const maxEarning = Math.max(...dailyEarnings.map(d => d.amount), 1);

  const getPeriodLabel = () => {
    switch (period) {
      case 'today': return "Today's";
      case 'week': return "This Week's";
      case 'month': return "This Month's";
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Earnings</Text>
          <View style={{ width: 40 }} />
        </View>
        
        <ScrollView style={styles.content}>
          <Skeleton height={180} width="100%" radius={24} style={{ marginBottom: 20 }} />
          <Skeleton height={60} width="100%" radius={16} style={{ marginBottom: 12 }} />
          <Skeleton height={200} width="100%" radius={20} style={{ marginBottom: 20 }} />
          <Skeleton height={120} width="100%" radius={16} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Earnings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#0D9488"
            colors={['#0D9488']}
          />
        }
      >
        {/* Main Earnings Card */}
        <LinearGradient
          colors={['#0D9488', '#0F766E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.earningsCard}
        >
          <View style={styles.earningsCardHeader}>
            <Text style={styles.earningsLabel}>{getPeriodLabel()} Earnings</Text>
            <View style={styles.earningsBadge}>
              <Text style={styles.earningsBadgeText}>💰</Text>
            </View>
          </View>
          <Text style={styles.earningsAmount}>
            {formatCurrency(earnings?.total_earnings || 0)}
          </Text>
          <View style={styles.earningsStatsRow}>
            <View style={styles.earningsStat}>
              <Text style={styles.earningsStatValue}>{earnings?.total_orders || 0}</Text>
              <Text style={styles.earningsStatLabel}>Deliveries</Text>
            </View>
            <View style={styles.earningsStatDivider} />
            <View style={styles.earningsStat}>
              <Text style={styles.earningsStatValue}>{earnings?.total_units || 0}</Text>
              <Text style={styles.earningsStatLabel}>Units</Text>
            </View>
            <View style={styles.earningsStatDivider} />
            <View style={styles.earningsStat}>
              <Text style={styles.earningsStatValue}>
                {earnings?.total_orders ? formatCurrency((earnings.total_earnings || 0) / earnings.total_orders) : '₹0'}
              </Text>
              <Text style={styles.earningsStatLabel}>Avg/Order</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Period Selector */}
        <View style={styles.periodContainer}>
          {(['today', 'week', 'month'] as const).map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.periodChip, period === p && styles.periodChipActive]}
              onPress={() => setPeriod(p)}
              activeOpacity={0.7}
            >
              <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                {p === 'today' ? 'Today' : p === 'week' ? '7 Days' : '30 Days'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Error Banner */}
        {error && <ErrorBanner message={error} onRetry={loadEarnings} />}

        {/* Daily Breakdown Chart */}
        {period !== 'today' && dailyEarnings.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Daily Breakdown</Text>
            <View style={styles.chartContainer}>
              {dailyEarnings.slice(-7).map((day) => (
                <View key={day.date} style={styles.chartBarContainer}>
                  <View style={styles.chartBarWrapper}>
                    <View
                      style={[
                        styles.chartBar,
                        {
                          height: `${Math.max((day.amount / maxEarning) * 100, 5)}%`,
                          backgroundColor: day.amount > 0 ? '#0D9488' : '#E2E8F0',
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.chartBarLabel}>
                    {formatShortDate(day.date).split(' ')[0]}
                  </Text>
                  <Text style={styles.chartBarValue}>
                    {day.orders > 0 ? `₹${Math.round(day.amount)}` : '-'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Quick Stats */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#ECFDF5' }]}>
              <Text style={styles.statIconText}>📦</Text>
            </View>
            <Text style={styles.statValue}>{earnings?.total_orders || 0}</Text>
            <Text style={styles.statLabel}>Total Deliveries</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#FEF3C7' }]}>
              <Text style={styles.statIconText}>🥛</Text>
            </View>
            <Text style={styles.statValue}>{earnings?.total_units || 0}</Text>
            <Text style={styles.statLabel}>Units Delivered</Text>
          </View>
        </View>

        {/* Recent Earnings List */}
        {period !== 'today' && (
          <View style={styles.recentSection}>
            <Text style={styles.recentTitle}>Recent Days</Text>
            {dailyEarnings.slice().reverse().slice(0, 7).map((day) => (
              <View key={day.date} style={styles.recentItem}>
                <View style={styles.recentLeft}>
                  <View style={[styles.recentDot, { backgroundColor: day.orders > 0 ? '#0D9488' : '#CBD5E1' }]} />
                  <View>
                    <Text style={styles.recentDate}>{formatShortDate(day.date)}</Text>
                    <Text style={styles.recentOrders}>
                      {day.orders > 0 ? `${day.orders} deliveries` : 'No deliveries'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.recentAmount, { color: day.amount > 0 ? '#059669' : '#94A3B8' }]}>
                  {day.amount > 0 ? formatCurrency(day.amount) : '-'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Empty State for Today */}
        {period === 'today' && (earnings?.total_orders || 0) === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTitle}>No Earnings Today</Text>
            <Text style={styles.emptySubtitle}>
              Complete deliveries to start earning. Your earnings will appear here.
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 20,
    color: '#1E293B',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  earningsCard: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
  },
  earningsCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  earningsLabel: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  earningsBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  earningsBadgeText: {
    fontSize: 22,
  },
  earningsAmount: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
    marginBottom: 20,
  },
  earningsStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  earningsStat: {
    flex: 1,
    alignItems: 'center',
  },
  earningsStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  earningsStatLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  earningsStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  periodContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 6,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  periodChip: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
  },
  periodChipActive: {
    backgroundColor: '#0D9488',
  },
  periodText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  periodTextActive: {
    color: '#FFFFFF',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
    flex: 1,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0D9488',
  },
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 20,
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 140,
  },
  chartBarContainer: {
    flex: 1,
    alignItems: 'center',
  },
  chartBarWrapper: {
    flex: 1,
    width: '60%',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  chartBar: {
    width: '100%',
    borderRadius: 6,
    minHeight: 4,
  },
  chartBarLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  chartBarValue: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statIconText: {
    fontSize: 22,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  recentSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  recentTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 16,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  recentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 14,
  },
  recentDate: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  recentOrders: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  recentAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },
});
