import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Modal,
  Pressable,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppLayout } from '../../components/AppLayout';
import { VictoryPie, VictoryChart, VictoryLine, VictoryBar, VictoryTheme, VictoryAxis } from 'victory-native';
import { useToast } from '../../components/Toast';
import { useAuthStore } from '../../store/authStore';
import { theme } from '../../theme';
import { AppBar } from '../../components/AppBar';
import { formatCurrency, getLocalDateString, getLocalDateOffsetString } from '../../utils/helpers';
import { ProductService } from '../../services/api/products';
import { useAnalyticsStore } from '../../store/analyticsStore';
import { CustomerAdminService } from '../../services/api/customers';
import { supabase } from '../../services/supabase';
import { useAdminDashboardStore } from '../../store/adminDashboardStore';
import { useNavigation } from '@react-navigation/native';
import type { AdminStackParamList } from '../../navigation/types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type AdminTab = 'dashboard' | 'customers' | 'distributors' | 'products' | 'subscriptions' | 'societies' | 'stock' | 'analytics' | 'settings';

interface Customer {
  id: string;
  name: string;
  phone: string;
  wallet: number;
  subscriptions: number;
  status: string;
  area: string;
}

interface Distributor {
  id: string;
  name: string;
  phone: string;
  zone: string;
  deliveries: number;
  onTime: number;
  rating: number;
  collection: number;
  deliveries7d?: Array<{ day: string; delivered: number; total: number }>;
  onTimeHistory?: number[];
}

interface DashboardStats {
  totalCustomers: number;
  activeSubscriptions: number;
  totalDistributors: number;
  todayDeliveries: number;
  pendingDeliveries: number;
  completedDeliveries: number;
  todayRevenue: number;
  monthlyRevenue: number;
  lowWalletCustomers: number;
  pausedSubscriptions: number;
}

export const AdminDashboardScreen: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Data states
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]); // Track unfiltered for counts
  const [page, setPage] = useState(0);
  const [pageSize] = useState(25);
  const [totalCustomers, setTotalCustomers] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'low' | 'active' | 'inactive'>('all');
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [subscriptionFilter, setSubscriptionFilter] = useState<'all' | 'active' | 'paused' | 'cancelled'>('all');
  const [societies, setSocieties] = useState<any[]>([]);
  const [societiesLoading, setSocietiesLoading] = useState(false);
  const [societySearchQuery, setSocietySearchQuery] = useState('');
  const [walletModalVisible, setWalletModalVisible] = useState(false);
  const [walletModalCustomerId, setWalletModalCustomerId] = useState<string | null>(null);
  const [walletAmount, setWalletAmount] = useState('200');
  const [walletNote, setWalletNote] = useState('Admin recharge');

  // Analytics store hook
  const {
    revenueTrend,
    deliveryPerf,
    customerGrowth,
    productPopularity,
    loading: analyticsLoading,
    loadAnalytics,
  } = useAnalyticsStore();
  const navigation = useNavigation<NativeStackNavigationProp<AdminStackParamList>>();
  const toast = useToast();
  // New realtime dashboard store
  const { dashboard, fetchDashboard, subscribeRealtime } = useAdminDashboardStore();

  useEffect(() => {
    // Guard: only allow admins
    if (user && user.role !== 'admin') {
      navigation.reset({ index: 0, routes: [{ name: 'Auth' as never }] });
      return;
    }
    // Load initial dashboard + attach realtime, then other lists
    fetchDashboard();
    subscribeRealtime();
    loadAllData();
  }, [user]);

  const loadAllData = async () => {
    try {
      setErrorMessage(null);
      setLoading(true);
      await Promise.all([
        loadProducts(),
        loadCustomers(),
        fetchDashboard(),
        loadDistributors(),
        loadSubscriptions(),
        loadSocieties(),
      ]);
    } catch (error: any) {
      console.error('Error loading dashboard data:', error);
      setErrorMessage('Failed to load some data. Pull to refresh.');
      toast.show('Dashboard data load failed', { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Map new master_admin_dashboard structure to legacy stats shape for UI reuse
  useEffect(() => {
    if (!dashboard) return;
    const orders = dashboard.orders_today || { pending: 0, delivered: 0, skipped: 0, cancelled: 0, revenue: 0 };
    const subs = dashboard.subscriptions || { active: 0, paused: 0, cancelled: 0, currently_paused: 0 };
    const cust = (dashboard as any).customers || { total: stats?.totalCustomers || 0, low_wallet: stats?.lowWalletCustomers || 0 };
    const revMonth = (dashboard as any).revenue_month || { delivered_revenue: stats?.monthlyRevenue || 0 };
    setStats({
      totalCustomers: cust.total || 0,
      activeSubscriptions: subs.active || 0,
      totalDistributors: dashboard.distributors?.length || 0,
      todayDeliveries: (orders.pending || 0) + (orders.delivered || 0),
      pendingDeliveries: orders.pending || 0,
      completedDeliveries: orders.delivered || 0,
      todayRevenue: orders.revenue || 0,
      monthlyRevenue: revMonth.delivered_revenue || 0,
      lowWalletCustomers: cust.low_wallet || 0,
      pausedSubscriptions: subs.currently_paused || subs.paused || 0,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard]);

  const loadProducts = async () => {
    try {
      const prod = await ProductService.getAllProducts(true);
      setProducts(prod.map(p => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        category: p.category,
        price: p.price,
        unit: p.unit,
      })) as any[]);
    } catch (error) {
      console.error('Error loading products:', error);
      setProducts([]);
      toast.show('Products load failed', { type: 'error' });
    }
  };

  const loadSocieties = async () => {
    try {
      setSocietiesLoading(true);
      const { data, error } = await supabase
        .from('societies')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setSocieties(data || []);
    } catch (error) {
      console.error('Error loading societies:', error);
      setSocieties([]);
      toast.show('Societies load failed', { type: 'error' });
    } finally {
      setSocietiesLoading(false);
    }
  };

  const loadCustomers = async (append = false) => {
    try {
      if (!append) {
        setCustomerLoading(true);
      } else {
        setLoadingMore(true);
      }
      const { rows, total } = await CustomerAdminService.getCustomersPaged({
        limit: pageSize,
        offset: page * pageSize,
        searchQuery: searchQuery.trim() || undefined,
      });
      setTotalCustomers(total);
      const mapped = rows.map((r: any) => ({
        id: r.id,
        name: r.name || '—',
        phone: r.phone || '—',
        wallet: r.wallet || 0,
        subscriptions: r.subscriptions || 0,
        status: r.subscriptions > 0 ? 'active' : 'inactive',
        area: r.area || '—',
      }));

      // Store all customers (unfiltered) for accurate filter counts
      if (!append) {
        setAllCustomers(mapped);
      } else {
        setAllCustomers(prev => [...prev, ...mapped]);
      }

      const filtered = mapped.filter((c: any) => {
        switch (selectedFilter) {
          case 'low':
            return c.wallet < 200; // Match dashboard threshold
          case 'active':
            return c.status === 'active';
          case 'inactive':
            return c.status !== 'active';
          default:
            return true;
        }
      });

      setCustomers(prev => append ? [...prev, ...filtered] : filtered);
    } catch (error) {
      console.error('Error loading customers:', error);
      setErrorMessage('Failed to load customers.');
      if (!append) setCustomers([]);
      toast.show('Customers load failed', { type: 'error' });
    } finally {
      setCustomerLoading(false);
      setLoadingMore(false);
    }
  };

  // Load analytics when tab activated with caching
  useEffect(() => {
    if (activeTab === 'analytics') {
      loadAnalytics(false);
    }
  }, [activeTab, loadAnalytics]);

  // Debounce customer search
  useEffect(() => {
    const h = setTimeout(() => {
      // Reset when search changes
      setPage(0);
      loadCustomers(false);
    }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, selectedFilter]);

  const loadDistributors = async () => {
    try {
      const today = getLocalDateString();
      const weekAgo = getLocalDateOffsetString(-6);
      
      // Fetch distributors with their user info
      const { data: distData, error: distError } = await supabase
        .from('distributors')
        .select('id, user_id, assigned_areas, users:users!inner (name, phone)')
        .eq('is_active', true)
        .limit(100);
      
      if (distError) throw distError;
      
      // Fetch today's orders for all distributors to get real stats
      const { data: ordersData } = await supabase
        .from('orders')
        .select('assigned_distributor_id, status, total_amount, delivery_date')
        .gte('delivery_date', weekAgo)
        .lte('delivery_date', today);
      
      // Calculate stats per distributor
      const statsMap = new Map<string, { deliveries: number; completed: number; revenue: number }>();
      (ordersData || []).forEach((order: any) => {
        if (order.assigned_distributor_id) {
          const existing = statsMap.get(order.assigned_distributor_id) || { deliveries: 0, completed: 0, revenue: 0 };
          existing.deliveries++;
          if (order.status === 'delivered') {
            existing.completed++;
            existing.revenue += Number(order.total_amount || 0);
          }
          statsMap.set(order.assigned_distributor_id, existing);
        }
      });
      
      const rows = distData || [];
      setDistributors(rows.map((r: any) => {
        const stats = statsMap.get(r.id) || { deliveries: 0, completed: 0, revenue: 0 };
        const onTimeRate = stats.deliveries > 0 ? Math.round((stats.completed / stats.deliveries) * 100) : 0;
        return {
          id: r.id,
          name: r.users?.name || 'Distributor',
          phone: r.users?.phone || '—',
          zone: Array.isArray(r.assigned_areas) && r.assigned_areas.length > 0 ? r.assigned_areas[0] : '—',
          deliveries: stats.deliveries,
          onTime: onTimeRate,
          rating: 5.0,
          collection: stats.revenue,
        };
      }));
    } catch (error) {
      console.error('Error loading distributors:', error);
      setDistributors([]);
    }
  };

  const loadSubscriptions = async () => {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select(`
          id, user_id, product_id, quantity, frequency, status, start_date, created_at,
          products:product_id (name, unit),
          users:user_id (id, name, phone)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      // Fetch wallet balances separately via customers table
      const userIds = (data || []).map((s: any) => s.user_id).filter(Boolean);
      let walletMap = new Map<string, number>();
      if (userIds.length > 0) {
        const { data: customersData } = await supabase
          .from('customers')
          .select('user_id, wallet_balance')
          .in('user_id', userIds);
        (customersData || []).forEach((c: any) => walletMap.set(c.user_id, c.wallet_balance));
      }

      setSubscriptions((data || []).map((sub: any) => ({
        id: sub.id,
        customerId: sub.user_id,
        customer: sub.users?.name || 'Unknown',
        customerPhone: sub.users?.phone || '—',
        wallet: walletMap.get(sub.user_id) ?? null,
        product: sub.products?.name || 'Unknown Product',
        qty: sub.quantity === 1 ? (sub.products?.unit || '1') : `${sub.quantity} × ${sub.products?.unit || ''}`.trim(),
        frequency: sub.frequency,
        status: sub.status,
        nextDelivery: sub.start_date,
      })));
    } catch (error) {
      console.error('Error loading subscriptions:', error);
      setSubscriptions([]);
      Alert.alert('Error', 'Failed to load subscriptions');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    await logout();
  };

  const renderDashboard = () => (
    <ScrollView
      style={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Revenue & Delivery Tracker Card */}
      <View style={styles.section}>
        <TouchableOpacity 
          activeOpacity={0.9}
          onPress={() => navigation.navigate('RevenueAnalytics')}
        >
          <LinearGradient
            colors={['#7C3AED', '#A855F7']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.trackerCard}
          >
            <View style={styles.trackerHeader}>
              <View>
                <Text style={styles.trackerLabel}>Today's Revenue</Text>
                <Text style={styles.trackerValue}>
                  {loading ? '...' : formatCurrency(stats?.todayRevenue || 0)}
                </Text>
              </View>
              <View style={styles.trackerBadge}>
                <Text style={styles.trackerBadgeText}>💰</Text>
              </View>
            </View>
            
            <View style={styles.trackerDivider} />
            
            <View style={styles.trackerStats}>
              <View style={styles.trackerStatItem}>
                <Text style={styles.trackerStatValue}>
                  {loading ? '-' : stats?.completedDeliveries || 0}
                </Text>
                <Text style={styles.trackerStatLabel}>Delivered</Text>
              </View>
              <View style={styles.trackerStatDivider} />
              <View style={styles.trackerStatItem}>
                <Text style={styles.trackerStatValue}>
                  {loading ? '-' : stats?.pendingDeliveries || 0}
                </Text>
                <Text style={styles.trackerStatLabel}>Pending</Text>
              </View>
              <View style={styles.trackerStatDivider} />
              <View style={styles.trackerStatItem}>
                <Text style={styles.trackerStatValue}>
                  {loading ? '-' : stats?.todayDeliveries || 0}
                </Text>
                <Text style={styles.trackerStatLabel}>Total</Text>
              </View>
            </View>
            
            {/* Delivery Progress Bar */}
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { 
                      width: `${stats?.todayDeliveries ? ((stats.completedDeliveries / stats.todayDeliveries) * 100) : 0}%` 
                    }
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>
                {stats?.todayDeliveries ? Math.round((stats.completedDeliveries / stats.todayDeliveries) * 100) : 0}% Complete
              </Text>
            </View>
            
            {/* Tap hint */}
            <View style={{ alignItems: 'center', marginTop: 8 }}>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>Tap for detailed analytics →</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Quick Stats Row */}
      <View style={styles.section}>
        <View style={styles.quickStatsRow}>
          <View style={styles.quickStatCard}>
            <Text style={styles.quickStatIcon}>👥</Text>
            <Text style={styles.quickStatValue}>{loading ? '-' : stats?.totalCustomers || 0}</Text>
            <Text style={styles.quickStatLabel}>Customers</Text>
          </View>
          <View style={styles.quickStatCard}>
            <Text style={styles.quickStatIcon}>📋</Text>
            <Text style={styles.quickStatValue}>{loading ? '-' : stats?.activeSubscriptions || 0}</Text>
            <Text style={styles.quickStatLabel}>Active Subs</Text>
          </View>
          <View style={styles.quickStatCard}>
            <Text style={styles.quickStatIcon}>🚚</Text>
            <Text style={styles.quickStatValue}>{loading ? '-' : stats?.totalDistributors || 0}</Text>
            <Text style={styles.quickStatLabel}>Distributors</Text>
          </View>
        </View>
      </View>

      {/* Monthly Revenue Card */}
      <View style={styles.section}>
        <View style={styles.revenueCard}>
          <View style={styles.revenueHeader}>
            <View>
              <Text style={styles.revenueLabel}>Monthly Revenue</Text>
              <Text style={styles.revenueValue}>
                {loading ? '...' : formatCurrency(stats?.monthlyRevenue || 0)}
              </Text>
            </View>
            <View style={styles.revenueTrendBadge}>
              <Text style={styles.revenueTrendText}>📈 This Month</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Alerts Section */}
      {((stats?.lowWalletCustomers || 0) > 0 || (stats?.pausedSubscriptions || 0) > 0) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚡ Needs Attention</Text>
          
          {(stats?.lowWalletCustomers || 0) > 0 && (
            <TouchableOpacity style={styles.alertCard} onPress={() => {
              setSelectedFilter('low');
              setActiveTab('customers');
            }}>
              <View style={[styles.alertIconContainer, { backgroundColor: '#FEF3C7' }]}>
                <Text style={styles.alertIcon}>💸</Text>
              </View>
              <View style={styles.alertInfo}>
                <Text style={styles.alertTitle}>Low Wallet</Text>
                <Text style={styles.alertText}>{stats?.lowWalletCustomers} customers need top-up</Text>
              </View>
              <Text style={styles.alertArrow}>›</Text>
            </TouchableOpacity>
          )}

          {(stats?.pausedSubscriptions || 0) > 0 && (
            <TouchableOpacity style={styles.alertCard} onPress={() => {
              setSubscriptionFilter('paused');
              setActiveTab('subscriptions');
            }}>
              <View style={[styles.alertIconContainer, { backgroundColor: '#FEE2E2' }]}>
                <Text style={styles.alertIcon}>⏸️</Text>
              </View>
              <View style={styles.alertInfo}>
                <Text style={styles.alertTitle}>Paused Subs</Text>
                <Text style={styles.alertText}>{stats?.pausedSubscriptions} due to low balance</Text>
              </View>
              <Text style={styles.alertArrow}>›</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActionsGrid}>
          <TouchableOpacity 
            style={styles.quickActionCard}
            onPress={() => setActiveTab('customers')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: '#EDE9FE' }]}>
              <Text style={styles.quickActionEmoji}>👥</Text>
            </View>
            <Text style={styles.quickActionLabel}>Customers</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.quickActionCard}
            onPress={() => setActiveTab('distributors')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: '#FEF3C7' }]}>
              <Text style={styles.quickActionEmoji}>🚚</Text>
            </View>
            <Text style={styles.quickActionLabel}>Distributors</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.quickActionCard}
            onPress={() => setActiveTab('products')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: '#D1FAE5' }]}>
              <Text style={styles.quickActionEmoji}>🥛</Text>
            </View>
            <Text style={styles.quickActionLabel}>Products</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.quickActionCard}
            onPress={() => setActiveTab('subscriptions')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: '#DBEAFE' }]}>
              <Text style={styles.quickActionEmoji}>📋</Text>
            </View>
            <Text style={styles.quickActionLabel}>Subscriptions</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.quickActionCard}
            onPress={() => setActiveTab('societies')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: '#FCE7F3' }]}>
              <Text style={styles.quickActionEmoji}>🏘️</Text>
            </View>
            <Text style={styles.quickActionLabel}>Societies</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.quickActionCard}
            onPress={() => navigation.navigate('PendingAddressChanges')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: '#E0F2FE' }]}>
              <Text style={styles.quickActionEmoji}>📍</Text>
            </View>
            <Text style={styles.quickActionLabel}>Address Changes</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.quickActionCard}
            onPress={() => setActiveTab('analytics')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: '#FEE2E2' }]}>
              <Text style={styles.quickActionEmoji}>📊</Text>
            </View>
            <Text style={styles.quickActionLabel}>Analytics</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Info Banner - Orders are auto-generated */}
      <View style={[styles.section, { backgroundColor: '#F0FDF4', padding: 16, borderRadius: 12, marginHorizontal: 20 }]}>
        <Text style={{ fontSize: 13, color: '#166534', lineHeight: 20 }}>
          ✨ <Text style={{ fontWeight: '600' }}>Orders auto-generate</Text> when customers subscribe or modify their calendar. Stock collections update automatically based on assigned orders.
        </Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  const renderCustomers = () => (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
      {/* Search Bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search customers by name, phone, or area..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={theme.colors.textSecondary}
          />
          {!!searchQuery && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.filterRow}>
          {(['all','low','active','inactive'] as const).map(f => (
            <TouchableOpacity
              key={f}
              style={[
                styles.filterChip,
                selectedFilter !== f && styles.filterChipInactive,
              ]}
              onPress={() => {
                setSelectedFilter(f);
              }}
            >
              <Text style={selectedFilter === f ? styles.filterChipText : styles.filterChipTextInactive}>
                {f === 'all' && `All (${totalCustomers ?? '…'})`}
                {f === 'low' && `Low Wallet (${allCustomers.filter(c => c.wallet < 200).length})`}
                {f === 'active' && `Active (${allCustomers.filter(c => c.status === 'active').length})`}
                {f === 'inactive' && `Inactive (${allCustomers.filter(c => c.status !== 'active').length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {customerLoading && (
          <View style={{ paddingVertical: 8 }}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        )}
        {!!errorMessage && (
          <View style={styles.errorBannerSmall}>
            <Text style={styles.errorBannerText}>{errorMessage}</Text>
          </View>
        )}
      </View>

      {/* Customer List */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Customer List</Text>
          <TouchableOpacity>
            <Text style={styles.linkText}>Export CSV</Text>
          </TouchableOpacity>
        </View>
        {customers.map((customer) => (
          <TouchableOpacity
            key={customer.id}
            style={styles.listCard}
            onPress={() => {
              navigation.navigate('CustomerDetail', { customerId: customer.id });
            }}
          >
            <View style={styles.listCardMain}>
              <View style={styles.listCardLeft}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{customer.name.charAt(0)}</Text>
                </View>
                <View style={styles.listCardInfo}>
                  <Text style={styles.listCardTitle}>{customer.name}</Text>
                  <Text style={styles.listCardSubtitle}>{customer.phone} • {customer.area}</Text>
                </View>
              </View>
              <Text style={styles.listCardArrow}>›</Text>
            </View>
            <View style={styles.listCardFooter}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>💰 {formatCurrency(customer.wallet)}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>📋 {customer.subscriptions} subscriptions</Text>
              </View>
              <View style={[styles.badge, customer.wallet < 100 && styles.badgeWarning]}>
                <Text style={[styles.badgeText, customer.wallet < 100 && styles.badgeTextWarning]}>
                  {customer.status === 'active' ? '✅ Active' : '⏸️ Inactive'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.topupBtn}
                onPress={async () => {
                  try {
                    await CustomerAdminService.adjustWallet(customer.id, 100, 'Admin quick top-up');
                    await loadCustomers();
                    Alert.alert('Success', `Added ₹100 to ${customer.name}'s wallet`);
                  } catch (e: any) {
                    Alert.alert('Error', e.message || 'Failed to top-up wallet');
                  }
                }}
              >
                <Text style={styles.topupBtnText}>+ ₹100</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
        {/* Load More */}
        {totalCustomers !== null && customers.length < totalCustomers && (
          <View style={{ paddingVertical: 16 }}>
            <TouchableOpacity
              disabled={loadingMore}
              style={[styles.filterChip, loadingMore && { opacity: 0.6 }]}
              onPress={() => {
                if (!loadingMore) {
                  setPage(p => p + 1);
                  // After page state update, call loader with append
                  setTimeout(() => {
                    loadCustomers(true);
                  }, 0);
                }
              }}
            >
              <Text style={styles.filterChipText}>{loadingMore ? 'Loading…' : 'Load More'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  const renderDistributors = () => (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active Distributors ({distributors.length})</Text>
          <TouchableOpacity>
            <Text style={styles.linkText}>+ Add New</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.filterRow}>
          <TouchableOpacity style={styles.filterChip}>
            <Text style={styles.filterChipText}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.filterChip, styles.filterChipInactive]}>
            <Text style={styles.filterChipTextInactive}>High Performers</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.filterChip, styles.filterChipInactive]}>
            <Text style={styles.filterChipTextInactive}>Needs Attention</Text>
          </TouchableOpacity>
        </View>
        {distributors.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <Text style={styles.emptyStateIcon}>🚚</Text>
            <Text style={styles.emptyStateTitle}>No Active Distributors</Text>
            <Text style={styles.emptyStateText}>Add distributors to start managing deliveries</Text>
          </View>
        ) : (
          distributors.map((dist) => (
            <TouchableOpacity
              key={dist.id}
              style={styles.listCard}
              onPress={() => {
                navigation.navigate('DistributorDetail', { distributorId: dist.id });
              }}
            >
              <View style={styles.listCardMain}>
                <View style={styles.listCardLeft}>
                  <View style={[styles.avatar, { backgroundColor: '#FF9800' }]}>
                    <Text style={styles.avatarText}>{dist.name.charAt(0)}</Text>
                  </View>
                  <View style={styles.listCardInfo}>
                    <Text style={styles.listCardTitle}>{dist.name}</Text>
                    <Text style={styles.listCardSubtitle}>{dist.phone}</Text>
                    {dist.deliveries > 0 && (
                      <Text style={[styles.listCardSubtitle, { color: theme.colors.success, fontWeight: '600' }]}>
                        ✓ {dist.deliveries} deliveries (7d)
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.ratingBadge}>
                  <Text style={styles.ratingText}>⭐ {dist.rating.toFixed(1)}</Text>
                </View>
              </View>
              <View style={styles.distributorStats}>
                <View style={styles.distributorStatItem}>
                  <Text style={styles.distributorStatValue}>{dist.deliveries}</Text>
                  <Text style={styles.distributorStatLabel}>Last 7d</Text>
                </View>
                <View style={styles.distributorStatItem}>
                  <Text style={styles.distributorStatValue}>{dist.onTime}%</Text>
                  <Text style={styles.distributorStatLabel}>On-time</Text>
                </View>
                <View style={styles.distributorStatItem}>
                  <Text style={[styles.distributorStatValue, { color: theme.colors.success, fontSize: 15 }]}>
                    {formatCurrency(dist.collection)}
                  </Text>
                  <Text style={styles.distributorStatLabel}>Earnings</Text>
                </View>
              </View>
              <View style={styles.listCardFooter}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {dist.zone !== '—' ? `📍 ${dist.zone}` : '📍 No zone'}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: dist.onTime >= 90 ? '#E8F5E9' : '#FFF3E0' }]}>
                  <Text style={[styles.badgeText, { color: dist.onTime >= 90 ? '#4CAF50' : '#FF9800' }]}>
                    {dist.onTime >= 90 ? '✅ Excellent' : '⚠️ Needs Improvement'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  const renderProducts = () => (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Product Catalog</Text>
          <TouchableOpacity onPress={() => navigation.navigate('ProductManagement')}>
            <Text style={styles.linkText}>Manage Products</Text>
          </TouchableOpacity>
        </View>
        {products.map((product) => (
          <TouchableOpacity
            key={product.id}
            style={styles.listCard}
            onPress={() => {
              navigation.navigate('ProductManagement');
            }}
          >
            <View style={styles.listCardMain}>
              <View style={styles.listCardLeft}>
                <View style={[styles.avatar, { backgroundColor: '#4CAF50' }]}>
                  <Text style={styles.avatarText}>🥛</Text>
                </View>
                <View style={styles.listCardInfo}>
                  <Text style={styles.listCardTitle}>{product.name}</Text>
                  <Text style={styles.listCardSubtitle}>{product.brand} • {product.category}</Text>
                </View>
              </View>
              <Text style={styles.productPrice}>{formatCurrency(product.price)}</Text>
            </View>
              <View style={styles.listCardFooter}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Category: {product.category}</Text>
                </View>
              </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  const renderSocieties = () => {
    const filteredSocieties = societies.filter((s) =>
      s.name?.toLowerCase().includes(societySearchQuery.toLowerCase()) ||
      s.developer?.toLowerCase().includes(societySearchQuery.toLowerCase()) ||
      s.area?.toLowerCase().includes(societySearchQuery.toLowerCase())
    );

    if (societiesLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0D9488" />
          <Text style={styles.loadingText}>Loading societies...</Text>
        </View>
      );
    }

    return (
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search societies..."
              placeholderTextColor="#9CA3AF"
              value={societySearchQuery}
              onChangeText={setSocietySearchQuery}
            />
            {societySearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSocietySearchQuery('')}>
                <Text style={styles.clearSearch}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { flex: 1, backgroundColor: '#ECFDF5' }]}>
            <Text style={[styles.statValue, { color: '#059669' }]}>{societies.filter(s => s.is_active !== false).length}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={[styles.statCard, { flex: 1, marginLeft: 12, backgroundColor: '#FEF3C7' }]}>
            <Text style={[styles.statValue, { color: '#D97706' }]}>{societies.filter(s => s.is_active === false).length}</Text>
            <Text style={styles.statLabel}>Inactive</Text>
          </View>
          <View style={[styles.statCard, { flex: 1, marginLeft: 12, backgroundColor: '#F0FDFA' }]}>
            <Text style={[styles.statValue, { color: '#0D9488' }]}>{societies.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
        </View>

        {/* Societies List */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>All Societies</Text>
            <TouchableOpacity 
              style={styles.addButton}
              onPress={() => {
                navigation.navigate('SocietyDetail', { societyId: 'new' });
              }}
            >
              <Text style={styles.addButtonText}>+ Add New</Text>
            </TouchableOpacity>
          </View>

          {filteredSocieties.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🏘️</Text>
              <Text style={styles.emptyTitle}>No Societies Found</Text>
              <Text style={styles.emptySubtitle}>
                {societySearchQuery ? 'Try a different search term' : 'Add your first society to get started'}
              </Text>
            </View>
          ) : (
            filteredSocieties.map((society) => (
              <TouchableOpacity
                key={society.id}
                style={styles.listCard}
                onPress={() => {
                  navigation.navigate('SocietyDetail', { societyId: society.id });
                }}
              >
                <View style={styles.listCardMain}>
                  <View style={styles.listCardLeft}>
                    <View style={[styles.avatar, { backgroundColor: society.is_active !== false ? '#0D9488' : '#9CA3AF' }]}>
                      <Text style={styles.avatarText}>🏢</Text>
                    </View>
                    <View style={styles.listCardInfo}>
                      <Text style={styles.listCardTitle}>{society.name}</Text>
                      <Text style={styles.listCardSubtitle}>
                        {society.developer || 'No Developer'} • {society.area || 'No Area'}
                      </Text>
                    </View>
                  </View>
                  <View style={[
                    styles.statusBadge, 
                    society.is_active !== false ? styles.statusActive : styles.statusPaused
                  ]}>
                    <Text style={styles.statusBadgeText}>
                      {society.is_active !== false ? '✅ Active' : '⏸️ Inactive'}
                    </Text>
                  </View>
                </View>
                <View style={styles.listCardFooter}>
                  {society.city && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>📍 {society.city}</Text>
                    </View>
                  )}
                  {society.pincode && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{society.pincode}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.quickActionsRow}>
                  <TouchableOpacity
                    style={[styles.quickBtn, styles.quickBtnPrimary]}
                    onPress={(e) => {
                      e.stopPropagation();
                      navigation.navigate('SocietyDetail', { societyId: society.id });
                    }}
                  >
                    <Text style={styles.quickBtnText}>View Details</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.quickBtn, society.is_active !== false ? styles.quickBtnWarn : styles.quickBtnSuccess]}
                    onPress={async (e) => {
                      e.stopPropagation();
                      try {
                        const { error } = await supabase
                          .from('societies')
                          .update({ is_active: society.is_active === false })
                          .eq('id', society.id);
                        if (error) throw error;
                        toast.show(
                          society.is_active !== false ? 'Society deactivated' : 'Society activated',
                          { type: 'success' }
                        );
                        await loadSocieties();
                      } catch (err: any) {
                        toast.show(err.message || 'Action failed', { type: 'error' });
                      }
                    }}
                  >
                    <Text style={styles.quickBtnText}>
                      {society.is_active !== false ? 'Deactivate' : 'Activate'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  const renderSubscriptions = () => {
    // Filter subscriptions based on selected filter
    const filteredSubscriptions = subscriptions.filter(sub => {
      if (subscriptionFilter === 'all') return true;
      return sub.status === subscriptionFilter;
    });

    return (
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>All Subscriptions</Text>
          </View>
          
          {/* Filter Chips */}
          <View style={styles.filterRow}>
            {['all', 'active', 'paused', 'cancelled'].map(filter => (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterChip,
                  subscriptionFilter !== filter && styles.filterChipInactive
                ]}
                onPress={() => setSubscriptionFilter(filter as any)}
              >
                <Text style={[
                  styles.filterChipText,
                  subscriptionFilter !== filter && styles.filterChipTextInactive
                ]}>
                  {filter === 'all' 
                    ? `All (${subscriptions.length})`
                    : `${filter.charAt(0).toUpperCase() + filter.slice(1)} (${subscriptions.filter(s => s.status === filter).length})`
                  }
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {filteredSubscriptions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                No {subscriptionFilter === 'all' ? '' : subscriptionFilter} subscriptions found
              </Text>
            </View>
          ) : (
            filteredSubscriptions.map((sub) => (
          <TouchableOpacity
            key={sub.id}
            style={styles.listCard}
            onPress={() => {
              navigation.navigate('SubscriptionDetail', { subscriptionId: sub.id });
            }}
          >
            <View style={styles.listCardMain}>
              <View style={styles.listCardLeft}>
                <View style={styles.listCardInfo}>
                  <Text style={styles.listCardTitle}>{sub.customer}</Text>
                  <Text style={styles.listCardSubtitle}>{sub.product}</Text>
                </View>
              </View>
              <View style={[styles.statusBadge, sub.status === 'active' ? styles.statusActive : styles.statusPaused]}>
                <Text style={styles.statusBadgeText}>
                  {sub.status === 'active' ? '✅' : '⏸️'} {sub.status.toUpperCase()}
                </Text>
              </View>
            </View>
            <View style={styles.listCardFooter}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Qty: {sub.qty}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{sub.frequency}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Next: {sub.nextDelivery}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Wallet: {sub.wallet != null ? formatCurrency(sub.wallet) : '—'}</Text>
              </View>
            </View>
            <View style={styles.quickActionsRow}>
              <TouchableOpacity
                style={[styles.quickBtn, sub.status === 'active' ? styles.quickBtnWarn : styles.quickBtnSuccess]}
                onPress={async () => {
                  try {
                    if (sub.status === 'active') {
                      const today = getLocalDateString();
                      const end = getLocalDateOffsetString(3);
                      // Pause subscription directly
                      const { error } = await supabase
                        .from('subscriptions')
                        .update({ 
                          status: 'paused', 
                          pause_start_date: today, 
                          pause_end_date: end 
                        })
                        .eq('id', sub.id);
                      if (error) throw error;
                      toast.show('Subscription paused', { type: 'success' });
                    } else {
                      // Resume subscription directly
                      const { error } = await supabase
                        .from('subscriptions')
                        .update({ 
                          status: 'active', 
                          pause_start_date: null, 
                          pause_end_date: null 
                        })
                        .eq('id', sub.id);
                      if (error) throw error;
                      toast.show('Subscription resumed', { type: 'success' });
                    }
                    await loadSubscriptions();
                  } catch (e:any) {
                    toast.show(e.message || 'Action failed', { type: 'error' });
                  }
                }}
              >
                <Text style={styles.quickBtnText}>{sub.status === 'active' ? 'Pause 3d' : 'Resume'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.quickBtn, styles.quickBtnPrimary]}
                onPress={() => {
                  setWalletModalCustomerId(sub.customerId);
                  setWalletModalVisible(true);
                }}
              >
                <Text style={styles.quickBtnText}>Top-up ₹</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))
      )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

  const renderAnalytics = () => {
    const screenWidth = Dimensions.get('window').width;
    const revenueData = revenueTrend.map(p => ({ x: p.date, y: p.amount }));
    const deliveryData = deliveryPerf.map(d => ({ x: d.status, y: d.count }));
    const customerGrowthData = customerGrowth.map(g => ({ x: g.label, y: g.count }));
    const productData = productPopularity.map(p => ({ x: p.name, y: p.units }));

    return (
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Revenue Trend */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Revenue Trend (Last 7 Days)</Text>
          <View style={styles.chartContainer}>
            {analyticsLoading && revenueData.length === 0 ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : (
              <>
                <VictoryChart
                  theme={VictoryTheme.material}
                  width={screenWidth - 48}
                  height={250}
                  padding={{ top: 20, bottom: 50, left: 60, right: 20 }}
                >
                  <VictoryAxis
                    style={{
                      axis: { stroke: '#E0E0E0' },
                      tickLabels: { fontSize: 10, fill: '#666' },
                    }}
                  />
                  <VictoryAxis
                    dependentAxis
                    tickFormat={(t) => `₹${Math.round(t / 1000)}k`}
                    style={{
                      axis: { stroke: '#E0E0E0' },
                      tickLabels: { fontSize: 10, fill: '#666' },
                      grid: { stroke: '#F0F0F0', strokeDasharray: '5,5' },
                    }}
                  />
                  <VictoryLine
                    data={revenueData}
                    style={{ data: { stroke: theme.colors.primary, strokeWidth: 3 } }}
                    animate={{ duration: 800, onLoad: { duration: 400 } }}
                  />
                </VictoryChart>
                <Text style={styles.chartCaption}>
                  Total: {formatCurrency(revenueData.reduce((sum, d) => sum + d.y, 0))}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Delivery Performance */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Performance</Text>
          <View style={styles.chartContainer}>
            {analyticsLoading && deliveryData.length === 0 ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : (
              <>
                <VictoryPie
                  data={deliveryData}
                  width={screenWidth - 48}
                  height={300}
                  colorScale={['#4CAF50', '#FFC107', '#F44336']}
                  style={{ labels: { fontSize: 12, fill: '#666' } }}
                  labelRadius={100}
                  animate={{ duration: 800, onLoad: { duration: 400 } }}
                />
                <View style={styles.legendContainer}>
                  {deliveryData.map((item, index) => (
                    <View key={index} style={styles.legendItem}>
                      <View
                        style={[
                          styles.legendColor,
                          { backgroundColor: ['#4CAF50', '#FFC107', '#F44336'][index] },
                        ]}
                      />
                      <Text style={styles.legendText}>
                        {item.x}: {item.y}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        </View>

        {/* Customer Growth */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer Growth (Monthly)</Text>
          <View style={styles.chartContainer}>
            {analyticsLoading && customerGrowthData.length === 0 ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : (
              <>
                <VictoryChart
                  theme={VictoryTheme.material}
                  width={screenWidth - 48}
                  height={250}
                  padding={{ top: 20, bottom: 50, left: 50, right: 20 }}
                >
                  <VictoryAxis
                    style={{ axis: { stroke: '#E0E0E0' }, tickLabels: { fontSize: 10, fill: '#666' } }}
                  />
                  <VictoryAxis
                    dependentAxis
                    style={{
                      axis: { stroke: '#E0E0E0' },
                      tickLabels: { fontSize: 10, fill: '#666' },
                      grid: { stroke: '#F0F0F0', strokeDasharray: '5,5' },
                    }}
                  />
                  <VictoryLine
                    data={customerGrowthData}
                    style={{ data: { stroke: '#2196F3', strokeWidth: 3 } }}
                    animate={{ duration: 800, onLoad: { duration: 400 } }}
                  />
                </VictoryChart>
                <Text style={styles.chartCaption}>
                  Total: {customerGrowthData.reduce((sum, d) => sum + d.y, 0)} customers
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Product Popularity */}
        {productData.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Products (This Month)</Text>
            <View style={styles.chartContainer}>
              {analyticsLoading && productData.length === 0 ? (
                <ActivityIndicator color={theme.colors.primary} />
              ) : (
                <>
                  <VictoryChart
                    theme={VictoryTheme.material}
                    width={screenWidth - 48}
                    height={250}
                    domainPadding={{ x: 30 }}
                    padding={{ top: 20, bottom: 80, left: 50, right: 20 }}
                  >
                    <VictoryAxis
                      style={{
                        axis: { stroke: '#E0E0E0' },
                        tickLabels: { fontSize: 9, fill: '#666', angle: -45, textAnchor: 'end' },
                      }}
                    />
                    <VictoryAxis
                      dependentAxis
                      style={{
                        axis: { stroke: '#E0E0E0' },
                        tickLabels: { fontSize: 10, fill: '#666' },
                        grid: { stroke: '#F0F0F0', strokeDasharray: '5,5' },
                      }}
                    />
                    <VictoryBar
                      data={productData}
                      style={{ data: { fill: theme.colors.primary } }}
                      animate={{ duration: 800, onLoad: { duration: 400 } }}
                    />
                  </VictoryChart>
                  <Text style={styles.chartCaption}>Total Sales: {productData.reduce((sum, d) => sum + d.y, 0)} units</Text>
                </>
              )}
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  const renderSettings = () => (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Business Settings</Text>
        <View style={styles.settingsCard}>
          <TouchableOpacity style={styles.settingsItem}>
            <Text style={styles.settingsItemIcon}>🏢</Text>
            <View style={styles.settingsItemInfo}>
              <Text style={styles.settingsItemTitle}>Company Information</Text>
              <Text style={styles.settingsItemSubtitle}>Update business details</Text>
            </View>
            <Text style={styles.settingsItemArrow}>›</Text>
          </TouchableOpacity>
          <View style={styles.settingsDivider} />
          <TouchableOpacity style={styles.settingsItem}>
            <Text style={styles.settingsItemIcon}>💰</Text>
            <View style={styles.settingsItemInfo}>
              <Text style={styles.settingsItemTitle}>Pricing Rules</Text>
              <Text style={styles.settingsItemSubtitle}>Delivery charges, minimum balance</Text>
            </View>
            <Text style={styles.settingsItemArrow}>›</Text>
          </TouchableOpacity>
          <View style={styles.settingsDivider} />
          <TouchableOpacity style={styles.settingsItem}>
            <Text style={styles.settingsItemIcon}>📍</Text>
            <View style={styles.settingsItemInfo}>
              <Text style={styles.settingsItemTitle}>Delivery Zones</Text>
              <Text style={styles.settingsItemSubtitle}>Manage service areas</Text>
            </View>
            <Text style={styles.settingsItemArrow}>›</Text>
          </TouchableOpacity>
          <View style={styles.settingsDivider} />
          <TouchableOpacity style={styles.settingsItem}>
            <Text style={styles.settingsItemIcon}>🔔</Text>
            <View style={styles.settingsItemInfo}>
              <Text style={styles.settingsItemTitle}>Notification Templates</Text>
              <Text style={styles.settingsItemSubtitle}>Customize notifications</Text>
            </View>
            <Text style={styles.settingsItemArrow}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Access Control</Text>
        <View style={styles.settingsCard}>
          <TouchableOpacity 
            style={styles.settingsItem}
            onPress={() => navigation.navigate('ActivationCodes')}
          >
            <Text style={styles.settingsItemIcon}>🎫</Text>
            <View style={styles.settingsItemInfo}>
              <Text style={styles.settingsItemTitle}>Distributor Activation Codes</Text>
              <Text style={styles.settingsItemSubtitle}>Generate and manage registration codes</Text>
            </View>
            <Text style={styles.settingsItemArrow}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return renderDashboard();
      case 'customers':
        return renderCustomers();
      case 'distributors':
        return renderDistributors();
      case 'products':
        return renderProducts();
      case 'societies':
        return renderSocieties();
      case 'subscriptions':
        return renderSubscriptions();
      case 'stock':
        // Stock screen is a separate navigation - handled by tab press
        return renderDashboard();
      case 'analytics':
        return renderAnalytics();
      case 'settings':
        return renderSettings();
      default:
        return renderDashboard();
    }
  };

  return (
    <AppLayout>
      <AppBar
        title="Admin Dashboard"
        subtitle={user?.name || 'Administrator'}
        variant="surface"
        actions={[{ label: 'Logout', icon: '🚪', onPress: handleLogout }]}
      />

      {/* Tab Navigation */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
      >
        {[
          { id: 'dashboard', icon: '📊', label: 'Dashboard' },
          { id: 'customers', icon: '👥', label: 'Customers' },
          { id: 'distributors', icon: '🚚', label: 'Distributors' },
          { id: 'products', icon: '🥛', label: 'Products' },
          { id: 'societies', icon: '🏘️', label: 'Societies' },
          { id: 'subscriptions', icon: '📋', label: 'Subscriptions' },
          { id: 'stock', icon: '📦', label: 'Stock' },
          { id: 'support', icon: '🎧', label: 'Support' },
          { id: 'analytics', icon: '📈', label: 'Analytics' },
          { id: 'settings', icon: '⚙️', label: 'Settings' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => {
              if (tab.id === 'stock') {
                navigation.navigate('StockManagement');
              } else if (tab.id === 'support') {
                navigation.navigate('AdminSupport');
              } else {
                setActiveTab(tab.id as AdminTab);
              }
            }}
          >
            <Text style={styles.tabIcon}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tab Content */}
      {renderTabContent()}

      {/* Wallet Recharge Modal */}
      <Modal visible={walletModalVisible} animationType="fade" transparent>
        <Pressable style={styles.modalOverlay} onPress={() => setWalletModalVisible(false)}>
          <Pressable style={[styles.modalContent,{maxHeight:'70%'}]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Wallet Recharge</Text>
              <TouchableOpacity onPress={() => setWalletModalVisible(false)}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
            </View>
            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Amount (₹)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={walletAmount}
                onChangeText={setWalletAmount}
                placeholder="e.g. 200"
              />
              <Text style={[styles.modalSectionTitle,{marginTop:16}]}>Note</Text>
              <TextInput
                style={[styles.input,{height:80,textAlignVertical:'top'}]}
                multiline
                value={walletNote}
                onChangeText={setWalletNote}
                placeholder="Reason for recharge"
              />
              <TouchableOpacity
                style={[styles.modalButton, styles.quickBtnPrimary]}
                onPress={async () => {
                  try {
                    const amt = parseFloat(walletAmount);
                    if (isNaN(amt) || amt <= 0) {
                      toast.show('Enter valid amount', { type: 'error' });
                      return;
                    }
                    if (!walletModalCustomerId) return;
                    await CustomerAdminService.adjustWallet(walletModalCustomerId, amt, walletNote);
                    toast.show('Wallet updated', { type: 'success' });
                    setWalletModalVisible(false);
                    await loadSubscriptions();
                    await loadCustomers();
                  } catch (e:any) {
                    toast.show(e.message || 'Recharge failed', { type: 'error' });
                  }
                }}
              >
                <Text style={[styles.modalButtonText,{color:theme.colors.primary}]}>Add Funds</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </AppLayout>
  );
};

// Sparkline helper (Unicode blocks) - lean inline implementation
const makeSparkline = (values: number[]) => {
  if (!values.length) return '';
  const blocks = ['▁','▂','▃','▄','▅','▆','▇'];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map(v => blocks[Math.min(blocks.length-1, Math.floor(((v - min) / range) * (blocks.length-1)))]).join('');
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  // Header styles replaced by AppBar component
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 0,
    maxHeight: 60,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  tabBarContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#0D9488',
  },
  tabIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  // Tracker Card Styles (Revenue & Delivery)
  trackerCard: {
    borderRadius: 24,
    padding: 24,
    marginTop: 4,
  },
  trackerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  trackerLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
    marginBottom: 4,
  },
  trackerValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  trackerBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackerBadgeText: {
    fontSize: 24,
  },
  trackerDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginVertical: 20,
  },
  trackerStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  trackerStatItem: {
    alignItems: 'center',
  },
  trackerStatValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  trackerStatLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  trackerStatDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressContainer: {
    marginTop: 20,
  },
  progressBar: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'right',
    marginTop: 8,
    fontWeight: '600',
  },
  // Quick Stats Row
  quickStatsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  quickStatCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  quickStatIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  quickStatValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  quickStatLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  // Revenue Card
  revenueCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  revenueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  revenueLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
    marginBottom: 4,
  },
  revenueValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: -0.5,
  },
  revenueTrendBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  revenueTrendText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },
  // Quick Actions Grid
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickActionCard: {
    width: '31%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  quickActionEmoji: {
    fontSize: 22,
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
    textAlign: 'center',
  },
  // Generate Button
  generateButton: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  generateButtonIcon: {
    fontSize: 18,
  },
  generateButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7C3AED',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 0,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  metricIcon: {
    fontSize: 32,
    marginBottom: 12,
    textAlign: 'center',
  },
  metricValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    fontWeight: '500',
  },
  statsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  statLabel: {
    fontSize: 15,
    color: '#1E293B',
    fontWeight: '500',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  statDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  alertCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  alertIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  alertIcon: {
    fontSize: 24,
  },
  alertInfo: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  alertText: {
    fontSize: 14,
    color: '#64748B',
  },
  alertArrow: {
    fontSize: 24,
    color: '#94A3B8',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  // legacy quick action styles now unused (replaced by QuickActionCard)
  actionCard: {},
  actionIconContainer: {},
  actionIcon: {},
  actionLabel: {},
  searchSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  searchBar: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1E293B',
  },
  filterRow: {
    flexDirection: 'row',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 0,
  },
  filterChipInactive: {
    backgroundColor: '#F1F5F9',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  filterChipTextInactive: {
    color: '#64748B',
  },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  listCardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  listCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  listCardInfo: {
    flex: 1,
  },
  listCardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  listCardSubtitle: {
    fontSize: 14,
    color: '#64748B',
  },
  listCardArrow: {
    fontSize: 24,
    color: '#94A3B8',
    marginLeft: 8,
  },
  listCardFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  badge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  badgeWarning: {
    backgroundColor: '#FEF3C7',
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  badgeTextWarning: {
    color: '#D97706',
  },
  ratingBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#D97706',
  },
  distributorStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 16,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 4,
    marginBottom: 12,
  },
  distributorStatItem: {
    alignItems: 'center',
  },
  distributorStatValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 4,
  },
  distributorStatLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  productPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#10B981',
  },
  statusBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  statusActive: {
    backgroundColor: '#D1FAE5',
  },
  statusPaused: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  chartPlaceholder: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  chartContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  chartCaption: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '600',
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 16,
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '500',
  },
  chartPlaceholderText: {
    fontSize: 64,
    marginBottom: 16,
  },
  chartPlaceholderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 8,
  },
  chartPlaceholderSubtitle: {
    fontSize: 14,
    color: '#64748B',
  },
  globalSearchBar: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  globalSearchInput: {
    fontSize: 15,
    color: '#1E293B',
  },
  globalResults: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  globalResultsHeader: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
    color: '#1E293B',
  },
  globalResultItem: {
    fontSize: 14,
    paddingVertical: 8,
    color: '#64748B',
  },
  globalResultsLoading: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#64748B',
  },
  clearBtn: {
    marginLeft: 10,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  clearBtnText: {
    fontSize: 14,
    color: '#64748B',
  },
  settingsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  settingsItemIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  settingsItemInfo: {
    flex: 1,
  },
  settingsItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
  },
  settingsItemSubtitle: {
    fontSize: 14,
    color: '#64748B',
  },
  settingsItemArrow: {
    fontSize: 24,
    color: '#94A3B8',
  },
  settingsDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginHorizontal: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '80%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1E293B',
    letterSpacing: -0.3,
  },
  modalClose: {
    fontSize: 24,
    color: '#64748B',
  },
  modalSection: {
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalSectionTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 16,
  },
  modalText: {
    fontSize: 15,
    color: '#1E293B',
    marginBottom: 10,
  },
  modalButton: {
    backgroundColor: '#F1F5F9',
    padding: 18,
    borderRadius: 14,
    marginBottom: 12,
  },
  modalButtonDanger: {
    backgroundColor: '#FEE2E2',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    textAlign: 'center',
  },
  modalButtonTextDanger: {
    color: '#DC2626',
  },
  quickActionsRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  quickBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  quickBtnPrimary: { backgroundColor: '#EDE9FE' },
  quickBtnWarn: { backgroundColor: '#FEF3C7' },
  quickBtnSuccess: { backgroundColor: '#D1FAE5' },
  quickBtnText: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1E293B',
    marginTop: 8,
  },
  errorBanner: {
    marginTop: 16,
    marginHorizontal: 20,
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorBannerSmall: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  errorBannerText: {
    color: '#DC2626',
    fontSize: 14,
    flex: 1,
  },
  errorBannerAction: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 12,
  },
  topupBtn: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  topupBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
  },
  emptyStateContainer: {
    padding: 48,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
  },
  // New styles for societies
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#64748B',
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  clearSearch: {
    fontSize: 18,
    color: '#9CA3AF',
    padding: 4,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 8,
  },
  statCard: {
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
  addButton: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    marginTop: 16,
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
  },
});
