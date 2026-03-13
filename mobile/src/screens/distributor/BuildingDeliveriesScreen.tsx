import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppLayout } from '../../components/AppLayout';
import { AppBar } from '../../components/AppBar';
import { theme } from '../../theme';
import { MINIMUM_BALANCE } from '../../constants';
import { supabase } from '../../services/supabase';
import { formatCurrency, formatQuantity, getLocalDateString } from '../../utils/helpers';
import { useToast } from '../../components/Toast';
import { ErrorBanner } from '../../components/ErrorBanner';
import { getAuthUserId } from '../../utils/auth';
import type { DistributorScreenProps } from '../../navigation/types';

interface Delivery {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  unit_number: string;
  floor: number;
  product_names: string;
  product_unit: string;
  total_quantity: number;
  amount: number;
  status: string;
  delivery_time: string;
}

export const BuildingDeliveriesScreen = ({ route, navigation }: DistributorScreenProps<'BuildingDeliveries'>) => {
  const { buildingId, buildingName, societyName } = route.params;
  const toast = useToast();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [processing, setProcessing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'delivered'>('all');

  useEffect(() => {
    loadDeliveries();
  }, [selectedDate, buildingId]);

  const loadDeliveries = async () => {
    try {
      setError(null);

      // Get current user ID (supports dev mode impersonation)
      const userId = await getAuthUserId();

      if (!userId) {
        throw new Error('Not authenticated');
      }

      const { data: distributor, error: distError } = await supabase
        .from('distributors')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (distError || !distributor) {
        throw new Error('Distributor profile not found. Please contact admin.');
      }

      // Verify this building is assigned to the distributor
      const { data: assignment, error: assignError } = await supabase
        .from('distributor_building_assignments')
        .select('id')
        .eq('distributor_id', distributor.id)
        .eq('tower_id', buildingId)
        .eq('is_active', true)
        .maybeSingle();

      if (assignError || !assignment) {
        throw new Error('You are not assigned to this building');
      }

      // Fetch orders only for this building and assigned to this distributor
      const { data, error: fetchError } = await supabase
        .from('orders')
        .select(`
          id,
          user_id,
          status,
          total_amount,
          quantity,
          delivery_date,
          product_id,
          assigned_distributor_id,
          subscription_id,
          products!orders_product_id_fkey ( id, name, unit ),
          addresses!orders_address_id_fkey (
            tower_id,
            tower_units!addresses_unit_id_fkey ( number, floor, tower_id )
          ),
          users!orders_user_id_fkey (
            id,
            name,
            phone
          )
        `)
        .eq('delivery_date', selectedDate)
        .eq('assigned_distributor_id', distributor.id)
        .in('status', ['scheduled', 'pending', 'assigned', 'in_transit', 'delivered']);

      if (fetchError) throw fetchError;

      // Filter by building - only orders where address.tower_id matches
      const ordersInBuilding = (data || []).filter((order: any) =>
        order.addresses?.tower_id === buildingId
      );

      const formatted: Delivery[] = ordersInBuilding
        .map((order: any) => {
          const user = order.users;
          const product = order.products;
          return {
            id: order.id,
            customer_id: order.user_id,
            customer_name: user?.name || 'Unknown',
            customer_phone: user?.phone || 'N/A',
            unit_number: order.addresses?.tower_units?.number || '—',
            floor: order.addresses?.tower_units?.floor || 0,
            product_names: product?.name || 'Unknown',
            product_unit: product?.unit || '',
            total_quantity: order.quantity || 0,
            amount: order.total_amount || 0,
            status: order.status || 'pending',
            delivery_time: 'morning',
          };
        })
        .sort((a, b) => {
          if (a.floor !== b.floor) return a.floor - b.floor;
          return a.unit_number.localeCompare(b.unit_number);
        });

      setDeliveries(formatted);
    } catch (err: any) {
      console.error('Error loading deliveries:', err);
      setError(err.message || 'Failed to load deliveries');
      toast.show('Failed to load deliveries', { type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadDeliveries();
  };

  const handleMarkDelivered = (delivery: Delivery) => {
    console.log('handleMarkDelivered called for:', delivery.customer_name);
    try {
      // Web fallback for Alert
      if (typeof window !== 'undefined' && !Alert.alert) {
        const confirmed = window.confirm(
          `Mark delivery as completed for ${delivery.customer_name}?\n\n${delivery.product_names}\nAmount: ${formatCurrency(delivery.amount)}`
        );
        if (confirmed) {
          processDelivery(delivery);
        }
        return;
      }

      Alert.alert(
        'Confirm Delivery',
        `Mark delivery as completed for ${delivery.customer_name}?\n\n${delivery.product_names}\nAmount: ${formatCurrency(delivery.amount)}`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Confirm', onPress: () => processDelivery(delivery) }
        ]
      );
    } catch (error) {
      console.error('Alert error:', error);
      toast.show('Error showing confirmation dialog', { type: 'error' });
    }
  };

  const processDelivery = async (delivery: Delivery) => {
    try {
      setProcessing(true);

      // First check if order is already delivered (prevent double processing)
      const { data: orderCheck, error: orderCheckError } = await supabase
        .from('orders')
        .select('status')
        .eq('id', delivery.id)
        .maybeSingle();

      if (orderCheckError) throw orderCheckError;
      if (!orderCheck) {
        Alert.alert('Error', 'Order not found. Please refresh and try again.');
        setProcessing(false);
        return;
      }
      if (orderCheck.status === 'delivered') {
        Alert.alert('Already Delivered', 'This order has already been marked as delivered.');
        setProcessing(false);
        return;
      }

      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id, wallet_balance')
        .eq('user_id', delivery.customer_id)
        .maybeSingle();

      if (customerError) throw customerError;

      // Don't expose actual wallet balance to distributor - just say insufficient
      if (!customer || customer.wallet_balance < delivery.amount) {
        Alert.alert(
          '⚠️ Insufficient Balance',
          `Customer has insufficient balance for this delivery.\n\nRequired: ${formatCurrency(delivery.amount)}\n\nPlease ask customer to recharge.`
        );
        setProcessing(false);
        return;
      }

      // Use UUID-based idempotency key to prevent double-charging
      const idempotencyKey = `delivery-${delivery.id}`;

      const { error: debitError } = await supabase.rpc('debit_wallet', {
        p_user_id: delivery.customer_id,
        p_amount: delivery.amount,
        p_reference_type: 'order',
        p_reference_id: delivery.id,
        p_idempotency_key: idempotencyKey,
        p_description: `Delivery: ${delivery.product_names}`,
      });

      if (debitError) {
        console.error('Debit error:', debitError);
        throw new Error(debitError.message || 'Failed to debit wallet');
      }

      // Update order status
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          status: 'delivered',
          delivered_at: new Date().toISOString()
        })
        .eq('id', delivery.id);

      if (updateError) throw updateError;

      // Check new balance and auto-pause if needed
      const { data: updatedCustomer } = await supabase
        .from('customers')
        .select('wallet_balance')
        .eq('user_id', delivery.customer_id)
        .maybeSingle();

      const newBalance = updatedCustomer?.wallet_balance || 0;

      // Auto-pause subscriptions if balance falls below minimum
      if (newBalance < MINIMUM_BALANCE) {
        const { error: pauseError } = await supabase
          .from('subscriptions')
          .update({
            status: 'paused',
            pause_start_date: getLocalDateString(),
            pause_end_date: null,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', delivery.customer_id)
          .eq('status', 'active');

        if (!pauseError) {
          setTimeout(() => {
            Alert.alert(
              '⚠️ Subscriptions Auto-Paused',
              `${delivery.customer_name}'s balance is now ${formatCurrency(newBalance)} (below ₹${MINIMUM_BALANCE} minimum).\n\nAll subscriptions have been auto-paused until they recharge.`,
              [{ text: 'Got it' }]
            );
          }, 500);
        }
      }

      toast.show(`Delivered to Unit ${delivery.unit_number}!`, { type: 'success' });

      loadDeliveries();
    } catch (error: any) {
      console.error('Error marking delivery:', error);
      Alert.alert('Error', error.message || 'Failed to mark delivery as completed');
    } finally {
      setProcessing(false);
    }
  };

  const filteredDeliveries = deliveries.filter(d => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'pending') return ['pending', 'assigned', 'in_transit', 'scheduled'].includes(d.status);
    if (filterStatus === 'delivered') return d.status === 'delivered';
    return true;
  });

  const pendingCount = deliveries.filter(d => ['pending', 'assigned', 'in_transit', 'scheduled'].includes(d.status)).length;
  const deliveredCount = deliveries.filter(d => d.status === 'delivered').length;
  const progressPercent = deliveries.length > 0 ? (deliveredCount / deliveries.length) * 100 : 0;

  // Group by floor
  const floorGroups = filteredDeliveries.reduce((groups, delivery) => {
    const floor = delivery.floor;
    if (!groups[floor]) {
      groups[floor] = [];
    }
    groups[floor].push(delivery);
    return groups;
  }, {} as Record<number, Delivery[]>);

  const renderDeliveryCard = (item: Delivery) => {
    const isDelivered = item.status === 'delivered';

    return (
      <View key={item.id} style={[styles.card, isDelivered && styles.cardDelivered]}>
        <View style={styles.cardHeader}>
          <View style={styles.unitContainer}>
            <View style={[styles.unitBadge, isDelivered && styles.unitBadgeDelivered]}>
              <Text style={[styles.unitNumber, isDelivered && styles.unitNumberDelivered]}>
                {item.unit_number}
              </Text>
            </View>
            <View style={styles.customerInfo}>
              <Text style={[styles.customerName, isDelivered && styles.customerNameDelivered]}>
                {item.customer_name}
              </Text>
              <Text style={styles.customerPhone}>📞 {item.customer_phone}</Text>
            </View>
          </View>
          <View style={[styles.statusIndicator, isDelivered && styles.statusIndicatorDelivered]}>
            <Text style={styles.statusIcon}>{isDelivered ? '✅' : '⏳'}</Text>
          </View>
        </View>

        <View style={styles.productSection}>
          <View style={styles.productInfo}>
            <Text style={styles.productLabel}>Product</Text>
            <Text style={styles.productName}>{item.product_names}</Text>
            <Text style={styles.quantityText}>
              {formatQuantity(item.total_quantity, item.product_unit)}
            </Text>
          </View>
          <View style={styles.amountContainer}>
            <Text style={styles.amountLabel}>Amount</Text>
            <Text style={styles.amountValue}>{formatCurrency(item.amount)}</Text>
          </View>
        </View>

        {!isDelivered && (
          <TouchableOpacity
            style={[styles.deliverButton, processing && styles.buttonDisabled]}
            onPress={() => handleMarkDelivered(item)}
            disabled={processing}
          >
            {processing ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <>
                <Text style={styles.deliverButtonIcon}>✓</Text>
                <Text style={styles.deliverButtonText}>Mark Delivered</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderFloorSection = (floor: string) => {
    const floorDeliveries = floorGroups[parseInt(floor)];
    const floorPending = floorDeliveries.filter(d => d.status !== 'delivered').length;
    const allDone = floorPending === 0;

    return (
      <View key={floor} style={styles.floorSection}>
        <View style={[styles.floorHeader, allDone && styles.floorHeaderDone]}>
          <View style={styles.floorBadge}>
            <Text style={styles.floorBadgeText}>F{floor}</Text>
          </View>
          <Text style={styles.floorTitle}>Floor {floor}</Text>
          <View style={[styles.floorCountBadge, allDone && styles.floorCountBadgeDone]}>
            <Text style={[styles.floorCountText, allDone && styles.floorCountTextDone]}>
              {allDone ? '✓ Done' : `${floorPending} left`}
            </Text>
          </View>
        </View>
        {floorDeliveries.map(renderDeliveryCard)}
      </View>
    );
  };

  if (loading) {
    return (
      <AppLayout>
        <AppBar
          title={buildingName}
          subtitle={societyName}
          onBack={() => navigation.goBack()}
          variant="surface"
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading deliveries...</Text>
        </View>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <AppBar
        title={buildingName}
        subtitle={societyName}
        onBack={() => navigation.goBack()}
        variant="surface"
      />

      <FlatList
        data={Object.keys(floorGroups).sort((a, b) => parseInt(a) - parseInt(b))}
        keyExtractor={(item) => item}
        renderItem={({ item }) => renderFloorSection(item)}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {/* Progress Card */}
            <LinearGradient
              colors={progressPercent === 100 ? ['#10B981', '#059669'] : ['#3B82F6', '#2563EB']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.progressCard}
            >
              <View style={styles.progressHeader}>
                <View style={styles.progressIconContainer}>
                  <Text style={styles.progressIcon}>{progressPercent === 100 ? '🎉' : '🚴'}</Text>
                </View>
                <View style={styles.progressInfo}>
                  <Text style={styles.progressTitle}>
                    {progressPercent === 100 ? 'All Done!' : 'Progress'}
                  </Text>
                  <Text style={styles.progressSubtitle}>
                    {deliveredCount} of {deliveries.length} delivered
                  </Text>
                </View>
                <View style={styles.progressPercent}>
                  <Text style={styles.progressPercentText}>{Math.round(progressPercent)}%</Text>
                </View>
              </View>
              <View style={styles.progressBarContainer}>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
                </View>
              </View>
            </LinearGradient>

            {/* Filter Tabs */}
            <View style={styles.filterContainer}>
              <TouchableOpacity
                style={[styles.filterTab, filterStatus === 'all' && styles.filterTabActive]}
                onPress={() => setFilterStatus('all')}
              >
                <Text style={[styles.filterText, filterStatus === 'all' && styles.filterTextActive]}>
                  All ({deliveries.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterTab, filterStatus === 'pending' && styles.filterTabActive]}
                onPress={() => setFilterStatus('pending')}
              >
                <Text style={[styles.filterText, filterStatus === 'pending' && styles.filterTextActive]}>
                  Pending ({pendingCount})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterTab, filterStatus === 'delivered' && styles.filterTabActive]}
                onPress={() => setFilterStatus('delivered')}
              >
                <Text style={[styles.filterText, filterStatus === 'delivered' && styles.filterTextActive]}>
                  Done ({deliveredCount})
                </Text>
              </TouchableOpacity>
            </View>

            {error && <ErrorBanner message={error} onRetry={loadDeliveries} />}
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconContainer}>
              <Text style={styles.emptyIcon}>📦</Text>
            </View>
            <Text style={styles.emptyTitle}>No Deliveries</Text>
            <Text style={styles.emptyDescription}>
              {filterStatus === 'all'
                ? 'No orders for this building today'
                : `No ${filterStatus} deliveries`}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
        ListFooterComponent={<View style={{ height: 40 }} />}
      />
    </AppLayout>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  listContent: {
    padding: 16,
  },

  // Progress Card
  progressCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  progressIcon: {
    fontSize: 24,
  },
  progressInfo: {
    flex: 1,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: 'white',
  },
  progressSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  progressPercent: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  progressPercentText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
  },
  progressBarContainer: {
    marginTop: 4,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: 'white',
    borderRadius: 4,
  },

  // Filter Tabs
  filterContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 6,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  filterTabActive: {
    backgroundColor: theme.colors.primary,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  filterTextActive: {
    color: 'white',
  },

  // Error Banner
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  errorContent: {
    flex: 1,
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '500',
  },
  errorRetry: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 2,
  },

  // Floor Section
  floorSection: {
    marginBottom: 16,
  },
  floorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  floorHeaderDone: {
    backgroundColor: '#ECFDF5',
  },
  floorBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  floorBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  floorTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  floorCountBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  floorCountBadgeDone: {
    backgroundColor: '#D1FAE5',
  },
  floorCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F59E0B',
  },
  floorCountTextDone: {
    color: '#10B981',
  },

  // Delivery Card
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardDelivered: {
    backgroundColor: '#FAFAFA',
    opacity: 0.85,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  unitContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  unitBadge: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  unitBadgeDelivered: {
    backgroundColor: '#D1FAE5',
  },
  unitNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  unitNumberDelivered: {
    color: '#10B981',
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  customerNameDelivered: {
    color: '#64748B',
  },
  customerPhone: {
    fontSize: 13,
    color: '#64748B',
  },
  statusIndicator: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusIndicatorDelivered: {
    backgroundColor: '#D1FAE5',
  },
  statusIcon: {
    fontSize: 18,
  },

  // Product Section
  productSection: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  productInfo: {
    flex: 1,
  },
  productLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  productName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  quantityText: {
    fontSize: 13,
    color: '#64748B',
  },
  amountContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  amountLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amountValue: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.primary,
  },

  // Deliver Button
  deliverButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  deliverButtonIcon: {
    fontSize: 16,
    marginRight: 8,
    color: 'white',
  },
  deliverButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'white',
  },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyIcon: {
    fontSize: 36,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
});
