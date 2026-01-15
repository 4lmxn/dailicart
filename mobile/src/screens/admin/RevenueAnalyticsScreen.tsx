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
import { AppLayout } from '../../components/AppLayout';
import { AppBar } from '../../components/AppBar';
import { Skeleton } from '../../components/Skeleton';
import { supabase } from '../../services/supabase';
import { formatCurrency } from '../../utils/helpers';
import { theme } from '../../theme';
import type { AdminScreenProps } from '../../navigation/types';

const { width } = Dimensions.get('window');

interface RevenueData {
  totalRevenue: number;
  totalOrders: number;
  totalUnits: number;
  avgOrderValue: number;
  deliveredRevenue: number;
  pendingRevenue: number;
}

interface DailyRevenue {
  date: string;
  revenue: number;
  orders: number;
  delivered: number;
  pending: number;
}

interface TopProduct {
  id: string;
  name: string;
  revenue: number;
  orders: number;
  quantity: number;
}

interface SocietyStat {
  id: string;
  name: string;
  revenue: number;
  orders: number;
  delivered: number;
  pending: number;
}

interface DailyRevenueWithSocieties extends DailyRevenue {
  societies: SocietyStat[];
}

interface OrderDetail {
  id: string;
  deliveryDate: string;
  status: string;
  totalAmount: number;
  quantity: number;
  productName: string;
  customerName: string;
  societyName: string;
  unit: string;
  deliveredAt: string | null;
}

export const RevenueAnalyticsScreen = ({ navigation }: AdminScreenProps<'RevenueAnalytics'>) => {
  const [data, setData] = useState<RevenueData | null>(null);
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenueWithSocieties[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [orderDetails, setOrderDetails] = useState<OrderDetail[]>([]);
  const [ordersTab, setOrdersTab] = useState<'pending' | 'delivered'>('pending');

  useEffect(() => {
    loadData();
  }, [period]);

  const loadData = async () => {
    if (!loading) setLoading(true);

    const today = new Date().toISOString().split('T')[0];
    let startDate = today;
    let days = 1;

    if (period === 'week') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      startDate = d.toISOString().split('T')[0];
      days = 7;
    } else if (period === 'month') {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      startDate = d.toISOString().split('T')[0];
      days = 30;
    }

    try {
      // Fetch orders for the period with address/society info and user details
      const { data: orders } = await supabase
        .from('orders')
        .select(`
          id, 
          delivery_date, 
          status, 
          total_amount, 
          quantity, 
          product_id,
          delivered_at,
          products(id, name, unit),
          user_id,
          users!orders_user_id_fkey(id, name),
          address_id,
          addresses!orders_address_id_fkey(id, society_id, societies(id, name))
        `)
        .gte('delivery_date', startDate)
        .lte('delivery_date', today)
        .order('delivery_date', { ascending: false });

      const allOrders = orders || [];
      const deliveredOrders = allOrders.filter(o => o.status === 'delivered');
      const pendingOrders = allOrders.filter(o => ['scheduled', 'pending', 'assigned', 'in_transit'].includes(o.status));

      const totalRevenue = allOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
      const deliveredRevenue = deliveredOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
      const pendingRevenue = pendingOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
      const totalUnits = allOrders.reduce((sum, o) => sum + (o.quantity || 0), 0);

      setData({
        totalRevenue,
        totalOrders: allOrders.length,
        totalUnits,
        avgOrderValue: allOrders.length > 0 ? totalRevenue / allOrders.length : 0,
        deliveredRevenue,
        pendingRevenue,
      });

      // Daily breakdown with society stats
      const dailyMap = new Map<string, DailyRevenueWithSocieties>();
      for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - (days - 1 - i));
        const dateStr = d.toISOString().split('T')[0];
        dailyMap.set(dateStr, { date: dateStr, revenue: 0, orders: 0, delivered: 0, pending: 0, societies: [] });
      }

      // Track societies per day
      const dailySocietyMap = new Map<string, Map<string, SocietyStat>>();

      allOrders.forEach(order => {
        const existing = dailyMap.get(order.delivery_date);
        if (existing) {
          existing.revenue += order.total_amount || 0;
          existing.orders += 1;
          if (order.status === 'delivered') existing.delivered += 1;
          else if (['scheduled', 'pending', 'assigned', 'in_transit'].includes(order.status)) existing.pending += 1;

          // Extract society info
          const address = order.addresses as any;
          const society = address?.societies as any;
          if (society?.id) {
            if (!dailySocietyMap.has(order.delivery_date)) {
              dailySocietyMap.set(order.delivery_date, new Map());
            }
            const societiesForDay = dailySocietyMap.get(order.delivery_date)!;
            const existingSociety = societiesForDay.get(society.id) || {
              id: society.id,
              name: society.name || 'Unknown Society',
              revenue: 0,
              orders: 0,
              delivered: 0,
              pending: 0,
            };
            existingSociety.revenue += order.total_amount || 0;
            existingSociety.orders += 1;
            if (order.status === 'delivered') existingSociety.delivered += 1;
            else if (['scheduled', 'pending', 'assigned', 'in_transit'].includes(order.status)) existingSociety.pending += 1;
            societiesForDay.set(society.id, existingSociety);
          }
        }
      });

      // Attach society stats to daily entries
      dailyMap.forEach((dayData, dateStr) => {
        const societiesForDay = dailySocietyMap.get(dateStr);
        if (societiesForDay) {
          dayData.societies = Array.from(societiesForDay.values()).sort((a, b) => b.revenue - a.revenue);
        }
      });

      setDailyRevenue(Array.from(dailyMap.values()));

      // Extract order details for display
      const ordersList: OrderDetail[] = allOrders.map(order => {
        const product = order.products as any;
        const user = order.users as any;
        const address = order.addresses as any;
        const society = address?.societies as any;
        
        return {
          id: order.id,
          deliveryDate: order.delivery_date,
          status: order.status,
          totalAmount: order.total_amount || 0,
          quantity: order.quantity || 1,
          productName: product?.name || 'Unknown Product',
          customerName: user?.name || 'Unknown Customer',
          societyName: society?.name || 'Unknown',
          unit: product?.unit || 'unit',
          deliveredAt: order.delivered_at || null,
        };
      });
      setOrderDetails(ordersList);

      // Top products by revenue
      const productMap = new Map<string, TopProduct>();
      allOrders.forEach(order => {
        const product = order.products as any;
        if (!product?.id) return;
        const existing = productMap.get(product.id) || {
          id: product.id,
          name: product.name || 'Unknown',
          revenue: 0,
          orders: 0,
          quantity: 0,
        };
        existing.revenue += order.total_amount || 0;
        existing.orders += 1;
        existing.quantity += order.quantity || 0;
        productMap.set(product.id, existing);
      });

      const sorted = Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue);
      setTopProducts(sorted.slice(0, 5));

    } catch (e) {
      console.error('Error loading revenue analytics:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const formatShortDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const maxRevenue = Math.max(...dailyRevenue.map(d => d.revenue), 1);

  const toggleDayExpanded = (date: string) => {
    setExpandedDays(prev => {
      const newSet = new Set(prev);
      if (newSet.has(date)) {
        newSet.delete(date);
      } else {
        newSet.add(date);
      }
      return newSet;
    });
  };

  const getPeriodLabel = () => {
    switch (period) {
      case 'today': return "Today's";
      case 'week': return "This Week's";
      case 'month': return "This Month's";
    }
  };

  if (loading && !refreshing) {
    return (
      <AppLayout>
        <AppBar title="Revenue Analytics" onBack={() => navigation.goBack()} variant="surface" />
        <ScrollView style={styles.content} contentContainerStyle={{ padding: 16 }}>
          <Skeleton height={200} width="100%" radius={24} style={{ marginBottom: 20 }} />
          <Skeleton height={56} width="100%" radius={16} style={{ marginBottom: 16 }} />
          <Skeleton height={220} width="100%" radius={20} style={{ marginBottom: 20 }} />
          <Skeleton height={180} width="100%" radius={16} style={{ marginBottom: 16 }} />
          <Skeleton height={160} width="100%" radius={16} />
        </ScrollView>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <AppBar title="Revenue Analytics" onBack={() => navigation.goBack()} variant="surface" />

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />
        }
      >
        {/* Main Revenue Card */}
        <LinearGradient
          colors={['#7C3AED', '#9333EA']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.mainCard}
        >
          <View style={styles.mainCardHeader}>
            <Text style={styles.mainCardLabel}>{getPeriodLabel()} Collected Revenue</Text>
            <View style={styles.mainCardBadge}>
              <Text style={styles.mainCardBadgeText}>💰</Text>
            </View>
          </View>
          <Text style={styles.mainCardAmount}>
            {formatCurrency(data?.deliveredRevenue || 0)}
          </Text>
          <View style={styles.mainCardStatsRow}>
            <View style={styles.mainCardStat}>
              <Text style={styles.mainCardStatValue}>{data?.totalOrders || 0}</Text>
              <Text style={styles.mainCardStatLabel}>Orders</Text>
            </View>
            <View style={styles.mainCardStatDivider} />
            <View style={styles.mainCardStat}>
              <Text style={styles.mainCardStatValue}>{data?.totalUnits || 0}</Text>
              <Text style={styles.mainCardStatLabel}>Units</Text>
            </View>
            <View style={styles.mainCardStatDivider} />
            <View style={styles.mainCardStat}>
              <Text style={styles.mainCardStatValue}>{formatCurrency(data?.avgOrderValue || 0)}</Text>
              <Text style={styles.mainCardStatLabel}>Avg/Order</Text>
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

        {/* Revenue Breakdown Cards */}
        <View style={styles.breakdownRow}>
          <View style={[styles.breakdownCard, { backgroundColor: '#ECFDF5' }]}>
            <View style={[styles.breakdownIcon, { backgroundColor: '#D1FAE5' }]}>
              <Text style={styles.breakdownIconText}>✅</Text>
            </View>
            <Text style={[styles.breakdownValue, { color: '#059669' }]}>
              {formatCurrency(data?.deliveredRevenue || 0)}
            </Text>
            <Text style={styles.breakdownLabel}>Collected</Text>
          </View>
          <View style={[styles.breakdownCard, { backgroundColor: '#FEF3C7' }]}>
            <View style={[styles.breakdownIcon, { backgroundColor: '#FDE68A' }]}>
              <Text style={styles.breakdownIconText}>⏳</Text>
            </View>
            <Text style={[styles.breakdownValue, { color: '#D97706' }]}>
              {formatCurrency(data?.pendingRevenue || 0)}
            </Text>
            <Text style={styles.breakdownLabel}>Pending</Text>
          </View>
        </View>

        {/* Daily Chart */}
        {period !== 'today' && dailyRevenue.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Daily Revenue</Text>
            <View style={styles.chartContainer}>
              {dailyRevenue.slice(-7).map((day) => (
                <View key={day.date} style={styles.chartBarContainer}>
                  <View style={styles.chartBarWrapper}>
                    <View
                      style={[
                        styles.chartBar,
                        {
                          height: `${Math.max((day.revenue / maxRevenue) * 100, 5)}%`,
                          backgroundColor: day.revenue > 0 ? '#7C3AED' : '#E2E8F0',
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.chartBarLabel}>
                    {formatShortDate(day.date).split(' ')[0]}
                  </Text>
                  <Text style={styles.chartBarValue}>
                    {day.revenue > 0 ? `₹${Math.round(day.revenue)}` : '-'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Top Products */}
        {topProducts.length > 0 && (
          <View style={styles.topProductsCard}>
            <Text style={styles.topProductsTitle}>🏆 Top Products</Text>
            {topProducts.map((product, index) => (
              <View key={product.id} style={styles.topProductItem}>
                <View style={styles.topProductLeft}>
                  <View style={[styles.topProductRank, { backgroundColor: index === 0 ? '#FEF3C7' : index === 1 ? '#F1F5F9' : index === 2 ? '#FED7AA' : '#F8FAFC' }]}>
                    <Text style={styles.topProductRankText}>{index + 1}</Text>
                  </View>
                  <View>
                    <Text style={styles.topProductName}>{product.name}</Text>
                    <Text style={styles.topProductMeta}>{product.orders} orders • {product.quantity} units</Text>
                  </View>
                </View>
                <Text style={styles.topProductRevenue}>{formatCurrency(product.revenue)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Recent Days List - Expandable */}
        {period !== 'today' && (
          <View style={styles.recentSection}>
            <Text style={styles.recentTitle}>Daily Summary</Text>
            <Text style={styles.recentSubtitle}>Tap a day to see society breakdown</Text>
            {dailyRevenue.slice().reverse().slice(0, 7).map((day) => {
              const isExpanded = expandedDays.has(day.date);
              const hasSocieties = day.societies && day.societies.length > 0;
              
              return (
                <View key={day.date}>
                  <TouchableOpacity 
                    style={[styles.recentItem, isExpanded && styles.recentItemExpanded]}
                    onPress={() => hasSocieties && toggleDayExpanded(day.date)}
                    activeOpacity={hasSocieties ? 0.7 : 1}
                  >
                    <View style={styles.recentLeft}>
                      <View style={[styles.recentDot, { backgroundColor: day.revenue > 0 ? '#7C3AED' : '#CBD5E1' }]} />
                      <View>
                        <Text style={styles.recentDate}>{formatShortDate(day.date)}</Text>
                        <Text style={styles.recentOrders}>
                          {day.orders > 0 ? `${day.delivered} delivered • ${day.pending} pending` : 'No orders'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.recentRight}>
                      <Text style={[styles.recentAmount, { color: day.revenue > 0 ? '#7C3AED' : '#94A3B8' }]}>
                        {day.revenue > 0 ? formatCurrency(day.revenue) : '-'}
                      </Text>
                      {hasSocieties && (
                        <Text style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                  
                  {/* Expanded Society Stats */}
                  {isExpanded && hasSocieties && (
                    <View style={styles.societyBreakdown}>
                      {day.societies.map((society, idx) => (
                        <View key={society.id} style={[styles.societyItem, idx === day.societies.length - 1 && { borderBottomWidth: 0 }]}>
                          <View style={styles.societyLeft}>
                            <View style={styles.societyIcon}>
                              <Text style={styles.societyIconText}>🏢</Text>
                            </View>
                            <View style={styles.societyInfo}>
                              <Text style={styles.societyName} numberOfLines={1}>{society.name}</Text>
                              <Text style={styles.societyMeta}>
                                {society.orders} order{society.orders !== 1 ? 's' : ''} • {society.delivered} ✓
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.societyRevenue}>{formatCurrency(society.revenue)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Detailed Orders Section */}
        {orderDetails.length > 0 && (
          <View style={styles.ordersSection}>
            <Text style={styles.ordersSectionTitle}>📋 Order Details</Text>
            
            {/* Tab Switcher */}
            <View style={styles.ordersTabContainer}>
              <TouchableOpacity
                style={[styles.ordersTab, ordersTab === 'pending' && styles.ordersTabActive]}
                onPress={() => setOrdersTab('pending')}
              >
                <View style={[styles.ordersTabDot, { backgroundColor: '#F59E0B' }]} />
                <Text style={[styles.ordersTabText, ordersTab === 'pending' && styles.ordersTabTextActive]}>
                  Pending ({orderDetails.filter(o => ['scheduled', 'pending', 'assigned', 'in_transit'].includes(o.status)).length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ordersTab, ordersTab === 'delivered' && styles.ordersTabActive]}
                onPress={() => setOrdersTab('delivered')}
              >
                <View style={[styles.ordersTabDot, { backgroundColor: '#10B981' }]} />
                <Text style={[styles.ordersTabText, ordersTab === 'delivered' && styles.ordersTabTextActive]}>
                  Delivered ({orderDetails.filter(o => o.status === 'delivered').length})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Orders List */}
            <View style={styles.ordersList}>
              {orderDetails
                .filter(order => ordersTab === 'pending' 
                  ? ['scheduled', 'pending', 'assigned', 'in_transit'].includes(order.status)
                  : order.status === 'delivered'
                )
                .slice(0, 15)
                .map((order, idx) => (
                  <View key={order.id} style={[styles.orderItem, idx === 0 && { borderTopWidth: 0 }]}>
                    <View style={styles.orderItemLeft}>
                      <View style={[styles.orderStatusDot, { 
                        backgroundColor: order.status === 'delivered' ? '#10B981' 
                          : order.status === 'in_transit' ? '#3B82F6'
                          : order.status === 'assigned' ? '#8B5CF6'
                          : '#F59E0B' 
                      }]} />
                      <View style={styles.orderItemInfo}>
                        <Text style={styles.orderCustomerName} numberOfLines={1}>{order.customerName}</Text>
                        <Text style={styles.orderProductInfo}>
                          {order.quantity} × {order.productName} ({order.unit})
                        </Text>
                        <View style={styles.orderMetaRow}>
                          <Text style={styles.orderSociety}>🏢 {order.societyName}</Text>
                          <Text style={styles.orderDate}>
                            {formatShortDate(order.deliveryDate)}
                            {order.status === 'delivered' && order.deliveredAt && (
                              ` • ${new Date(order.deliveredAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}`
                            )}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.orderItemRight}>
                      <Text style={styles.orderAmount}>{formatCurrency(order.totalAmount)}</Text>
                      <View style={[styles.orderStatusBadge, {
                        backgroundColor: order.status === 'delivered' ? '#D1FAE5' 
                          : order.status === 'in_transit' ? '#DBEAFE'
                          : order.status === 'assigned' ? '#EDE9FE'
                          : '#FEF3C7'
                      }]}>
                        <Text style={[styles.orderStatusText, {
                          color: order.status === 'delivered' ? '#059669' 
                            : order.status === 'in_transit' ? '#2563EB'
                            : order.status === 'assigned' ? '#7C3AED'
                            : '#D97706'
                        }]}>
                          {order.status === 'in_transit' ? 'In Transit' : order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              
              {orderDetails.filter(order => ordersTab === 'pending' 
                ? ['scheduled', 'pending', 'assigned', 'in_transit'].includes(order.status)
                : order.status === 'delivered'
              ).length === 0 && (
                <View style={styles.noOrdersState}>
                  <Text style={styles.noOrdersIcon}>{ordersTab === 'pending' ? '✅' : '📭'}</Text>
                  <Text style={styles.noOrdersText}>
                    {ordersTab === 'pending' ? 'All orders delivered!' : 'No delivered orders yet'}
                  </Text>
                </View>
              )}

              {orderDetails.filter(order => ordersTab === 'pending' 
                ? ['scheduled', 'pending', 'assigned', 'in_transit'].includes(order.status)
                : order.status === 'delivered'
              ).length > 15 && (
                <Text style={styles.moreOrdersText}>
                  +{orderDetails.filter(order => ordersTab === 'pending' 
                    ? ['scheduled', 'pending', 'assigned', 'in_transit'].includes(order.status)
                    : order.status === 'delivered'
                  ).length - 15} more orders
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Empty State for Today */}
        {period === 'today' && (data?.totalOrders || 0) === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTitle}>No Orders Today</Text>
            <Text style={styles.emptySubtitle}>
              Today's orders will appear here as they come in.
            </Text>
          </View>
        )}
      </ScrollView>
    </AppLayout>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  // Main Revenue Card
  mainCard: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  mainCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  mainCardLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  mainCardBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainCardBadgeText: {
    fontSize: 22,
  },
  mainCardAmount: {
    fontSize: 42,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 20,
    letterSpacing: -1,
  },
  mainCardStatsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    padding: 16,
  },
  mainCardStat: {
    flex: 1,
    alignItems: 'center',
  },
  mainCardStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  mainCardStatLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  mainCardStatDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 8,
  },
  // Period Selector
  periodContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 6,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
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
    backgroundColor: '#7C3AED',
  },
  periodText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  periodTextActive: {
    color: '#FFFFFF',
  },
  // Breakdown Cards
  breakdownRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  breakdownCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  breakdownIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  breakdownIconText: {
    fontSize: 20,
  },
  breakdownValue: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  breakdownLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  // Chart
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
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
    marginHorizontal: 4,
  },
  chartBarWrapper: {
    height: 100,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  chartBar: {
    width: '80%',
    borderRadius: 6,
    minHeight: 4,
  },
  chartBarLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 8,
    fontWeight: '500',
  },
  chartBarValue: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '600',
  },
  // Top Products
  topProductsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  topProductsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 16,
  },
  topProductItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  topProductLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  topProductRank: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  topProductRankText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  topProductName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
  },
  topProductMeta: {
    fontSize: 12,
    color: '#64748B',
  },
  topProductRevenue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#7C3AED',
  },
  // Recent Section
  recentSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  recentTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  recentSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 16,
  },
  recentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  recentItemExpanded: {
    backgroundColor: '#F8FAFC',
    marginHorizontal: -20,
    paddingHorizontal: 20,
    borderBottomWidth: 0,
  },
  recentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  recentRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 14,
  },
  recentDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
  },
  recentOrders: {
    fontSize: 12,
    color: '#64748B',
  },
  recentAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  expandIcon: {
    fontSize: 10,
    color: '#94A3B8',
    marginLeft: 4,
  },
  // Society Breakdown
  societyBreakdown: {
    backgroundColor: '#F8FAFC',
    marginHorizontal: -20,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  societyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingLeft: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  societyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  societyIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  societyIconText: {
    fontSize: 14,
  },
  societyInfo: {
    flex: 1,
  },
  societyName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 2,
  },
  societyMeta: {
    fontSize: 11,
    color: '#64748B',
  },
  societyRevenue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7C3AED',
  },
  // Orders Section
  ordersSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  ordersSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 16,
  },
  ordersTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  ordersTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  ordersTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  ordersTabDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  ordersTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  ordersTabTextActive: {
    color: '#1E293B',
  },
  ordersList: {
    borderRadius: 12,
  },
  orderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  orderItemLeft: {
    flexDirection: 'row',
    flex: 1,
    marginRight: 12,
  },
  orderStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
    marginRight: 12,
  },
  orderItemInfo: {
    flex: 1,
  },
  orderCustomerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 3,
  },
  orderProductInfo: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 4,
  },
  orderMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  orderSociety: {
    fontSize: 11,
    color: '#94A3B8',
  },
  orderDate: {
    fontSize: 11,
    color: '#94A3B8',
  },
  orderItemRight: {
    alignItems: 'flex-end',
  },
  orderAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7C3AED',
    marginBottom: 6,
  },
  orderStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  orderStatusText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  noOrdersState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  noOrdersIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  noOrdersText: {
    fontSize: 14,
    color: '#64748B',
  },
  moreOrdersText: {
    textAlign: 'center',
    fontSize: 13,
    color: '#7C3AED',
    fontWeight: '600',
    paddingVertical: 12,
  },
  // Empty State
  emptyState: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyIcon: {
    fontSize: 48,
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
