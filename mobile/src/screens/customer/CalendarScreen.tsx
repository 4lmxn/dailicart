import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLayout } from '../../components/AppLayout';
import { AppBar } from '../../components/AppBar';
import { theme } from '../../theme';
import { formatCurrency, getLocalDateString } from '../../utils/helpers';
import { useAuthStore } from '../../store/authStore';
import { DeliveryService } from '../../services/api/deliveries';
import { supabase } from '../../services/supabase';

const MONTHLY_SERVICE_CHARGE = 80;

interface Product {
  id: string;
  name: string;
  price: number;
  unit: string;
  category: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface DeliveryEvent {
  date: string;
  items: Array<{
    product: string;
    quantity: string;
    price: number;
  }>;
  status: 'scheduled' | 'delivered' | 'skipped' | 'paused' | 'missed' | 'pending' | 'assigned' | 'in_transit';
}

interface CalendarScreenProps {
  onBack: () => void;
}

export const CalendarScreen: React.FC<CalendarScreenProps> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [events, setEvents] = useState<Record<string, DeliveryEvent>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showVacationModal, setShowVacationModal] = useState(false);
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [vacationStart, setVacationStart] = useState<Date | null>(null);
  const [vacationEnd, setVacationEnd] = useState<Date | null>(null);
  const [selectingVacationDate, setSelectingVacationDate] = useState<'start' | 'end' | null>(null);
  const [vacationMonth, setVacationMonth] = useState(new Date());
  const [applyingVacation, setApplyingVacation] = useState(false);
  const [modifyQuantity, setModifyQuantity] = useState(1);
  const [additionalItems, setAdditionalItems] = useState<Array<{ id: string; quantity: number }>>([]);
  const [subscribedItems, setSubscribedItems] = useState<Array<{ id: string; productId: string; name: string; unit: string; price: number; originalQty: number; quantity: number }>>([]);
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);

  // Fetch available products from database
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, price, unit, category')
          .eq('is_active', true)
          .order('category')
          .order('name');

        if (error) {
          console.error('Error fetching products:', error);
          return;
        }

        if (data) {
          setAvailableProducts(data);
        }
      } catch (e) {
        console.error('Error fetching products:', e);
      }
    };
    fetchProducts();
  }, []);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek };
  };

  const getDeliveryForDate = (date: Date): DeliveryEvent | undefined => {
    const dateStr = getLocalDateString(date);
    return events[dateStr];
  };

  const monthRange = (date: Date) => {
    const start = getLocalDateString(new Date(date.getFullYear(), date.getMonth(), 1));
    const end = getLocalDateString(new Date(date.getFullYear(), date.getMonth() + 1, 0));
    return { start, end };
  };

  const loadMonth = useCallback(async (date: Date) => {
    if (!user?.id) return;
    setLoading(true);
    setEvents({}); // Clear events first to force re-render
    try {
      const { start, end } = monthRange(date);
      const data = await DeliveryService.getCalendar(user.id, start, end);
      const map: Record<string, DeliveryEvent> = {};
      data.forEach((e) => { map[e.date] = e as DeliveryEvent; });
      setEvents(map);
    } catch (e) {
      console.error('Calendar load error', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Reload calendar when screen comes into focus (e.g., after changing frequency)
  useFocusEffect(
    useCallback(() => {
      loadMonth(currentDate);
    }, [loadMonth, currentDate])
  );

  useEffect(() => {
    loadMonth(currentDate);
  }, [user?.id, currentDate, loadMonth]);

  const changeMonth = (direction: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(currentDate.getMonth() + direction);
    setCurrentDate(newDate);
    // loadMonth(newDate) will run via effect
  };

  const renderCalendar = () => {
    const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentDate);
    const days = [];

    // Empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(<View key={`empty-${i}`} style={styles.dayCell} />);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      const delivery = getDeliveryForDate(date);
      const isToday =
        date.toDateString() === new Date().toDateString();
      const isSelected =
        selectedDate && date.toDateString() === selectedDate.toDateString();

      // Get status-based cell style
      const getStatusCellStyle = () => {
        if (!delivery) return null;
        switch (delivery.status) {
          case 'scheduled':
          case 'pending':
          case 'assigned':
          case 'in_transit':
            return styles.scheduledCell;
          case 'delivered':
            return styles.deliveredCell;
          case 'paused':
            return styles.pausedCell;
          case 'skipped':
            return styles.skippedCell;
          case 'missed':
            return styles.missedCell;
          default:
            return null;
        }
      };

      // Get status-based text style
      const getStatusTextStyle = () => {
        if (!delivery) return null;
        switch (delivery.status) {
          case 'scheduled':
          case 'pending':
          case 'assigned':
          case 'in_transit':
            return styles.scheduledText;
          case 'delivered':
            return styles.deliveredText;
          case 'paused':
            return styles.pausedText;
          case 'skipped':
            return styles.skippedText;
          case 'missed':
            return styles.missedText;
          default:
            return null;
        }
      };

      days.push(
        <TouchableOpacity
          key={day}
          style={styles.dayCell}
          onPress={() => setSelectedDate(date)}
        >
          <View
            style={[
              styles.dayCellInner,
              getStatusCellStyle(),
              isToday && styles.todayCell,
              isSelected && styles.selectedCell,
            ]}
          >
            <Text
              style={[
                styles.dayText,
                getStatusTextStyle(),
                isToday && !delivery && styles.todayText,
                isSelected && styles.selectedText,
              ]}
            >
              {day}
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    return days;
  };

  const selectedDelivery = selectedDate ? getDeliveryForDate(selectedDate) : null;

  // Check if same-day modification cutoff (4 AM) has passed
  const isSameDayCutoffPassed = (date: Date): boolean => {
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDay = new Date(date);
    selectedDay.setHours(0, 0, 0, 0);

    // If it's the same day and current time is past 4 AM, cutoff has passed
    if (selectedDay.getTime() === today.getTime()) {
      const cutoffHour = 4; // 4 AM
      return now.getHours() >= cutoffHour;
    }
    return false;
  };

  const handleSkipDay = async () => {
    if (!selectedDate || !user?.id) return;

    const dateStr = getLocalDateString(selectedDate);

    // Check if date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
      Alert.alert('Cannot Skip', 'You cannot skip a past delivery.');
      return;
    }

    // Check if same-day cutoff has passed
    if (isSameDayCutoffPassed(selectedDate)) {
      Alert.alert(
        'Cutoff Time Passed',
        'Same-day delivery modifications are not allowed after 4 AM. Please contact support for assistance.'
      );
      return;
    }

    Alert.alert(
      'Skip Delivery',
      `Skip delivery for ${selectedDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}?\n\nNo charges will apply for this day.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip',
          style: 'destructive',
          onPress: async () => {
            try {
              // First, check if orders exist for this date (any status)
              const { data: existingOrders, error: checkError } = await supabase
                .from('orders')
                .select('id, status')
                .eq('user_id', user.id)
                .eq('delivery_date', dateStr);

              if (checkError) throw checkError;

              // Check if already skipped
              const alreadySkipped = existingOrders?.every(o => o.status === 'skipped');
              if (alreadySkipped && existingOrders && existingOrders.length > 0) {
                Alert.alert('Already Skipped', 'This day is already skipped.');
                return;
              }

              if (existingOrders && existingOrders.length > 0) {
                // Update existing orders to 'skipped' (only those that can be skipped)
                const { error } = await supabase
                  .from('orders')
                  .update({ status: 'skipped', skip_reason: 'Skipped by customer' })
                  .eq('user_id', user.id)
                  .eq('delivery_date', dateStr)
                  .in('status', ['scheduled', 'pending', 'assigned', 'in_transit']);

                if (error) throw error;
              } else {
                // No orders exist yet - create skipped orders from active subscriptions
                const { data: subscriptions } = await supabase
                  .from('subscriptions')
                  .select('id, product_id, quantity, address_id')
                  .eq('user_id', user.id)
                  .eq('status', 'active');

                if (subscriptions && subscriptions.length > 0) {
                  // Get product prices
                  const productIds = subscriptions.map(s => s.product_id);
                  const { data: products } = await supabase
                    .from('products')
                    .select('id, price')
                    .in('id', productIds);

                  const priceMap = new Map((products || []).map(p => [p.id, p.price]));

                  // Generate unique order numbers
                  const timestamp = Date.now();

                  // Create skipped orders for each subscription
                  const ordersToInsert = subscriptions.map((sub, idx) => {
                    const unitPrice = priceMap.get(sub.product_id) || 0;
                    const qty = sub.quantity || 1;
                    return {
                      order_number: `ORD-${timestamp}-${idx}-${Math.random().toString(36).substr(2, 6)}`,
                      user_id: user.id,
                      address_id: sub.address_id,
                      product_id: sub.product_id,
                      quantity: qty,
                      unit_price: unitPrice,
                      total_amount: qty * unitPrice,
                      delivery_date: dateStr,
                      status: 'skipped',
                      subscription_id: sub.id,
                      skip_reason: 'Skipped by customer',
                    };
                  });

                  const { error: insertError } = await supabase
                    .from('orders')
                    .insert(ordersToInsert);

                  if (insertError) throw insertError;
                }
              }

              Alert.alert('✓ Delivery Skipped', `Your delivery for ${selectedDate.toLocaleDateString('en-IN')} has been skipped. No charges will apply.`);
              setSelectedDate(null);
              // Small delay to ensure DB update propagates, then refresh
              setTimeout(() => loadMonth(currentDate), 300);
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to skip delivery');
            }
          }
        }
      ]
    );
  };

  const handleUnskipDay = async () => {
    if (!selectedDate || !user?.id) return;

    const dateStr = getLocalDateString(selectedDate);

    // Check if date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
      Alert.alert('Cannot Resume', 'You cannot resume a past delivery.');
      return;
    }

    // Check if same-day cutoff has passed
    if (isSameDayCutoffPassed(selectedDate)) {
      Alert.alert(
        'Cutoff Time Passed',
        'Same-day delivery modifications are not allowed after 4 AM. Please contact support for assistance.'
      );
      return;
    }

    Alert.alert(
      'Resume Delivery',
      `Resume delivery for ${selectedDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resume',
          onPress: async () => {
            try {
              // Update skipped orders back to scheduled
              const { error } = await supabase
                .from('orders')
                .update({ status: 'scheduled', skip_reason: null })
                .eq('user_id', user.id)
                .eq('delivery_date', dateStr)
                .eq('status', 'skipped');

              if (error) throw error;

              Alert.alert('✓ Delivery Resumed', `Your delivery for ${selectedDate.toLocaleDateString('en-IN')} has been resumed.`);
              setSelectedDate(null);
              setTimeout(() => loadMonth(currentDate), 300);
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to resume delivery');
            }
          }
        }
      ]
    );
  };

  const handleModifyOrder = async () => {
    if (!selectedDate || !user?.id) return;

    // Check if date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
      Alert.alert('Cannot Modify', 'You cannot modify a past delivery.');
      return;
    }

    // Check if same-day cutoff has passed
    if (isSameDayCutoffPassed(selectedDate)) {
      Alert.alert(
        'Cutoff Time Passed',
        'Same-day delivery modifications are not allowed after 4 AM. Please contact support for assistance.'
      );
      return;
    }

    if (selectedDelivery) {
      setAdditionalItems([]);

      // Load subscribed items for this date so user can modify them
      const dateStr = getLocalDateString(selectedDate);

      // Check if there are existing orders for this date
      const { data: existingOrders } = await supabase
        .from('orders')
        .select('id, product_id, quantity, products(id, name, price, unit)')
        .eq('user_id', user.id)
        .eq('delivery_date', dateStr)
        .in('status', ['scheduled', 'pending', 'assigned', 'in_transit']);

      if (existingOrders && existingOrders.length > 0) {
        // Use existing orders
        const items = existingOrders.map(order => {
          const prod = order.products as any;
          return {
            id: order.id,
            productId: order.product_id,
            name: prod?.name || 'Product',
            unit: prod?.unit || '',
            price: prod?.price || 0,
            originalQty: order.quantity,
            quantity: order.quantity,
          };
        });
        setSubscribedItems(items);
      } else {
        // Generate from subscriptions
        const { data: subscriptions } = await supabase
          .from('subscriptions')
          .select('id, product_id, quantity, products(id, name, price, unit)')
          .eq('user_id', user.id)
          .eq('status', 'active');

        if (subscriptions && subscriptions.length > 0) {
          const items = subscriptions.map(sub => {
            const prod = sub.products as any;
            return {
              id: sub.id,
              productId: sub.product_id,
              name: prod?.name || 'Product',
              unit: prod?.unit || '',
              price: prod?.price || 0,
              originalQty: sub.quantity || 1,
              quantity: sub.quantity || 1,
            };
          });
          setSubscribedItems(items);
        } else {
          setSubscribedItems([]);
        }
      }

      setShowModifyModal(true);
    }
  };

  const handleSaveModification = async () => {
    if (!selectedDate || !user?.id) return;

    const dateStr = getLocalDateString(selectedDate);

    try {
      // Get user's address for new orders
      const { data: userAddress } = await supabase
        .from('addresses')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_default', true)
        .single();

      let addressId = userAddress?.id;
      if (!addressId) {
        const { data: anyAddress } = await supabase
          .from('addresses')
          .select('id')
          .eq('user_id', user.id)
          .limit(1)
          .single();
        addressId = anyAddress?.id;
      }

      if (!addressId) {
        Alert.alert('Error', 'No delivery address found. Please add an address first.');
        return;
      }

      // Check for existing orders for this date
      const { data: existingOrders } = await supabase
        .from('orders')
        .select('id, product_id')
        .eq('user_id', user.id)
        .eq('delivery_date', dateStr)
        .in('status', ['scheduled', 'pending', 'assigned', 'in_transit']);

      const existingOrderMap = new Map((existingOrders || []).map(o => [o.product_id, o.id]));

      // Process each subscribed item
      const timestamp = Date.now();
      let orderIdx = 0;

      for (const item of subscribedItems) {
        const existingOrderId = existingOrderMap.get(item.productId);

        if (item.quantity === 0) {
          // Skip this product for this day - either update existing or create skipped order
          if (existingOrderId) {
            await supabase
              .from('orders')
              .update({ status: 'skipped', skip_reason: 'Modified by customer' })
              .eq('id', existingOrderId);
          } else {
            // Create a skipped order
            await supabase
              .from('orders')
              .insert({
                order_number: `ORD-${timestamp}-${orderIdx++}-${Math.random().toString(36).substr(2, 6)}`,
                user_id: user.id,
                address_id: addressId,
                product_id: item.productId,
                quantity: item.originalQty,
                unit_price: item.price,
                total_amount: item.originalQty * item.price,
                delivery_date: dateStr,
                status: 'skipped',
                skip_reason: 'Modified by customer',
              });
          }
        } else if (existingOrderId) {
          // Update existing order - fetch server-side price to prevent manipulation
          const { data: productData } = await supabase
            .from('products')
            .select('price')
            .eq('id', item.productId)
            .single();

          const serverPrice = productData?.price || item.price;

          await supabase
            .from('orders')
            .update({
              quantity: item.quantity,
              unit_price: serverPrice,
              total_amount: item.quantity * serverPrice,
            })
            .eq('id', existingOrderId)
            .eq('user_id', user.id); // Ownership check
        } else {
          // Create new order with modified quantity - fetch server-side price
          const { data: productData } = await supabase
            .from('products')
            .select('price')
            .eq('id', item.productId)
            .single();

          const serverPrice = productData?.price || item.price;

          await supabase
            .from('orders')
            .insert({
              order_number: `ORD-${timestamp}-${orderIdx++}-${Math.random().toString(36).substr(2, 6)}`,
              user_id: user.id,
              address_id: addressId,
              product_id: item.productId,
              quantity: item.quantity,
              unit_price: serverPrice,
              total_amount: item.quantity * serverPrice,
              delivery_date: dateStr,
              status: 'scheduled',
            });
        }
      }

      // Add extra items as one-time orders (not linked to subscription)
      if (additionalItems.length > 0) {
        // Get prices for extra items
        const extraProductIds = additionalItems.map(i => i.id);
        const { data: extraProductsData } = await supabase
          .from('products')
          .select('id, price')
          .in('id', extraProductIds);

        const extraPriceMap = new Map((extraProductsData || []).map(p => [p.id, p.price]));

        const extraTimestamp = Date.now();
        const extraOrders = additionalItems.map((item, idx) => {
          const unitPrice = extraPriceMap.get(item.id) || 0;
          return {
            order_number: `ORD-${extraTimestamp}-EX${idx}`,
            user_id: user.id,
            address_id: addressId,
            product_id: item.id,
            quantity: item.quantity,
            unit_price: unitPrice,
            total_amount: item.quantity * unitPrice,
            delivery_date: dateStr,
            status: 'scheduled',
            subscription_id: null, // One-time order, not from subscription
          };
        });

        const { error: extraError } = await supabase
          .from('orders')
          .insert(extraOrders);

        if (extraError) throw extraError;
      }

      // Build success message
      let successMsg = `Order updated for ${selectedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`;

      // Show subscribed item changes
      const changedItems = subscribedItems.filter(i => i.quantity !== i.originalQty);
      if (changedItems.length > 0) {
        successMsg += '\n\nSubscription items:';
        changedItems.forEach(item => {
          if (item.quantity === 0) {
            successMsg += `\n• ${item.name}: Skipped`;
          } else {
            successMsg += `\n• ${item.name}: ${item.originalQty} → ${item.quantity}`;
          }
        });
      }

      if (additionalItems.length > 0) {
        const extraProductNames = additionalItems.map(item => {
          const prod = availableProducts.find(p => p.id === item.id);
          return `${prod?.name || 'Item'} x${item.quantity}`;
        });
        successMsg += `\n\nExtra items added:\n• ${extraProductNames.join('\n• ')}`;
      }

      Alert.alert('✓ Order Modified', successMsg, [{ text: 'Got it!' }]);

      setShowModifyModal(false);
      setSelectedDate(null);
      setAdditionalItems([]); // Reset extra items
      setSubscribedItems([]); // Reset subscribed items
      // Small delay to ensure DB update propagates, then refresh
      setTimeout(() => loadMonth(currentDate), 300);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to modify order');
    }
  };

  return (
    <AppLayout>
      <AppBar
        title="Delivery Calendar"
        onBack={onBack}
        variant="surface"
        actions={[{ icon: '🏖️', onPress: () => setShowVacationModal(true) }]}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await loadMonth(currentDate);
              setRefreshing(false);
            }}
          />
        }
      >
        {/* Month Navigation */}
        <View style={styles.monthHeader}>
          <TouchableOpacity style={styles.monthButton} onPress={() => changeMonth(-1)}>
            <Text style={styles.monthButtonText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.monthTitle}>
            {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
          </Text>
          <TouchableOpacity style={styles.monthButton} onPress={() => changeMonth(1)}>
            <Text style={styles.monthButtonText}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendBox, { backgroundColor: '#0D9488' }]} />
            <Text style={styles.legendText}>Scheduled</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendBox, { backgroundColor: '#3B82F6' }]} />
            <Text style={styles.legendText}>Delivered</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendBox, { backgroundColor: '#F59E0B' }]} />
            <Text style={styles.legendText}>Paused</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendBox, { backgroundColor: '#E2E8F0' }]} />
            <Text style={styles.legendText}>Skipped</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendBox, { backgroundColor: '#EF4444' }]} />
            <Text style={styles.legendText}>Missed</Text>
          </View>
        </View>

        {/* Calendar */}
        <View style={styles.calendar}>
          {/* Day headers */}
          <View style={styles.dayHeaderRow}>
            {DAYS.map((day) => (
              <View key={day} style={styles.dayHeaderCell}>
                <Text style={styles.dayHeaderText}>{day}</Text>
              </View>
            ))}
          </View>

          {/* Calendar days */}
          <View style={styles.daysGrid}>
            {loading ? (
              <Text style={{ color: '#64748B', padding: 20 }}>Loading calendar...</Text>
            ) : (
              renderCalendar()
            )}
          </View>
        </View>

        {/* Selected Date Details */}
        {selectedDelivery ? (
          <View style={styles.detailsCard}>
            <Text style={styles.detailsDate}>
              {selectedDate?.toLocaleDateString('en-IN', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>
                {['scheduled', 'pending', 'assigned'].includes(selectedDelivery.status) && '📦 Scheduled'}
                {selectedDelivery.status === 'in_transit' && '🚚 On the way'}
                {selectedDelivery.status === 'delivered' && '✅ Delivered'}
                {selectedDelivery.status === 'paused' && '⏸️ Paused'}
                {selectedDelivery.status === 'skipped' && '⏭️ Skipped'}
                {selectedDelivery.status === 'missed' && '❌ Not Delivered'}
              </Text>
            </View>

            <View style={styles.itemsList}>
              {selectedDelivery.items.map((item, idx) => (
                <View key={idx} style={styles.itemRow}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemProduct}>{item.product}</Text>
                    <Text style={styles.itemQuantity}>{item.quantity}</Text>
                  </View>
                  <Text style={styles.itemPrice}>{formatCurrency(item.price)}</Text>
                </View>
              ))}
            </View>

            {['scheduled', 'pending', 'assigned', 'in_transit'].includes(selectedDelivery.status) && (
              <View style={styles.actionButtons}>
                {selectedDate && isSameDayCutoffPassed(selectedDate) ? (
                  <View style={[styles.actionButtonSecondary, { flex: 1, opacity: 0.5 }]}>
                    <Text style={[styles.actionButtonSecondaryText, { textAlign: 'center' }]}>
                      ⏰ Modifications locked after 4 AM
                    </Text>
                  </View>
                ) : (
                  <>
                    <TouchableOpacity
                      style={styles.actionButtonSecondary}
                      onPress={handleSkipDay}
                    >
                      <Text style={styles.actionButtonSecondaryText}>Skip This Day</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionButtonPrimary}
                      onPress={handleModifyOrder}
                    >
                      <Text style={styles.actionButtonPrimaryText}>Modify Order</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            {/* Show Resume button for skipped future orders */}
            {selectedDelivery.status === 'skipped' && selectedDate && selectedDate >= new Date(new Date().setHours(0, 0, 0, 0)) && (
              <View style={styles.actionButtons}>
                {isSameDayCutoffPassed(selectedDate) ? (
                  <View style={[styles.actionButtonSecondary, { flex: 1, opacity: 0.5 }]}>
                    <Text style={[styles.actionButtonSecondaryText, { textAlign: 'center' }]}>
                      ⏰ Modifications locked after 4 AM
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.actionButtonPrimary}
                    onPress={handleUnskipDay}
                  >
                    <Text style={styles.actionButtonPrimaryText}>Resume Delivery</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        ) : (
          selectedDate && (
            <View style={styles.detailsCard}>
              <Text style={styles.detailsDate}>
                {selectedDate?.toLocaleDateString('en-IN', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </Text>
              <Text style={{ color: theme.colors.textSecondary }}>
                No deliveries loaded for this day.
              </Text>
            </View>
          )
        )}

        {/* Quick Stats */}
        {/* Stats placeholder removed; will populate from API later */}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Vacation Mode Modal */}
      <Modal
        visible={showVacationModal}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setShowVacationModal(false);
          setSelectingVacationDate(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🏖️ Vacation Mode</Text>
              <TouchableOpacity onPress={() => {
                setShowVacationModal(false);
                setSelectingVacationDate(null);
              }}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalDescription}>
                Pause all your subscriptions for a specific date range. Perfect for vacations or
                when you're away.
              </Text>

              <View style={styles.dateRangeSelector}>
                <View style={styles.dateInput}>
                  <Text style={styles.dateLabel}>Start Date</Text>
                  <TouchableOpacity
                    style={[styles.datePicker, selectingVacationDate === 'start' && { borderColor: theme.colors.primary, borderWidth: 2 }]}
                    onPress={() => setSelectingVacationDate(selectingVacationDate === 'start' ? null : 'start')}
                  >
                    <Text style={styles.datePickerText}>
                      {vacationStart
                        ? vacationStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : 'Tap to select'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.dateInput}>
                  <Text style={styles.dateLabel}>End Date</Text>
                  <TouchableOpacity
                    style={[styles.datePicker, selectingVacationDate === 'end' && { borderColor: theme.colors.primary, borderWidth: 2 }]}
                    onPress={() => setSelectingVacationDate(selectingVacationDate === 'end' ? null : 'end')}
                  >
                    <Text style={styles.datePickerText}>
                      {vacationEnd
                        ? vacationEnd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : 'Tap to select'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Inline Calendar for Date Selection */}
              {selectingVacationDate && (
                <View style={{ marginTop: 16, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <TouchableOpacity onPress={() => {
                      const newDate = new Date(vacationMonth);
                      newDate.setMonth(newDate.getMonth() - 1);
                      setVacationMonth(newDate);
                    }}>
                      <Text style={{ fontSize: 20, color: theme.colors.primary }}>‹</Text>
                    </TouchableOpacity>
                    <Text style={{ fontSize: 16, fontWeight: '600' }}>
                      {MONTHS[vacationMonth.getMonth()]} {vacationMonth.getFullYear()}
                    </Text>
                    <TouchableOpacity onPress={() => {
                      const newDate = new Date(vacationMonth);
                      newDate.setMonth(newDate.getMonth() + 1);
                      setVacationMonth(newDate);
                    }}>
                      <Text style={{ fontSize: 20, color: theme.colors.primary }}>›</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                    {DAYS.map(day => (
                      <View key={day} style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#64748B' }}>{day}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {(() => {
                      const year = vacationMonth.getFullYear();
                      const month = vacationMonth.getMonth();
                      const firstDay = new Date(year, month, 1);
                      const lastDay = new Date(year, month + 1, 0);
                      const daysInMonth = lastDay.getDate();
                      const startingDayOfWeek = firstDay.getDay();
                      const cells = [];

                      for (let i = 0; i < startingDayOfWeek; i++) {
                        cells.push(<View key={`empty-${i}`} style={{ width: '14.28%', height: 36 }} />);
                      }

                      const today = new Date();
                      today.setHours(0, 0, 0, 0);

                      for (let day = 1; day <= daysInMonth; day++) {
                        const date = new Date(year, month, day);
                        const isPast = date < today;
                        const isSelected = (selectingVacationDate === 'start' && vacationStart?.toDateString() === date.toDateString()) ||
                          (selectingVacationDate === 'end' && vacationEnd?.toDateString() === date.toDateString());
                        const isInRange = vacationStart && vacationEnd && date >= vacationStart && date <= vacationEnd;

                        cells.push(
                          <TouchableOpacity
                            key={day}
                            style={{
                              width: '14.28%',
                              height: 36,
                              justifyContent: 'center',
                              alignItems: 'center',
                            }}
                            disabled={isPast}
                            onPress={() => {
                              if (selectingVacationDate === 'start') {
                                setVacationStart(date);
                                if (vacationEnd && date > vacationEnd) {
                                  setVacationEnd(null);
                                }
                                setSelectingVacationDate('end');
                              } else {
                                if (vacationStart && date < vacationStart) {
                                  Alert.alert('Invalid Date', 'End date must be after start date');
                                  return;
                                }
                                setVacationEnd(date);
                                setSelectingVacationDate(null);
                              }
                            }}
                          >
                            <View style={{
                              width: 32,
                              height: 32,
                              borderRadius: 16,
                              justifyContent: 'center',
                              alignItems: 'center',
                              backgroundColor: isSelected ? theme.colors.primary : isInRange ? '#E0F2FE' : 'transparent',
                            }}>
                              <Text style={{
                                fontSize: 14,
                                color: isPast ? '#CBD5E1' : isSelected ? 'white' : '#1E293B',
                                fontWeight: isSelected ? '600' : '400',
                              }}>
                                {day}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      }

                      return cells;
                    })()}
                  </View>
                </View>
              )}

              <View style={styles.vacationInfo}>
                <Text style={styles.vacationInfoText}>
                  💡 All deliveries will be paused. No charges during this period.
                </Text>
                {vacationStart && vacationEnd && (
                  <Text style={[styles.vacationInfoText, { marginTop: 8, fontWeight: '600' }]}>
                    📅 {Math.ceil((vacationEnd.getTime() - vacationStart.getTime()) / (1000 * 60 * 60 * 24)) + 1} days selected
                  </Text>
                )}
              </View>

              <TouchableOpacity
                style={[styles.modalApplyButton, (!vacationStart || !vacationEnd || applyingVacation) && { opacity: 0.5 }]}
                disabled={!vacationStart || !vacationEnd || applyingVacation}
                onPress={async () => {
                  if (!user?.id || !vacationStart || !vacationEnd) return;

                  setApplyingVacation(true);
                  try {
                    const startStr = getLocalDateString(vacationStart);
                    const endStr = getLocalDateString(vacationEnd);

                    // Update all active subscriptions with pause dates
                    const { error } = await supabase
                      .from('subscriptions')
                      .update({
                        pause_start_date: startStr,
                        pause_end_date: endStr,
                      })
                      .eq('user_id', user.id)
                      .eq('status', 'active');

                    if (error) throw error;

                    // Also mark any already-generated orders in the vacation period as skipped
                    const { error: ordersError } = await supabase
                      .from('orders')
                      .update({ status: 'skipped', skip_reason: 'Vacation mode' })
                      .eq('user_id', user.id)
                      .gte('delivery_date', startStr)
                      .lte('delivery_date', endStr)
                      .in('status', ['scheduled', 'pending', 'assigned']);

                    if (ordersError) console.error('Failed to skip vacation orders:', ordersError);

                    Alert.alert(
                      '🏖️ Vacation Mode Applied!',
                      `Your deliveries are paused from ${vacationStart.toLocaleDateString('en-IN')} to ${vacationEnd.toLocaleDateString('en-IN')}. Any scheduled orders in this period have been cancelled.`,
                      [{
                        text: 'OK', onPress: () => {
                          setShowVacationModal(false);
                          setVacationStart(null);
                          setVacationEnd(null);
                          setSelectingVacationDate(null);
                          setTimeout(() => loadMonth(currentDate), 300);
                        }
                      }]
                    );
                  } catch (e: any) {
                    Alert.alert('Error', e.message || 'Failed to apply vacation mode');
                  } finally {
                    setApplyingVacation(false);
                  }
                }}
              >
                <Text style={styles.modalApplyButtonText}>
                  {applyingVacation ? 'Applying...' : 'Apply Vacation Mode'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modify Order Modal */}
      <Modal
        visible={showModifyModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowModifyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Modify Order</Text>
              <TouchableOpacity onPress={() => setShowModifyModal(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedDelivery && (
              <>
                <Text style={styles.modalDescription}>
                  Modifying delivery for {selectedDate?.toLocaleDateString('en-IN', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </Text>

                {/* Subscribed Items - Editable */}
                <Text style={styles.modalLabel}>Your Subscribed Items</Text>
                {subscribedItems.length === 0 ? (
                  <Text style={styles.noProductsText}>No subscribed items for this day</Text>
                ) : (
                  <View style={{ marginBottom: 16 }}>
                    {subscribedItems.map((item) => (
                      <View key={item.id} style={styles.productItem}>
                        <View style={styles.productInfo}>
                          <Text style={styles.productName}>{item.name}</Text>
                          <Text style={styles.productDetails}>
                            {item.unit} — {formatCurrency(item.price)} each
                          </Text>
                        </View>
                        <View style={styles.quantityControls}>
                          <TouchableOpacity
                            style={[styles.qtyButton, item.quantity === 0 && { backgroundColor: '#E2E8F0' }]}
                            onPress={() => {
                              setSubscribedItems(prev =>
                                prev.map(i => i.id === item.id ? { ...i, quantity: Math.max(0, i.quantity - 1) } : i)
                              );
                            }}
                          >
                            <Text style={[styles.qtyButtonText, item.quantity === 0 && { color: '#64748B' }]}>−</Text>
                          </TouchableOpacity>
                          <Text style={[styles.qtyText, item.quantity === 0 && { color: '#EF4444' }]}>
                            {item.quantity === 0 ? 'Skip' : item.quantity}
                          </Text>
                          <TouchableOpacity
                            style={styles.qtyButton}
                            onPress={() => {
                              setSubscribedItems(prev =>
                                prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i)
                              );
                            }}
                          >
                            <Text style={styles.qtyButtonText}>+</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                <Text style={styles.modalLabel}>Add Extra Items (One-time)</Text>
                <ScrollView style={styles.productList} nestedScrollEnabled>
                  {availableProducts.length === 0 ? (
                    <Text style={styles.noProductsText}>Loading products...</Text>
                  ) : (
                    availableProducts
                      .filter(p => !subscribedItems.some(s => s.productId === p.id))  // Hide already subscribed products
                      .map((product) => {
                        const currentQty = additionalItems.find(i => i.id === product.id)?.quantity || 0;
                        return (
                          <View key={product.id} style={styles.productItem}>
                            <View style={styles.productInfo}>
                              <Text style={styles.productName}>{product.name}</Text>
                              <Text style={styles.productDetails}>
                                {product.unit} — {formatCurrency(product.price)}
                              </Text>
                            </View>
                            {currentQty > 0 ? (
                              <View style={styles.quantityControls}>
                                <TouchableOpacity
                                  style={styles.qtyButton}
                                  onPress={() => {
                                    setAdditionalItems(prev =>
                                      prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity - 1 } : i)
                                        .filter(i => i.quantity > 0)
                                    );
                                  }}
                                >
                                  <Text style={styles.qtyButtonText}>−</Text>
                                </TouchableOpacity>
                                <Text style={styles.qtyText}>{currentQty}</Text>
                                <TouchableOpacity
                                  style={styles.qtyButton}
                                  onPress={() => {
                                    setAdditionalItems(prev =>
                                      prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i)
                                    );
                                  }}
                                >
                                  <Text style={styles.qtyButtonText}>+</Text>
                                </TouchableOpacity>
                              </View>
                            ) : (
                              <TouchableOpacity
                                style={styles.addButton}
                                onPress={() => setAdditionalItems(prev => [...prev, { id: product.id, quantity: 1 }])}
                              >
                                <Text style={styles.addButtonText}>Add</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        );
                      })
                  )}
                </ScrollView>

                <View style={styles.modifyInfo}>
                  <Text style={styles.modifyInfoText}>
                    💡 Additional items charged at one-time prices. Subscribe to save more! Monthly service charge: ₹{MONTHLY_SERVICE_CHARGE}
                  </Text>
                </View>

                <TouchableOpacity style={styles.modalApplyButton} onPress={handleSaveModification}>
                  <Text style={styles.modalApplyButtonText}>Save Changes</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </AppLayout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 20,
    color: '#1E293B',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  vacationButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vacationButtonText: {
    fontSize: 20,
  },
  content: {
    flex: 1,
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    marginTop: 16,
    marginHorizontal: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  monthButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthButtonText: {
    fontSize: 24,
    color: '#0D9488',
    fontWeight: '600',
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
    marginVertical: 4,
  },
  legendBox: {
    width: 14,
    height: 14,
    borderRadius: 4,
    marginRight: 6,
  },
  legendText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  calendar: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  dayHeaderRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: 'center',
  },
  dayHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 4,
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    padding: 2,
  },
  dayCellInner: {
    width: '90%',
    height: '90%',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Status-based cell backgrounds - updated to teal theme
  scheduledCell: {
    backgroundColor: '#0D9488',
  },
  deliveredCell: {
    backgroundColor: '#3B82F6',
  },
  pausedCell: {
    backgroundColor: '#F59E0B',
  },
  skippedCell: {
    backgroundColor: '#E2E8F0',
  },
  missedCell: {
    backgroundColor: '#EF4444',
  },
  // Status-based text colors
  scheduledText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  deliveredText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  pausedText: {
    color: '#1E293B',
    fontWeight: '600',
  },
  skippedText: {
    color: '#64748B',
    fontWeight: '600',
  },
  missedText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  todayCell: {
    borderWidth: 2,
    borderColor: '#0D9488',
  },
  selectedCell: {
    borderWidth: 3,
    borderColor: '#1E293B',
  },
  dayText: {
    fontSize: 14,
    color: '#1E293B',
  },
  todayText: {
    fontWeight: '700',
    color: '#0D9488',
  },
  selectedText: {
    fontWeight: '700',
  },
  todayIndicator: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#0D9488',
  },
  detailsCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  detailsDate: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  itemsList: {
    marginBottom: 16,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemInfo: {
    flex: 1,
  },
  itemProduct: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
  },
  itemQuantity: {
    fontSize: 13,
    color: '#64748B',
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#059669',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButtonSecondary: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionButtonSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  actionButtonPrimary: {
    flex: 1,
    backgroundColor: '#0D9488',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionButtonPrimaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statsCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0D9488',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E293B',
  },
  modalCloseButton: {
    fontSize: 24,
    color: '#94A3B8',
  },
  modalDescription: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
    marginBottom: 24,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 8,
  },
  dateRangeSelector: {
    gap: 16,
    marginBottom: 16,
  },
  dateInput: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 8,
  },
  datePicker: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  datePickerText: {
    fontSize: 15,
    color: '#1E293B',
  },
  vacationInfo: {
    backgroundColor: '#F0FDFA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  vacationInfoText: {
    fontSize: 13,
    color: '#0D9488',
  },
  modalApplyButton: {
    backgroundColor: '#0D9488',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  modalApplyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  currentOrderCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  currentOrderTitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 8,
  },
  currentOrderItem: {
    fontSize: 14,
    color: '#1E293B',
    marginBottom: 4,
  },
  quantitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  quantityButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityButtonText: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  quantityValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  addItemOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: '#0D9488',
    borderColor: '#0D9488',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  addItemText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
  },
  modifyInfo: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  modifyInfoText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  productList: {
    maxHeight: 250,
    marginBottom: 16,
  },
  productItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 2,
  },
  productDetails: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  qtyText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    minWidth: 20,
    textAlign: 'center',
  },
  addButton: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  noProductsText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    padding: 16,
  },
});