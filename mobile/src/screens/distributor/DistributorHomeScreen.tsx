import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { AppLayout } from '../../components/AppLayout';
import { useAuthStore } from '../../store/authStore';
import { theme } from '../../theme';
import { AppBar } from '../../components/AppBar';
import { formatCurrency, formatQuantity, getLocalDateString, getLocalDateOffsetString } from '../../utils/helpers';
import { getAuthUserId } from '../../utils/auth';
import { supabase } from '../../services/supabase';
import type { DistributorScreenProps } from '../../navigation/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface DashboardStats {
  todayDeliveries: number;
  todayCompleted: number;
  todayPending: number;
  todayEarnings: number;
  weeklyEarnings: number;
  monthlyEarnings: number;
  assignedBuildings: number;
  totalCustomers: number;
}

interface StockItem {
  productId: string;
  productName: string;
  unit: string;
  requiredQty: number;
  deliveredQty: number;
  pendingQty: number;
}

export const DistributorHomeScreen = ({ navigation }: DistributorScreenProps<'DistributorHome'>) => {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    todayDeliveries: 0,
    todayCompleted: 0,
    todayPending: 0,
    todayEarnings: 0,
    weeklyEarnings: 0,
    monthlyEarnings: 0,
    assignedBuildings: 0,
    totalCustomers: 0,
  });
  const [stockSummary, setStockSummary] = useState<StockItem[]>([]);
  const [distributorId, setDistributorId] = useState<string | null>(null);
  const [distributorName, setDistributorName] = useState<string>('');

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      await loadDistributorInfo();
      await loadStats();
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadDistributorInfo = async () => {
    const userId = await getAuthUserId();
    if (!userId) return;

    const { data } = await supabase
      .from('distributors')
      .select('id, users(name)')
      .eq('user_id', userId)
      .single();

    if (data) {
      setDistributorId(data.id);
      setDistributorName((data.users as any)?.name || 'Distributor');
    }
  };

  const loadStats = async () => {
    const userId = await getAuthUserId();
    if (!userId) return;

    const { data: dist } = await supabase
      .from('distributors')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!dist?.id) return;

    const today = getLocalDateString();
    const weekAgo = getLocalDateOffsetString(-7);
    const monthStart = getLocalDateString(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

    // Get active building assignments first (for TODAY'S DELIVERIES view only)
    const { data: activeAssignments } = await supabase
      .from('distributor_building_assignments')
      .select('tower_id')
      .eq('distributor_id', dist.id)
      .eq('is_active', true);

    const activeTowerIds = (activeAssignments || []).map(a => a.tower_id);

    // Get today's deliveries - filter by active buildings (what they need to do TODAY)
    const { data: todayOrders } = await supabase
      .from('orders')
      .select('id, status, total_amount, addresses!orders_address_id_fkey(tower_id)')
      .eq('assigned_distributor_id', dist.id)
      .eq('delivery_date', today);

    // Filter to only include orders for active buildings (for today's work)
    const todayDeliveries = (todayOrders || []).filter((o: any) =>
      activeTowerIds.includes(o.addresses?.tower_id)
    );
    const todayCompleted = todayDeliveries.filter(o => o.status === 'delivered').length;
    const todayPending = todayDeliveries.filter(o => ['scheduled', 'pending', 'assigned', 'in_transit'].includes(o.status)).length;

    // Today's earnings from delivered orders (what they earned TODAY from active buildings)
    const todayEarnings = todayDeliveries
      .filter(o => o.status === 'delivered')
      .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0) * 0.1; // 10% commission

    // EARNINGS: Based on ALL delivered orders - NOT filtered by current building assignments
    // If distributor delivered orders, they earned from those regardless of current assignment status

    // Get weekly earnings (ALL delivered orders, regardless of building assignment)
    const { data: weekOrders } = await supabase
      .from('orders')
      .select('total_amount')
      .eq('assigned_distributor_id', dist.id)
      .eq('status', 'delivered')
      .gte('delivery_date', weekAgo);

    const weeklyEarnings = (weekOrders || [])
      .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0) * 0.1;

    // Get monthly earnings (ALL delivered orders, regardless of building assignment)
    const { data: monthOrders } = await supabase
      .from('orders')
      .select('total_amount')
      .eq('assigned_distributor_id', dist.id)
      .eq('status', 'delivered')
      .gte('delivery_date', monthStart);

    const monthlyEarnings = (monthOrders || [])
      .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0) * 0.1;

    // Get assigned buildings (RPC already filters by is_active)
    const { data: buildings } = await supabase.rpc('get_distributor_buildings', {
      p_distributor_id: dist.id
    });

    // Get unique customers in assigned buildings via addresses table
    const towerIds = (buildings || []).map((b: any) => b.tower_id);
    let uniqueCustomers = 0;
    if (towerIds.length > 0) {
      const { data: addressCustomers } = await supabase
        .from('addresses')
        .select('user_id')
        .in('tower_id', towerIds);
      uniqueCustomers = new Set((addressCustomers || []).map(a => a.user_id)).size;
    }

    // Calculate stock summary from today's orders (for active buildings only)
    const { data: stockOrders } = await supabase
      .from('orders')
      .select('id, status, quantity, product_id, products!orders_product_id_fkey(id, name, unit), addresses!orders_address_id_fkey(tower_id)')
      .eq('assigned_distributor_id', dist.id)
      .eq('delivery_date', today);

    const stockMap = new Map<string, StockItem>();
    (stockOrders || []).filter((order: any) => activeTowerIds.includes(order.addresses?.tower_id)).forEach((order: any) => {
      const productId = order.product_id;
      const product = order.products;
      if (!productId || !product) return;

      const existing = stockMap.get(productId) || {
        productId,
        productName: product.name || 'Unknown',
        unit: product.unit || '',
        requiredQty: 0,
        deliveredQty: 0,
        pendingQty: 0,
      };

      const qty = Number(order.quantity) || 0;
      existing.requiredQty += qty;
      if (order.status === 'delivered') {
        existing.deliveredQty += qty;
      } else if (['scheduled', 'pending', 'assigned', 'in_transit'].includes(order.status)) {
        existing.pendingQty += qty;
      }
      stockMap.set(productId, existing);
    });

    setStockSummary(Array.from(stockMap.values()).sort((a, b) => a.productName.localeCompare(b.productName)));

    setStats({
      todayDeliveries: todayDeliveries.length,
      todayCompleted,
      todayPending,
      todayEarnings,
      weeklyEarnings,
      monthlyEarnings,
      assignedBuildings: (buildings || []).length,
      totalCustomers: uniqueCustomers,
    });
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const completionRate = stats.todayDeliveries > 0
    ? Math.round((stats.todayCompleted / stats.todayDeliveries) * 100)
    : 0;

  if (loading) {
    return (
      <AppLayout>
        <AppBar title="Distributor Dashboard" subtitle={distributorName || 'Loading...'} variant="surface" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      </AppLayout>
    );
  }

  return (
    <View style={styles.container}>
      <AppBar
        title="Distributor Dashboard"
        subtitle={distributorName}
        variant="surface"
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />
        }
      >
        {/* Personalized Greeting */}
        <View style={styles.greetingSection}>
          <Text style={styles.greetingText}>{getGreeting()}, {distributorName.split(' ')[0]}! 👋</Text>
          <Text style={styles.greetingSubtext}>
            {stats.todayPending > 0
              ? `You have ${stats.todayPending} pending deliver${stats.todayPending > 1 ? 'ies' : 'y'} today`
              : stats.todayCompleted > 0
                ? `Great job! All ${stats.todayCompleted} deliveries completed`
                : 'Ready for deliveries'
            }
          </Text>
        </View>

        {/* Today's Progress Card */}
        <TouchableOpacity
          style={styles.progressCard}
          onPress={() => navigation.navigate('TodaysDeliveries')}
          activeOpacity={0.8}
        >
          <View style={styles.progressGradientOverlay} />
          <View style={styles.progressHeader}>
            <View>
              <Text style={styles.progressLabel}>Today's Progress</Text>
              <Text style={styles.progressValue}>{stats.todayCompleted}/{stats.todayDeliveries}</Text>
            </View>
            <View style={[
              styles.progressBadge,
              completionRate === 100 ? styles.progressBadgeComplete : styles.progressBadgePending
            ]}>
              <Text style={styles.progressBadgeIcon}>{completionRate === 100 ? '✓' : '🚚'}</Text>
              <Text style={[
                styles.progressBadgeText,
                completionRate === 100 ? styles.progressBadgeTextComplete : styles.progressBadgeTextPending
              ]}>
                {completionRate === 100 ? 'Done!' : `${completionRate}%`}
              </Text>
            </View>
          </View>
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${completionRate}%` }]} />
          </View>
          <View style={styles.progressFooter}>
            <View style={styles.progressStat}>
              <Text style={styles.progressStatValue}>{stats.todayCompleted}</Text>
              <Text style={styles.progressStatLabel}>Delivered</Text>
            </View>
            <View style={styles.progressDivider} />
            <View style={styles.progressStat}>
              <Text style={[styles.progressStatValue, stats.todayPending > 0 && styles.progressStatValuePending]}>
                {stats.todayPending}
              </Text>
              <Text style={styles.progressStatLabel}>Pending</Text>
            </View>
            <View style={styles.progressDivider} />
            <View style={styles.progressStat}>
              <Text style={styles.progressStatValue}>{formatCurrency(stats.todayEarnings)}</Text>
              <Text style={styles.progressStatLabel}>Earned</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Pending Alert */}
        {stats.todayPending > 0 && (
          <TouchableOpacity
            style={styles.alertBanner}
            onPress={() => navigation.navigate('TodaysDeliveries')}
            activeOpacity={0.7}
          >
            <View style={styles.alertIconContainer}>
              <Text style={styles.alertIconText}>🚚</Text>
              <View style={styles.alertPulse} />
            </View>
            <View style={styles.alertContent}>
              <Text style={styles.alertTitle}>Pending Deliveries</Text>
              <Text style={styles.alertMessage}>
                {stats.todayPending} {stats.todayPending > 1 ? 'deliveries' : 'delivery'} waiting • Start now
              </Text>
            </View>
            <View style={styles.alertChevron}>
              <Text style={styles.alertChevronText}>→</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('AssignedBuildings')}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#FCE7F3' }]}>
                <Text style={styles.actionEmoji}>🏢</Text>
              </View>
              <Text style={styles.actionLabel}>Buildings</Text>
              {stats.assignedBuildings > 0 && (
                <View style={styles.actionBadge}>
                  <Text style={styles.actionBadgeText}>{stats.assignedBuildings}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('StockCollection')}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#D1FAE5' }]}>
                <Text style={styles.actionEmoji}>📥</Text>
              </View>
              <Text style={styles.actionLabel}>Stock</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('Earnings')}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#FEF3C7' }]}>
                <Text style={styles.actionEmoji}>💰</Text>
              </View>
              <Text style={styles.actionLabel}>Earnings</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Earnings Card */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Earnings Overview</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Earnings')}>
              <Text style={styles.sectionLink}>View All</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.earningsCard}>
            <View style={styles.earningsRow}>
              <View style={styles.earningsItem}>
                <Text style={styles.earningsLabel}>This Week</Text>
                <Text style={styles.earningsValue}>{formatCurrency(stats.weeklyEarnings)}</Text>
              </View>
              <View style={styles.earningsDivider} />
              <View style={styles.earningsItem}>
                <Text style={styles.earningsLabel}>This Month</Text>
                <Text style={[styles.earningsValue, styles.earningsValueLarge]}>{formatCurrency(stats.monthlyEarnings)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Stock Summary */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Today's Stock</Text>
            <TouchableOpacity onPress={() => navigation.navigate('StockCollection')}>
              <Text style={styles.sectionLink}>Manage</Text>
            </TouchableOpacity>
          </View>

          {stockSummary.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyTitle}>No Stock Assigned</Text>
              <Text style={styles.emptyText}>No deliveries scheduled for today</Text>
            </View>
          ) : (
            <View style={styles.stockCard}>
              {stockSummary.map((item, index) => (
                <View key={item.productId}>
                  <View style={styles.stockRow}>
                    <View style={styles.stockInfo}>
                      <Text style={styles.stockName}>{item.productName}</Text>
                      <Text style={styles.stockTotal}>
                        Total: {formatQuantity(item.requiredQty, item.unit)}
                      </Text>
                    </View>
                    <View style={styles.stockBadges}>
                      <View style={[styles.stockBadge, styles.stockBadgeSuccess]}>
                        <Text style={styles.stockBadgeSuccessText}>✓ {item.deliveredQty}</Text>
                      </View>
                      {item.pendingQty > 0 && (
                        <View style={[styles.stockBadge, styles.stockBadgeWarning]}>
                          <Text style={styles.stockBadgeWarningText}>⏳ {item.pendingQty}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  {index < stockSummary.length - 1 && <View style={styles.stockDivider} />}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Stats Cards */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: '#DBEAFE' }]}>
                <Text style={styles.statEmoji}>🏢</Text>
              </View>
              <Text style={styles.statValue}>{stats.assignedBuildings}</Text>
              <Text style={styles.statLabel}>Buildings</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: '#D1FAE5' }]}>
                <Text style={styles.statEmoji}>👥</Text>
              </View>
              <Text style={styles.statValue}>{stats.totalCustomers}</Text>
              <Text style={styles.statLabel}>Customers</Text>
            </View>
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },

  // Greeting Section
  greetingSection: {
    marginBottom: 20,
  },
  greetingText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  greetingSubtext: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '500',
  },

  // Progress Card
  progressCard: {
    backgroundColor: theme.colors.primary,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
    overflow: 'hidden',
  },
  progressGradientOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.1)',
    transform: [{ translateX: 50 }, { translateY: -50 }],
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  progressLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progressValue: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1.5,
    marginTop: 4,
  },
  progressBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  progressBadgeComplete: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  progressBadgePending: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  progressBadgeIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  progressBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressBadgeTextComplete: {
    color: '#86EFAC',
  },
  progressBadgeTextPending: {
    color: '#FFFFFF',
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    marginBottom: 16,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
  },
  progressFooter: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  progressStat: {
    alignItems: 'center',
  },
  progressStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  progressStatValuePending: {
    color: '#FCD34D',
  },
  progressStatLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
    fontWeight: '500',
  },
  progressDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },

  // Alert Banner
  alertBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  alertIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FCD34D',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  alertPulse: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    top: -2,
    right: -2,
    borderWidth: 2,
    borderColor: '#FEF3C7',
  },
  alertIconText: {
    fontSize: 22,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 2,
  },
  alertMessage: {
    fontSize: 13,
    color: '#B45309',
    fontWeight: '500',
  },
  alertChevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FDE68A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertChevronText: {
    fontSize: 16,
    color: '#92400E',
    fontWeight: '600',
  },

  // Section
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  sectionLink: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '600',
  },

  // Actions Grid
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  actionCard: {
    width: (SCREEN_WIDTH - 56) / 4,
    aspectRatio: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    margin: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionEmoji: {
    fontSize: 24,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'center',
  },
  actionBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#EF4444',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  actionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Earnings Card
  earningsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  earningsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  earningsItem: {
    flex: 1,
    alignItems: 'center',
  },
  earningsDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E2E8F0',
  },
  earningsLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    marginBottom: 8,
  },
  earningsValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  earningsValueLarge: {
    fontSize: 24,
    color: theme.colors.primary,
  },

  // Stock Card
  stockCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  stockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  stockInfo: {
    flex: 1,
  },
  stockName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 2,
  },
  stockTotal: {
    fontSize: 12,
    color: '#64748B',
  },
  stockBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  stockBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  stockBadgeSuccess: {
    backgroundColor: '#DCFCE7',
  },
  stockBadgeSuccessText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16A34A',
  },
  stockBadgeWarning: {
    backgroundColor: '#FEF3C7',
  },
  stockBadgeWarningText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D97706',
  },
  stockDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },

  // Empty Card
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statEmoji: {
    fontSize: 24,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },

  bottomSpacer: {
    height: 20,
  },
});
