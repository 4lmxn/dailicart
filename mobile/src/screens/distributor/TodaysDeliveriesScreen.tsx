import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { AppLayout } from '../../components/AppLayout';
import { AppBar } from '../../components/AppBar';
import { theme } from '../../theme';
import { MINIMUM_BALANCE } from '../../constants';
import { supabase } from '../../services/supabase';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency, formatQuantity, getLocalDateString } from '../../utils/helpers';
import { getAuthUserId } from '../../utils/auth';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { ErrorBanner } from '../../components/ErrorBanner';
import { useToast } from '../../components/Toast';
import { useOffline } from '../../hooks/useOffline';
import { CachedDelivery } from '../../services/offline/offlineService';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface DeliveryItem {
  id: string;
  orderId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  unitNumber: string;
  floor: number;
  productName: string;
  quantity: number;
  unit: string;
  amount: number;
  status: string;
  deliveryInstructions?: string;
}

interface FloorGroup {
  floor: number;
  deliveries: DeliveryItem[];
}

interface BuildingGroup {
  buildingId: string;
  buildingName: string;
  societyId: string;
  societyName: string;
  floors: FloorGroup[];
  totalDeliveries: number;
  pendingCount: number;
  deliveredCount: number;
  stockSummary: Map<string, { name: string; quantity: number; unit: string }>;
}

interface StockItem {
  productId: string;
  name: string;
  quantity: number;
  unit: string;
}

export function TodaysDeliveriesScreen() {
  const { user } = useAuthStore();
  const navigation = useNavigation();
  const toast = useToast();
  const { isOnline, pendingCount, queueUpdate, cacheDeliveries, getCachedDeliveries, syncPending } = useOffline();
  const [buildings, setBuildings] = useState<BuildingGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedBuildings, setExpandedBuildings] = useState<Set<string>>(new Set());
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryItem | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showStockSummary, setShowStockSummary] = useState(true);
  const [distributorId, setDistributorId] = useState<string | null>(null);
  const [usingCachedData, setUsingCachedData] = useState(false);

  useEffect(() => {
    fetchTodaysDeliveries();
  }, []);

  // Sync pending updates when coming online
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      syncPending().then(({ synced, failed }) => {
        if (synced > 0) {
          toast.show(`Synced ${synced} delivery update${synced > 1 ? 's' : ''}`, { type: 'success' });
          fetchTodaysDeliveries(); // Refresh to get latest data
        }
        if (failed > 0) {
          toast.show(`${failed} update${failed > 1 ? 's' : ''} failed to sync`, { type: 'error' });
        }
      });
    }
  }, [isOnline]);

  // Helper to convert deliveries to cached format
  const deliveriesToCachedFormat = (buildings: BuildingGroup[]): CachedDelivery[] => {
    const result: CachedDelivery[] = [];
    buildings.forEach(building => {
      building.floors.forEach(floor => {
        floor.deliveries.forEach(delivery => {
          result.push({
            ...delivery,
            buildingId: building.buildingId,
            buildingName: building.buildingName,
            societyId: building.societyId,
            societyName: building.societyName,
          });
        });
      });
    });
    return result;
  };

  // Helper to convert cached deliveries back to building groups
  const cachedToBuildings = (cached: CachedDelivery[]): BuildingGroup[] => {
    const buildingMap = new Map<string, BuildingGroup>();

    cached.forEach(delivery => {
      if (!buildingMap.has(delivery.buildingId)) {
        buildingMap.set(delivery.buildingId, {
          buildingId: delivery.buildingId,
          buildingName: delivery.buildingName,
          societyId: delivery.societyId,
          societyName: delivery.societyName,
          floors: [],
          totalDeliveries: 0,
          pendingCount: 0,
          deliveredCount: 0,
          stockSummary: new Map(),
        });
      }

      const building = buildingMap.get(delivery.buildingId)!;
      building.totalDeliveries++;

      if (delivery.status === 'delivered') {
        building.deliveredCount++;
      } else {
        building.pendingCount++;
        // Add to stock summary
        const productKey = delivery.productName;
        const existing = building.stockSummary.get(productKey);
        if (existing) {
          existing.quantity += delivery.quantity;
        } else {
          building.stockSummary.set(productKey, {
            name: delivery.productName,
            quantity: delivery.quantity,
            unit: delivery.unit,
          });
        }
      }

      let floorGroup = building.floors.find(f => f.floor === delivery.floor);
      if (!floorGroup) {
        floorGroup = { floor: delivery.floor, deliveries: [] };
        building.floors.push(floorGroup);
      }
      floorGroup.deliveries.push(delivery);
    });

    // Sort buildings and floors
    const sortedBuildings = Array.from(buildingMap.values())
      .sort((a, b) => {
        const societyCompare = a.societyName.localeCompare(b.societyName);
        if (societyCompare !== 0) return societyCompare;
        return a.buildingName.localeCompare(b.buildingName);
      });

    sortedBuildings.forEach(building => {
      building.floors.sort((a, b) => a.floor - b.floor);
      building.floors.forEach(floor => {
        floor.deliveries.sort((a, b) => a.unitNumber.localeCompare(b.unitNumber));
      });
    });

    return sortedBuildings;
  };

  const fetchTodaysDeliveries = async () => {
    const today = getLocalDateString();

    // If offline, try to use cached data
    if (!isOnline) {
      try {
        const cached = await getCachedDeliveries(today);
        if (cached && cached.length > 0) {
          const buildingGroups = cachedToBuildings(cached);
          setBuildings(buildingGroups);
          setUsingCachedData(true);
          setLoading(false);
          setRefreshing(false);
          toast.show('Using offline data', { type: 'info' });
          return;
        }
      } catch (err) {
        console.error('Error loading cached data:', err);
      }
      setError('No internet connection. Please connect to load deliveries.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setUsingCachedData(false);

      const userId = await getAuthUserId();
      if (!userId) {
        setError('Not authenticated');
        return;
      }

      // Get distributor ID - use maybeSingle to handle edge case
      const { data: distributor, error: distError } = await supabase
        .from('distributors')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (distError) {
        console.error('Error fetching distributor:', distError);
        setError('Failed to load distributor profile');
        return;
      }

      if (!distributor?.id) {
        setError('Distributor profile not found. Please contact admin.');
        return;
      }

      const distId = distributor.id;

      const today = getLocalDateString();

      // First, get the list of tower_ids the distributor is ACTIVELY assigned to
      const { data: activeAssignments } = await supabase
        .from('distributor_building_assignments')
        .select('tower_id')
        .eq('distributor_id', distId)
        .eq('is_active', true);

      const activeTowerIds = (activeAssignments || []).map(a => a.tower_id);

      // If no active assignments, show empty
      if (activeTowerIds.length === 0) {
        setBuildings([]);
        setLoading(false);
        return;
      }

      // Fetch orders with all related data - only for active buildings
      const { data: orders, error: fetchError } = await supabase
        .from('orders')
        .select(`
          id,
          user_id,
          status,
          total_amount,
          quantity,
          product_id,
          products!orders_product_id_fkey (
            id,
            name,
            unit
          ),
          addresses!orders_address_id_fkey (
            id,
            society_id,
            society_name,
            tower_id,
            unit_id,
            delivery_instructions,
            societies!addresses_society_id_fkey ( id, name ),
            society_towers!addresses_tower_id_fkey ( id, name ),
            tower_units!addresses_unit_id_fkey ( id, number, floor )
          ),
          users!orders_user_id_fkey (
            id,
            name,
            phone
          )
        `)
        .eq('assigned_distributor_id', distId)
        .eq('delivery_date', today)
        .in('status', ['scheduled', 'pending', 'assigned', 'in_transit', 'delivered']);

      if (fetchError) throw fetchError;

      // Group orders by building -> floor -> unit
      const buildingMap = new Map<string, BuildingGroup>();

      (orders || []).forEach((order: any) => {
        const address = order.addresses;
        const product = order.products;
        const user = order.users;

        if (!address?.society_towers?.id) return;

        const buildingId = address.society_towers.id;

        // Skip orders for buildings the distributor is NOT actively assigned to
        if (!activeTowerIds.includes(buildingId)) return;

        const buildingName = address.society_towers.name || 'Unknown Building';
        const societyId = address.societies?.id || '';
        const societyName = address.societies?.name || address.society_name || 'Unknown Society';
        const floor = address.tower_units?.floor ?? 0;
        const unitNumber = address.tower_units?.number || '—';

        const deliveryItem: DeliveryItem = {
          id: `${order.id}-${product?.id || 'unknown'}`,
          orderId: order.id,
          customerId: order.user_id,
          customerName: user?.name || 'Unknown',
          customerPhone: user?.phone || 'N/A',
          unitNumber,
          floor,
          productName: product?.name || 'Unknown Product',
          quantity: order.quantity || 0,
          unit: product?.unit || '',
          amount: order.total_amount || 0,
          status: order.status || 'pending',
          deliveryInstructions: address.delivery_instructions,
        };

        // Get or create building group
        if (!buildingMap.has(buildingId)) {
          buildingMap.set(buildingId, {
            buildingId,
            buildingName,
            societyId,
            societyName,
            floors: [],
            totalDeliveries: 0,
            pendingCount: 0,
            deliveredCount: 0,
            stockSummary: new Map(),
          });
        }

        const building = buildingMap.get(buildingId)!;
        building.totalDeliveries++;

        if (order.status === 'delivered') {
          building.deliveredCount++;
        } else {
          building.pendingCount++;

          // Add to stock summary (only for pending)
          const productKey = product?.id || 'unknown';
          const existing = building.stockSummary.get(productKey);
          if (existing) {
            existing.quantity += order.quantity || 0;
          } else {
            building.stockSummary.set(productKey, {
              name: product?.name || 'Unknown',
              quantity: order.quantity || 0,
              unit: product?.unit || '',
            });
          }
        }

        // Find or create floor group
        let floorGroup = building.floors.find(f => f.floor === floor);
        if (!floorGroup) {
          floorGroup = { floor, deliveries: [] };
          building.floors.push(floorGroup);
        }
        floorGroup.deliveries.push(deliveryItem);
      });

      // Sort buildings by society name, then building name
      const sortedBuildings = Array.from(buildingMap.values())
        .sort((a, b) => {
          const societyCompare = a.societyName.localeCompare(b.societyName);
          if (societyCompare !== 0) return societyCompare;
          return a.buildingName.localeCompare(b.buildingName);
        });

      // Sort floors and deliveries within each building
      sortedBuildings.forEach(building => {
        building.floors.sort((a, b) => a.floor - b.floor);
        building.floors.forEach(floor => {
          floor.deliveries.sort((a, b) => a.unitNumber.localeCompare(b.unitNumber));
        });
      });

      setBuildings(sortedBuildings);

      // Cache deliveries for offline use
      if (distId) {
        setDistributorId(distId);
        const deliveriesToCache = deliveriesToCachedFormat(sortedBuildings);
        cacheDeliveries(deliveriesToCache, today, distId);
      }

      // Auto-expand first building if only one
      if (sortedBuildings.length === 1) {
        setExpandedBuildings(new Set([sortedBuildings[0].buildingId]));
      }
    } catch (error: any) {
      console.error('Error fetching deliveries:', error);
      // Try to load cached data on error
      const cached = await getCachedDeliveries(today);
      if (cached && cached.length > 0) {
        const buildingGroups = cachedToBuildings(cached);
        setBuildings(buildingGroups);
        setUsingCachedData(true);
        toast.show('Loaded cached data', { type: 'info' });
      } else {
        setError(error.message || 'Failed to load deliveries');
        toast.show('Failed to load deliveries', { type: 'error' });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Calculate total stock needed (across all buildings)
  const totalStock = useMemo(() => {
    const stockMap = new Map<string, StockItem>();

    buildings.forEach(building => {
      building.stockSummary.forEach((item, productId) => {
        const existing = stockMap.get(productId);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          stockMap.set(productId, { productId, ...item });
        }
      });
    });

    return Array.from(stockMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [buildings]);

  const totalStats = useMemo(() => {
    return buildings.reduce(
      (acc, b) => ({
        total: acc.total + b.totalDeliveries,
        pending: acc.pending + b.pendingCount,
        delivered: acc.delivered + b.deliveredCount,
      }),
      { total: 0, pending: 0, delivered: 0 }
    );
  }, [buildings]);

  const progressPercent = totalStats.total > 0 ? (totalStats.delivered / totalStats.total) * 100 : 0;

  const toggleBuilding = (buildingId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedBuildings(prev => {
      const newSet = new Set(prev);
      if (newSet.has(buildingId)) {
        newSet.delete(buildingId);
      } else {
        newSet.add(buildingId);
      }
      return newSet;
    });
  };

  const handleMarkDelivered = (delivery: DeliveryItem) => {
    if (!isOnline) {
      // Offline mode - warn that payment will be processed later
      Alert.alert(
        '📴 Offline Mode',
        `You are offline. The delivery will be queued and payment will be processed when you're back online.\n\nMark ${delivery.customerName}'s order as delivered?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Queue Delivery', 
            onPress: () => processDeliveryOffline(delivery) 
          }
        ]
      );
      return;
    }

    Alert.alert(
      'Confirm Delivery',
      `Mark delivery as completed for ${delivery.customerName}?\n\n${formatQuantity(delivery.quantity, delivery.unit)} ${delivery.productName}\nAmount: ${formatCurrency(delivery.amount)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => processDelivery(delivery) }
      ]
    );
  };

  // Process delivery when offline - queue for later sync
  const processDeliveryOffline = async (delivery: DeliveryItem) => {
    try {
      setProcessing(true);
      setSelectedDelivery(delivery);

      // Queue the update for later sync
      await queueUpdate(delivery.orderId, 'delivered');

      // Update local state optimistically
      setBuildings(prev => {
        const updated = prev.map(building => ({
          ...building,
          deliveredCount: building.floors.reduce((count, floor) => {
            return count + floor.deliveries.filter(d => 
              d.orderId === delivery.orderId || d.status === 'delivered'
            ).length;
          }, 0),
          pendingCount: building.floors.reduce((count, floor) => {
            return count + floor.deliveries.filter(d => 
              d.orderId !== delivery.orderId && d.status !== 'delivered'
            ).length;
          }, 0),
          floors: building.floors.map(floor => ({
            ...floor,
            deliveries: floor.deliveries.map(d => 
              d.orderId === delivery.orderId ? { ...d, status: 'delivered' } : d
            ),
          })),
        }));
        return updated;
      });

      toast.show(`Queued delivery for ${delivery.unitNumber}`, { type: 'info' });
      setSelectedDelivery(null);
    } catch (error: any) {
      console.error('Error queuing delivery:', error);
      Alert.alert('Error', error.message || 'Failed to queue delivery');
    } finally {
      setProcessing(false);
    }
  };

  const processDelivery = async (delivery: DeliveryItem) => {
    try {
      setProcessing(true);
      setSelectedDelivery(delivery);

      // First check if order is already delivered (prevent double processing)
      const { data: orderCheck, error: orderCheckError } = await supabase
        .from('orders')
        .select('status')
        .eq('id', delivery.orderId)
        .maybeSingle();

      if (orderCheckError) throw orderCheckError;
      if (!orderCheck) {
        Alert.alert('Order Not Found', 'This order no longer exists.');
        setProcessing(false);
        return;
      }
      if (orderCheck.status === 'delivered') {
        Alert.alert('Already Delivered', 'This order has already been marked as delivered.');
        setProcessing(false);
        return;
      }

      // Get customer wallet balance to check if sufficient (don't expose wallet_balance in UI)
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id, wallet_balance, user_id')
        .eq('user_id', delivery.customerId)
        .maybeSingle();

      if (customerError) throw customerError;

      if (!customer) {
        Alert.alert('Customer Not Found', 'Customer record not found for this delivery.');
        setProcessing(false);
        return;
      }

      if (customer.wallet_balance < delivery.amount) {
        Alert.alert(
          '⚠️ Insufficient Balance',
          `Customer has insufficient balance for this delivery.\n\nRequired: ${formatCurrency(delivery.amount)}\n\nPlease ask customer to recharge.`
        );
        setProcessing(false);
        return;
      }

      // Use UUID-based idempotency key to prevent double-charging
      // Key is unique per order - if same order is processed twice, debit_wallet will reject
      const idempotencyKey = `delivery-${delivery.orderId}`;

      const { error: debitError } = await supabase.rpc('debit_wallet', {
        p_user_id: delivery.customerId,
        p_amount: delivery.amount,
        p_reference_type: 'order',
        p_reference_id: delivery.orderId,
        p_idempotency_key: idempotencyKey,
        p_description: `Delivery: ${delivery.productName} (${formatQuantity(delivery.quantity, delivery.unit)})`,
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
        .eq('id', delivery.orderId);

      if (updateError) throw updateError;

      // Check new balance and auto-pause if needed
      const { data: updatedCustomer } = await supabase
        .from('customers')
        .select('wallet_balance')
        .eq('user_id', delivery.customerId)
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
          .eq('user_id', delivery.customerId)
          .eq('status', 'active');

        if (!pauseError) {
          setTimeout(() => {
            Alert.alert(
              '⚠️ Subscriptions Auto-Paused',
              `${delivery.customerName}'s balance is now ${formatCurrency(newBalance)} (below ₹${MINIMUM_BALANCE} minimum).\n\nAll subscriptions have been auto-paused until they recharge.`,
              [{ text: 'Got it' }]
            );
          }, 500);
        }
      }

      toast.show(`Delivered to ${delivery.unitNumber}!`, { type: 'success' });

      setSelectedDelivery(null);
      fetchTodaysDeliveries();
    } catch (error: any) {
      console.error('Error marking delivery:', error);
      Alert.alert('Error', error.message || 'Failed to mark delivery');
    } finally {
      setProcessing(false);
    }
  };

  const renderDeliveryItem = (delivery: DeliveryItem) => {
    const isDelivered = delivery.status === 'delivered';

    return (
      <View key={delivery.id} style={[styles.deliveryItem, isDelivered && styles.deliveryItemDelivered]}>
        <View style={styles.deliveryMain}>
          <View style={[styles.unitBadge, isDelivered && styles.unitBadgeDelivered]}>
            <Text style={[styles.unitText, isDelivered && styles.unitTextDelivered]}>{delivery.unitNumber}</Text>
          </View>
          <View style={styles.deliveryDetails}>
            <Text style={[styles.customerName, isDelivered && styles.customerNameDelivered]} numberOfLines={1}>
              {delivery.customerName}
            </Text>
            <Text style={styles.productText}>
              {formatQuantity(delivery.quantity, delivery.unit)} {delivery.productName}
            </Text>
            {delivery.deliveryInstructions && (
              <Text style={styles.instructionsText} numberOfLines={2}>
                📝 {delivery.deliveryInstructions}
              </Text>
            )}
          </View>
          <View style={styles.deliveryRight}>
            <Text style={styles.amountText}>{formatCurrency(delivery.amount)}</Text>
            {isDelivered ? (
              <View style={styles.deliveredBadge}>
                <Text style={styles.deliveredCheckText}>✓</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.deliverButton}
                onPress={() => handleMarkDelivered(delivery)}
                disabled={processing}
              >
                <Text style={styles.deliverButtonText}>Deliver</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderFloorGroup = (floorGroup: FloorGroup) => {
    const pendingInFloor = floorGroup.deliveries.filter(d => d.status !== 'delivered').length;
    const allDone = pendingInFloor === 0;

    return (
      <View key={floorGroup.floor} style={styles.floorGroup}>
        <View style={[styles.floorHeader, allDone && styles.floorHeaderDone]}>
          <View style={styles.floorBadge}>
            <Text style={styles.floorBadgeText}>F{floorGroup.floor}</Text>
          </View>
          <Text style={styles.floorTitle}>Floor {floorGroup.floor}</Text>
          <Text style={[styles.floorCount, allDone && styles.floorCountDone]}>
            {allDone ? '✓ Done' : `${pendingInFloor} left`}
          </Text>
        </View>
        {floorGroup.deliveries.map(renderDeliveryItem)}
      </View>
    );
  };

  const renderBuildingStock = (building: BuildingGroup) => {
    const stockItems = Array.from(building.stockSummary.values());
    if (stockItems.length === 0) {
      return (
        <View style={styles.buildingStockDone}>
          <Text style={styles.buildingStockDoneIcon}>🎉</Text>
          <Text style={styles.buildingStockDoneText}>All deliveries completed!</Text>
        </View>
      );
    }

    return (
      <View style={styles.buildingStock}>
        <View style={styles.buildingStockHeader}>
          <Text style={styles.buildingStockIcon}>🎒</Text>
          <View style={styles.buildingStockTitleContainer}>
            <Text style={styles.buildingStockTitle}>CARRY INTO BUILDING</Text>
            <Text style={styles.buildingStockSubtitle}>{stockItems.length} product{stockItems.length > 1 ? 's' : ''}</Text>
          </View>
        </View>
        <View style={styles.stockGrid}>
          {stockItems.map((item, idx) => (
            <View key={idx} style={styles.stockCard}>
              <View style={styles.stockCardQuantity}>
                <Text style={styles.stockCardNumber}>{item.quantity}</Text>
                <Text style={styles.stockCardUnit}>{item.unit}</Text>
              </View>
              <Text style={styles.stockCardName} numberOfLines={2}>{item.name}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderBuildingCard = (building: BuildingGroup) => {
    const isExpanded = expandedBuildings.has(building.buildingId);
    const allDone = building.pendingCount === 0;
    const progress = building.totalDeliveries > 0
      ? (building.deliveredCount / building.totalDeliveries) * 100
      : 0;

    return (
      <View key={building.buildingId} style={[styles.buildingCard, allDone && styles.buildingCardDone]}>
        <TouchableOpacity
          style={styles.buildingHeader}
          onPress={() => toggleBuilding(building.buildingId)}
          activeOpacity={0.7}
        >
          <View style={styles.buildingIconContainer}>
            <Text style={styles.buildingIcon}>🏢</Text>
          </View>
          <View style={styles.buildingInfo}>
            <Text style={styles.buildingName}>{building.buildingName}</Text>
            <Text style={styles.societyName}>{building.societyName}</Text>
            {/* Mini Progress Bar */}
            <View style={styles.miniProgressContainer}>
              <View style={styles.miniProgressBg}>
                <View style={[styles.miniProgressFill, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.miniProgressText}>
                {building.deliveredCount}/{building.totalDeliveries}
              </Text>
            </View>
          </View>
          <View style={styles.buildingRight}>
            <View style={[styles.countBadge, allDone ? styles.countBadgeDone : styles.countBadgePending]}>
              <Text style={[styles.countText, allDone && styles.countTextDone]}>
                {allDone ? '✓' : building.pendingCount}
              </Text>
            </View>
            <Text style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</Text>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.buildingContent}>
            {renderBuildingStock(building)}
            {building.floors.map(renderFloorGroup)}
          </View>
        )}
      </View>
    );
  };

  return (
    <AppLayout>
      <AppBar
        title="Today's Deliveries"
        onBack={() => navigation.goBack()}
        variant="surface"
      />

      {/* Offline Banner */}
      {(!isOnline || usingCachedData || pendingCount > 0) && (
        <View style={[
          styles.offlineBanner, 
          !isOnline ? styles.offlineBannerOffline : styles.offlineBannerPending
        ]}>
          <Text style={styles.offlineBannerIcon}>
            {!isOnline ? '📴' : pendingCount > 0 ? '🔄' : '📦'}
          </Text>
          <View style={styles.offlineBannerTextContainer}>
            <Text style={styles.offlineBannerTitle}>
              {!isOnline ? 'Offline Mode' : pendingCount > 0 ? 'Pending Sync' : 'Cached Data'}
            </Text>
            <Text style={styles.offlineBannerSubtitle}>
              {!isOnline 
                ? 'Deliveries will sync when online' 
                : pendingCount > 0 
                  ? `${pendingCount} delivery update${pendingCount > 1 ? 's' : ''} pending`
                  : 'Showing cached deliveries'}
            </Text>
          </View>
          {isOnline && pendingCount > 0 && (
            <TouchableOpacity 
              style={styles.offlineSyncButton}
              onPress={() => syncPending()}
            >
              <Text style={styles.offlineSyncButtonText}>Sync</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchTodaysDeliveries();
            }}
            colors={[theme.colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
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
                {progressPercent === 100 ? 'All Done!' : 'Deliveries Progress'}
              </Text>
              <Text style={styles.progressSubtitle}>
                {totalStats.delivered} of {totalStats.total} completed
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

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>📦</Text>
            <Text style={styles.statValue}>{totalStats.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={[styles.statCard, styles.statCardPending]}>
            <Text style={styles.statIcon}>⏳</Text>
            <Text style={[styles.statValue, { color: '#F59E0B' }]}>{totalStats.pending}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={[styles.statCard, styles.statCardDone]}>
            <Text style={styles.statIcon}>✅</Text>
            <Text style={[styles.statValue, { color: '#10B981' }]}>{totalStats.delivered}</Text>
            <Text style={styles.statLabel}>Done</Text>
          </View>
        </View>

        {error && (
          <ErrorBanner message={error} onRetry={fetchTodaysDeliveries} />
        )}

        {loading ? (
          <SkeletonList count={4} showAvatar showBadges />
        ) : buildings.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconContainer}>
              <Text style={styles.emptyIcon}>📦</Text>
            </View>
            <Text style={styles.emptyTitle}>No Deliveries Today</Text>
            <Text style={styles.emptyDescription}>
              You have no scheduled deliveries for today. Enjoy your day off!
            </Text>
            <TouchableOpacity style={styles.refreshButton} onPress={fetchTodaysDeliveries}>
              <Text style={styles.refreshButtonText}>🔄 Refresh</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Total Stock Summary */}
            {totalStock.length > 0 && (
              <TouchableOpacity
                style={styles.totalStockCard}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setShowStockSummary(!showStockSummary);
                }}
                activeOpacity={0.9}
              >
                <View style={styles.totalStockHeader}>
                  <View style={styles.totalStockTitleRow}>
                    <Text style={styles.totalStockIcon}>📋</Text>
                    <View>
                      <Text style={styles.totalStockTitle}>Total Stock to Collect</Text>
                      <Text style={styles.totalStockSubtitle}>Collect before starting</Text>
                    </View>
                  </View>
                  <Text style={styles.expandArrow}>{showStockSummary ? '▼' : '▶'}</Text>
                </View>

                {showStockSummary && (
                  <View style={styles.totalStockContent}>
                    {totalStock.map((item, idx) => (
                      <View key={idx} style={styles.totalStockItem}>
                        <Text style={styles.totalStockName}>{item.name}</Text>
                        <View style={styles.totalStockBadge}>
                          <Text style={styles.totalStockQuantity}>
                            {formatQuantity(item.quantity, item.unit)}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            )}

            {/* Buildings Section */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>🏢 Buildings</Text>
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>{buildings.length}</Text>
              </View>
            </View>

            {buildings.map(renderBuildingCard)}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </AppLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 16,
  },

  // Offline Banner
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  offlineBannerOffline: {
    backgroundColor: '#FEE2E2',
  },
  offlineBannerPending: {
    backgroundColor: '#FEF3C7',
  },
  offlineBannerIcon: {
    fontSize: 20,
  },
  offlineBannerTextContainer: {
    flex: 1,
  },
  offlineBannerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  offlineBannerSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  offlineSyncButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  offlineSyncButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
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

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statCardPending: {
    backgroundColor: '#FFFBEB',
  },
  statCardDone: {
    backgroundColor: '#ECFDF5',
  },
  statIcon: {
    fontSize: 20,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 20,
  },
  refreshButton: {
    marginTop: 24,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  refreshButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },

  // Total Stock Card
  totalStockCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  totalStockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalStockTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  totalStockIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  totalStockTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  totalStockSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  expandArrow: {
    fontSize: 12,
    color: '#64748B',
  },
  totalStockContent: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  totalStockItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  totalStockName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#0F172A',
    marginRight: 12,
  },
  totalStockBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  totalStockQuantity: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.primary,
  },

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginRight: 8,
  },
  sectionBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  sectionBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary,
  },

  // Building Card
  buildingCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  buildingCardDone: {
    borderWidth: 2,
    borderColor: '#10B981',
  },
  buildingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  buildingIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  buildingIcon: {
    fontSize: 22,
  },
  buildingInfo: {
    flex: 1,
  },
  buildingName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  societyName: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  miniProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  miniProgressBg: {
    flex: 1,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    overflow: 'hidden',
    marginRight: 8,
  },
  miniProgressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 2,
  },
  miniProgressText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  buildingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countBadgePending: {
    backgroundColor: '#FEF3C7',
  },
  countBadgeDone: {
    backgroundColor: '#D1FAE5',
  },
  countText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F59E0B',
  },
  countTextDone: {
    color: '#10B981',
  },
  expandIcon: {
    fontSize: 12,
    color: '#94A3B8',
  },

  // Building Content
  buildingContent: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },

  // Building Stock
  buildingStock: {
    padding: 16,
    backgroundColor: '#F0F9FF',
  },
  buildingStockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  buildingStockIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  buildingStockTitleContainer: {
    flex: 1,
  },
  buildingStockTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369A1',
    letterSpacing: 0.5,
  },
  buildingStockSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  buildingStockDone: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#ECFDF5',
  },
  buildingStockDoneIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  buildingStockDoneText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#059669',
  },
  stockGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  stockCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    minWidth: 80,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  stockCardQuantity: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  stockCardNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  stockCardUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary,
    marginLeft: 2,
  },
  stockCardName: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
  },

  // Floor Group
  floorGroup: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  floorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#F8FAFC',
  },
  floorHeaderDone: {
    backgroundColor: '#F0FDF4',
  },
  floorBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  floorBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  floorTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  floorCount: {
    fontSize: 12,
    color: '#F59E0B',
    fontWeight: '500',
  },
  floorCountDone: {
    color: '#10B981',
  },

  // Delivery Item
  deliveryItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: 'white',
  },
  deliveryItemDelivered: {
    backgroundColor: '#FAFAFA',
    opacity: 0.8,
  },
  deliveryMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unitBadge: {
    width: 48,
    height: 40,
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  unitBadgeDelivered: {
    backgroundColor: '#D1FAE5',
  },
  unitText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  unitTextDelivered: {
    color: '#059669',
  },
  deliveryDetails: {
    flex: 1,
  },
  customerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  customerNameDelivered: {
    color: '#64748B',
  },
  productText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  instructionsText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
    fontStyle: 'italic',
  },
  deliveryRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  amountText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  deliverButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  deliverButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
  },
  deliveredBadge: {
    width: 28,
    height: 28,
    backgroundColor: '#D1FAE5',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deliveredCheckText: {
    fontSize: 14,
    color: '#059669',
    fontWeight: '700',
  },
});
