import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { AppLayout } from '../../components/AppLayout';
import { AppBar } from '../../components/AppBar';
import { theme, shadows, spacing, borderRadius } from '../../theme';
import { supabase } from '../../services/supabase';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency, getLocalDateString } from '../../utils/helpers';
import { Skeleton } from '../../components/Skeleton';
import { StatusBadge, PressableCard } from '../../components/ui';
import { EmptyState } from '../../components/EmptyState';

interface OrderItem {
  productName: string;
  quantity: string; // formatted quantity + unit
  price: number; // per-line price
}

interface Order {
  id: string;
  date: string; // ISO date string
  time: string; // derived or placeholder
  status: 'delivered' | 'cancelled' | 'failed' | 'skipped' | 'missed';
  items: OrderItem[];
  totalAmount: number;
  paymentMethod: 'wallet' | 'cash' | 'online' | null;
}

// Start with empty orders; all data fetched from Supabase

interface OrderHistoryScreenProps {
  onBack: () => void;
}

export const OrderHistoryScreen: React.FC<OrderHistoryScreenProps> = ({ onBack }) => {
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const user = useAuthStore(s => s.user);

  const loadOrders = async () => {
    if (!user) return;
    
    try {
      // Query orders using user_id directly
      let userId = user.id;
      
      // Only fetch past orders (delivery_date <= today), not future scheduled ones
      const today = getLocalDateString();
      
      // Fetch orders with user_id - include product info directly since schema has product_id on orders
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('id, delivery_date, status, total_amount, quantity, unit_price, delivered_at, product:products(id, name, unit)')
        .eq('user_id', userId)
        .lte('delivery_date', today)
        .order('delivery_date', { ascending: false })
        .limit(50);
      
      if (ordersError) {
        console.warn('loadOrders error', ordersError);
        return;
      }
      
      if (!ordersData || ordersData.length === 0) {
        setOrders([]);
        return;
      }
      
      const mapped: Order[] = ordersData.map((row: any) => {
        const product = row.product;
        const items = [{
          productName: product?.name || 'Product',
          quantity: `${row.quantity}${product?.unit || ''}`,
          price: row.total_amount,
        }];
        
        // Determine actual status
        let status: Order['status'] = 'delivered';
        if (row.status === 'delivered') {
          status = 'delivered';
        } else if (row.status === 'cancelled' || row.status === 'skipped') {
          status = 'skipped';
        } else if (row.status === 'failed' || row.status === 'missed') {
          status = 'missed';
        } else {
          // Pending orders for past dates are considered missed
          status = 'missed';
        }
        
        // Get delivery time from delivered_at if available
        const deliveryTime = row.delivered_at 
          ? new Date(row.delivered_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
          : '-';
        
        return {
          id: row.id,
          date: row.delivery_date,
          time: deliveryTime,
          status,
          items,
          totalAmount: row.total_amount,
          paymentMethod: null, // payment_method is on payments table, not orders
        };
      });
      setOrders(mapped);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };

  // TODO: Implement invoice generation - hiding button until ready
  // const handleDownloadInvoice = (orderId: string) => { ... };

  // TODO: Implement delivery rating - hiding button until ready
  // const handleRateDelivery = (orderId: string) => { ... };

  const totalDelivered = orders.reduce((c, o) => c + (o.status === 'delivered' ? 1 : 0), 0);
  const totalSpent = orders.reduce((sum, o) => sum + (o.status === 'delivered' ? o.totalAmount : 0), 0);

  const renderOrderSkeleton = () => (
    <View style={[styles.orderCard, styles.cardShadow]}>
      <View style={styles.orderHeader}>
        <View>
          <Skeleton height={14} width={140} style={{ marginBottom: 6 }} />
          <Skeleton height={12} width={100} />
        </View>
        <Skeleton height={28} width={90} radius={14} />
      </View>
      <View style={styles.orderItems}>
        <View style={styles.orderItem}>
          <View style={styles.orderItemInfo}>
            <Skeleton height={14} width="60%" style={{ marginBottom: 4 }} />
            <Skeleton height={12} width="30%" />
          </View>
          <Skeleton height={16} width={50} />
        </View>
      </View>
      <View style={styles.orderFooter}>
        <View style={styles.orderTotal}>
          <Skeleton height={14} width={80} />
          <Skeleton height={20} width={70} />
        </View>
        <Skeleton height={24} width={80} radius={8} />
      </View>
    </View>
  );

  const getStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'delivered':
        return <StatusBadge label="Delivered" variant="success" icon="✓" />;
      case 'skipped':
        return <StatusBadge label="Skipped" variant="warning" icon="⏭" />;
      case 'missed':
        return <StatusBadge label="Missed" variant="error" icon="✕" />;
      case 'cancelled':
        return <StatusBadge label="Cancelled" variant="error" icon="✕" />;
      case 'failed':
        return <StatusBadge label="Failed" variant="warning" icon="⚠" />;
    }
  };

  return (
    <AppLayout>
      <AppBar title="Order History" onBack={onBack} variant="surface" />

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading ? (
          <>
            {/* Stats Card Skeleton */}
            <View style={[styles.statsCard, styles.cardShadow]}>
              <View style={styles.statItem}>
                <Skeleton height={32} width={60} style={{ marginBottom: 6 }} />
                <Skeleton height={14} width={100} />
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Skeleton height={32} width={80} style={{ marginBottom: 6 }} />
                <Skeleton height={14} width={80} />
              </View>
            </View>
            
            {/* Order Skeletons */}
            <View style={styles.section}>
              <Skeleton height={20} width={120} style={{ marginBottom: 12 }} />
              {[1, 2, 3].map((i) => (
                <View key={i}>{renderOrderSkeleton()}</View>
              ))}
            </View>
          </>
        ) : orders.length === 0 ? (
          <EmptyState
            icon="📦"
            title="No Orders Yet"
            description="Your order history will appear here once you start receiving deliveries."
          />
        ) : (
          <>
            {/* Stats Card */}
            <View style={[styles.statsCard, styles.cardShadow]}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{totalDelivered}</Text>
                <Text style={styles.statLabel}>Total Deliveries</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: theme.colors.success }]}>
                  {formatCurrency(totalSpent)}
                </Text>
                <Text style={styles.statLabel}>Total Spent</Text>
              </View>
            </View>

            {/* Orders List */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>All Orders</Text>
              {orders.map((order) => (
                <PressableCard key={order.id} style={[styles.orderCard, styles.cardShadow]}>
                  <View style={styles.orderHeader}>
                    <View>
                      <Text style={styles.orderId}>{order.id.slice(0, 8)}...</Text>
                      <Text style={styles.orderDate}>
                        {new Date(order.date).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                        {' • '}{order.time}
                      </Text>
                    </View>
                    {getStatusBadge(order.status)}
                  </View>

                  <View style={styles.orderItems}>
                    {order.items.map((item, idx) => (
                      <View key={idx} style={styles.orderItem}>
                        <View style={styles.orderItemInfo}>
                          <Text style={styles.orderItemName}>{item.productName}</Text>
                          <Text style={styles.orderItemQuantity}>{item.quantity}</Text>
                        </View>
                        <Text style={styles.orderItemPrice}>{formatCurrency(item.price)}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.orderFooter}>
                    <View style={styles.orderTotal}>
                      <Text style={styles.orderTotalLabel}>Total Amount</Text>
                      <Text style={styles.orderTotalValue}>{formatCurrency(order.totalAmount)}</Text>
                    </View>

                    {order.paymentMethod && (
                      <View style={styles.paymentBadge}>
                        <Text style={styles.paymentText}>
                          {order.paymentMethod === 'wallet' && '💳 Wallet'}
                          {order.paymentMethod === 'cash' && '💵 Cash'}
                          {order.paymentMethod === 'online' && '🌐 Online'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* TODO: Add Invoice and Rate buttons when features are implemented
                  {order.status === 'delivered' && (
                    <View style={styles.orderActions}>
                      <TouchableOpacity style={styles.orderActionButton}>
                        <Text style={styles.orderActionText}>📄 Invoice</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.orderActionButton}>
                        <Text style={styles.orderActionText}>⭐ Rate</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  */}
                </PressableCard>
              ))}
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </AppLayout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  content: {
    flex: 1,
  },
  statsCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 24,
    marginTop: 16,
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  statDivider: {
    width: 1,
    backgroundColor: theme.colors.borderLight,
    marginHorizontal: 16,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 12,
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  orderId: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  orderDate: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  deliveredBadge: {
    backgroundColor: theme.colors.success + '20',
  },
  cancelledBadge: {
    backgroundColor: theme.colors.error + '20',
  },
  failedBadge: {
    backgroundColor: theme.colors.warning + '20',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.text,
  },
  orderItems: {
    marginBottom: 12,
  },
  orderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  orderItemInfo: {
    flex: 1,
  },
  orderItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 2,
  },
  orderItemQuantity: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  orderItemPrice: {
    fontSize: 15,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  orderFooter: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  orderTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderTotalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  orderTotalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  deliveredBy: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  paymentBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  paymentText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.text,
  },
  orderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  orderActionButton: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  orderActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text,
  },
});
