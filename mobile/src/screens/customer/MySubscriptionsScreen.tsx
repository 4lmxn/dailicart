import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLayout } from '../../components/AppLayout';
import { AppBar } from '../../components/AppBar';
import { theme } from '../../theme';
import { formatCurrency, formatQuantity, getLocalDateString } from '../../utils/helpers';
import { WEEK_DAYS } from '../../constants';
import { useAuthStore } from '../../store/authStore';
import { SubscriptionService } from '../../services/api/subscriptions';
import { supabase } from '../../services/supabase';
import type { Subscription as APISubscription } from '../../services/api/types';
import { Skeleton } from '../../components/Skeleton';

// UI Subscription type (quantity is string like "1L", "500g")
interface UISubscription {
  id: string;
  customerId: string;
  productId: string;
  productName: string;
  brand: string;
  quantity: string; // "1L", "500g", etc.
  deliveryTime: 'morning' | 'evening';
  frequency: 'daily' | 'alternate' | 'custom';
  customDays?: number[];
  price: number;
  status: 'active' | 'paused';
  startDate: string;
  pausedUntil?: string;
  nextDeliveryDate?: string;
  totalDeliveries: number;
  successfulDeliveries: number;
  skippedDeliveries: number;
  missedDeliveries: number;
}

interface MySubscriptionsScreenProps {
  onBack: () => void;
}

export const MySubscriptionsScreen: React.FC<MySubscriptionsScreenProps> = ({ onBack }) => {
  const user = useAuthStore((state) => state.user);
  const insets = useSafeAreaInsets();
  const [subscriptions, setSubscriptions] = useState<UISubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSub, setSelectedSub] = useState<UISubscription | null>(null);
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showFrequencyModal, setShowFrequencyModal] = useState(false);
  const [showDeliveryHistoryModal, setShowDeliveryHistoryModal] = useState(false);
  const [deliveryHistory, setDeliveryHistory] = useState<Array<{date: string; status: string; time: string}>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [modifyQuantity, setModifyQuantity] = useState(1); // Changed to number
  const [modifyUnit, setModifyUnit] = useState('L'); // Store unit separately
  const [modifyTime, setModifyTime] = useState<'morning' | 'evening'>('morning');
  const [modifyFrequency, setModifyFrequency] = useState<'daily' | 'alternate' | 'custom'>('daily');
  const [modifyCustomDays, setModifyCustomDays] = useState<number[]>([]);
  const [pauseDays, setPauseDays] = useState('7');
  const [newFrequency, setNewFrequency] = useState<'daily' | 'alternate' | 'custom'>('daily');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);

  useEffect(() => {
    loadSubscriptions();
  }, []);

  const loadSubscriptions = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      
      // Subscriptions table uses user_id directly (not customer.id)
      const data = await SubscriptionService.getCustomerSubscriptions(user.id);
      // Transform API data to UI format
      const transformedData: UISubscription[] = data.map(sub => ({
        id: sub.id,
        customerId: sub.customerId,
        productId: sub.productId,
        productName: sub.productName || 'Unknown Product',
        brand: sub.brand || 'Unknown Brand',
        quantity: formatQuantity(sub.quantity, sub.unit),
        deliveryTime: sub.deliveryTime,
        frequency: sub.frequency,
        customDays: sub.customDays,
        price: sub.price || 0,
        status: sub.status as 'active' | 'paused',
        startDate: sub.startDate,
        pausedUntil: sub.pausedUntil ?? undefined,
        nextDeliveryDate: sub.nextDeliveryDate,
        totalDeliveries: sub.totalDeliveries,
        successfulDeliveries: sub.successfulDeliveries,
        skippedDeliveries: sub.skippedDeliveries,
        missedDeliveries: sub.missedDeliveries,
      }));
      setSubscriptions(transformedData);
    } catch (error) {
      console.error('Error loading subscriptions:', error);
      Alert.alert('Error', 'Failed to load subscriptions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSubscriptions();
    setRefreshing(false);
  };

  const getDaysUntilNextDelivery = (nextDate?: string) => {
    if (!nextDate) return 'Not scheduled';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const next = new Date(nextDate);
    next.setHours(0, 0, 0, 0);
    const diff = Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff < 0) return 'Overdue';
    return `in ${diff} days`;
  };

  const getDeliverySuccessRate = (sub: UISubscription) => {
    if (sub.totalDeliveries === 0) return 100; // No deliveries yet means 100% potential
    return Math.round((sub.successfulDeliveries / sub.totalDeliveries) * 100);
  };

  const handlePause = (sub: UISubscription) => {
    setSelectedSub(sub);
    setShowPauseModal(true);
  };

  const handleResume = async (subId: string) => {
    // Use confirm for web compatibility, Alert.alert for native
    const confirmed = typeof window !== 'undefined' && window.confirm
      ? window.confirm('Resume this subscription starting tomorrow?')
      : await new Promise<boolean>((resolve) => {
          Alert.alert('Resume Subscription', 'Resume this subscription starting tomorrow?', [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Resume', onPress: () => resolve(true) },
          ]);
        });
    
    if (!confirmed) return;
    
    try {
      await SubscriptionService.resumeSubscription(subId);
      setSubscriptions((prev) =>
        prev.map((s) =>
          s.id === subId ? { ...s, status: 'active', pausedUntil: undefined } : s
        )
      );
      Alert.alert('Success', 'Subscription resumed successfully!');
    } catch (error) {
      console.error('Error resuming subscription:', error);
      Alert.alert('Error', 'Failed to resume subscription. Please try again.');
    }
  };

  const handleCancel = async (sub: UISubscription) => {
    Alert.alert(
      'Cancel Subscription',
      `Are you sure you want to cancel "${sub.productName}"? This action cannot be undone.`,
      [
        { text: 'No, Keep It', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await SubscriptionService.cancelSubscription(sub.id);
              setSubscriptions((prev) => prev.filter((s) => s.id !== sub.id));
            } catch (error) {
              console.error('Error cancelling subscription:', error);
              Alert.alert('Error', 'Failed to cancel subscription. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleModify = (sub: UISubscription) => {
    setSelectedSub(sub);
    // Parse quantity from string like "1L" or "500ml" or "2 packets"
    const quantityMatch = sub.quantity.match(/^(\d+\.?\d*)/);
    const quantityValue = quantityMatch ? parseFloat(quantityMatch[1]) : 1;
    // Extract unit from quantity string
    const unitMatch = sub.quantity.match(/[a-zA-Z]+$/);
    const unitValue = unitMatch ? unitMatch[0] : 'L';
    setModifyQuantity(quantityValue);
    setModifyUnit(unitValue);
    setModifyTime(sub.deliveryTime);
    setModifyFrequency(sub.frequency);
    setModifyCustomDays(sub.customDays || []);
    setShowModifyModal(true);
  };

  const applyModification = async () => {
    if (!selectedSub) return;
    try {
      // Build update payload
      const updatePayload: Parameters<typeof SubscriptionService.updateSubscription>[1] = {
        quantity: modifyQuantity,
        deliveryTime: modifyTime,
        frequency: modifyFrequency,
      };
      
      // Include custom days if frequency is custom
      if (modifyFrequency === 'custom') {
        if (modifyCustomDays.length === 0) {
          Alert.alert('Error', 'Please select at least one day for custom frequency.');
          return;
        }
        updatePayload.customDays = modifyCustomDays;
      }

      await SubscriptionService.updateSubscription(selectedSub.id, updatePayload);

      // Update local state
      const newQuantityString = `${modifyQuantity}${modifyUnit}`;
      setSubscriptions((prev) =>
        prev.map((s) =>
          s.id === selectedSub.id
            ? { 
                ...s, 
                quantity: newQuantityString, 
                deliveryTime: modifyTime,
                frequency: modifyFrequency,
                customDays: modifyFrequency === 'custom' ? modifyCustomDays : undefined,
              }
            : s
        )
      );
      setShowModifyModal(false);
      setSelectedSub(null);
      Alert.alert('✅ Updated', 'Subscription modified successfully.');
    } catch (error) {
      console.error('Error modifying subscription:', error);
      Alert.alert('Error', 'Failed to update subscription. Please try again.');
    }
  };

  const applyPause = async () => {
    const days = parseInt(pauseDays);
    if (!selectedSub || days <= 0) return;
    try {
      await SubscriptionService.pauseSubscription(selectedSub.id, days);

      const pauseUntil = new Date();
      pauseUntil.setDate(pauseUntil.getDate() + days);

      setSubscriptions((prev) =>
        prev.map((s) =>
          s.id === selectedSub.id
            ? { ...s, status: 'paused', pausedUntil: getLocalDateString(pauseUntil) }
            : s
        )
      );
      setShowPauseModal(false);
      setSelectedSub(null);
      setPauseDays('7');
      Alert.alert('✅ Paused', `Subscription paused for ${days} days.`);
    } catch (error) {
      console.error('Error pausing subscription:', error);
      Alert.alert('Error', 'Failed to pause subscription. Please try again.');
    }
  };

  const handleSkipDelivery = (sub: UISubscription) => {
    const nextDateStr = sub.nextDeliveryDate 
      ? new Date(sub.nextDeliveryDate).toLocaleDateString('en-IN')
      : 'your next scheduled';
    Alert.alert(
      'Skip Next Delivery',
      `Skip the delivery scheduled for ${nextDateStr}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip',
          onPress: async () => {
            try {
              await SubscriptionService.skipNextDelivery(sub.id);
              await loadSubscriptions();
              Alert.alert('✅ Delivery Skipped', 'Your next delivery has been rescheduled.');
            } catch (error) {
              Alert.alert('Error', 'Failed to skip delivery');
            }
          },
        },
      ]
    );
  };

  const handleChangeFrequency = (sub: UISubscription) => {
    setSelectedSub(sub);
    setNewFrequency(sub.frequency);
    setSelectedDays(sub.customDays || []);
    setShowFrequencyModal(true);
  };

  const applyFrequencyChange = async () => {
    if (selectedSub) {
      try {
        await SubscriptionService.changeFrequency(
          selectedSub.id,
          newFrequency,
          newFrequency === 'custom' ? selectedDays : undefined
        );
        await loadSubscriptions();
        setShowFrequencyModal(false);
        setSelectedSub(null);
        Alert.alert('✅ Frequency Updated', 'Your delivery frequency has been changed.');
      } catch (error) {
        Alert.alert('Error', 'Failed to update frequency');
      }
    }
  };

  const toggleDay = (dayId: number) => {
    setSelectedDays((prev) =>
      prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId]
    );
  };

  const handleViewHistory = async (sub: UISubscription) => {
    setSelectedSub(sub);
    setShowDeliveryHistoryModal(true);
    setHistoryLoading(true);
    setDeliveryHistory([]);
    
    try {
      // Fetch orders for this subscription (only past/current deliveries, not future)
      const today = getLocalDateString();
      const { data: orders, error } = await supabase
        .from('orders')
        .select('id, delivery_date, status, delivered_at')
        .eq('subscription_id', sub.id)
        .lte('delivery_date', today)
        .order('delivery_date', { ascending: false })
        .limit(20);
      
      if (error) {
        console.warn('Error fetching delivery history:', error);
        setDeliveryHistory([]);
      } else {
        const history = (orders || []).map(order => {
          const deliveredTime = order.delivered_at 
            ? new Date(order.delivered_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
            : '-';
          return {
            date: order.delivery_date,
            status: order.status === 'delivered' ? 'delivered' 
                  : order.status === 'skipped' || order.status === 'cancelled' ? 'skipped' 
                  : order.status === 'missed' || order.status === 'failed' ? 'missed'
                  : 'pending',
            time: order.status === 'delivered' ? deliveredTime : '-',
          };
        });
        setDeliveryHistory(history);
      }
    } catch (err) {
      console.error('Error loading history:', err);
      setDeliveryHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const activeSubscriptions = subscriptions.filter((s) => s.status === 'active');
  const pausedSubscriptions = subscriptions.filter((s) => s.status === 'paused');

  return (
    <AppLayout>
      <AppBar title="My Subscriptions" onBack={onBack} variant="surface" />

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <>
            {/* Summary Skeleton */}
            <View style={[styles.summaryCard, styles.cardShadow]}> 
              <Skeleton height={20} width={160} />
              <View style={{ height: 12 }} />
              <Skeleton height={20} width={200} />
            </View>

            {/* Subscription Card Skeletons */}
            <View style={styles.section}>
              {[1,2,3].map((k) => (
                <View key={k} style={[styles.subscriptionCard, styles.cardShadow]}> 
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                    <Skeleton height={24} width={100} />
                    <Skeleton height={24} width={70} />
                  </View>
                  <Skeleton height={18} width={'60%'} style={{ marginBottom: 6 }} />
                  <Skeleton height={14} width={'40%'} style={{ marginBottom: 12 }} />
                  <Skeleton height={56} width={'100%'} style={{ borderRadius: 12, marginBottom: 12 }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Skeleton height={32} width={'30%'} />
                    <Skeleton height={32} width={'30%'} />
                    <Skeleton height={32} width={'30%'} />
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : (
          <>
        {/* Summary Card */}
        <View style={[styles.summaryCard, styles.cardShadow]}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Active Subscriptions</Text>
            <Text style={styles.summaryValue}>{activeSubscriptions.length}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Monthly Estimate</Text>
            <Text style={[styles.summaryValue, { color: theme.colors.success }]}>
              {formatCurrency(
                activeSubscriptions.reduce((sum, s) => {
                  if (s.frequency === 'daily') return sum + s.price * 30;
                  if (s.frequency === 'alternate') return sum + s.price * 15;
                  if (s.frequency === 'custom' && s.customDays)
                    return sum + s.price * s.customDays.length * 4;
                  return sum;
                }, 0)
              )}
            </Text>
          </View>
        </View>

        {/* Active Subscriptions */}
        {activeSubscriptions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Active Subscriptions</Text>
            {activeSubscriptions.map((sub) => (
              <View key={sub.id} style={[styles.subscriptionCard, styles.cardShadow]}>
                <View style={styles.subHeader}>
                  <View style={styles.subBadge}>
                    <Text style={styles.subBadgeText}>
                      {sub.deliveryTime === 'morning' ? '🌅 Morning' : '🌆 Evening'}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, styles.activeBadge]}>
                    <Text style={styles.statusBadgeText}>● Active</Text>
                  </View>
                </View>

                <Text style={styles.subProduct}>{sub.productName}</Text>
                <Text style={styles.subBrand}>{sub.brand}</Text>

                {/* Next Delivery Countdown */}
                <View style={styles.nextDeliveryCard}>
                  <View style={styles.nextDeliveryLeft}>
                    <Text style={styles.nextDeliveryIcon}>📅</Text>
                    <View>
                      <Text style={styles.nextDeliveryLabel}>Next Delivery</Text>
                      <Text style={styles.nextDeliveryDate}>
                        {sub.nextDeliveryDate 
                          ? new Date(sub.nextDeliveryDate).toLocaleDateString('en-IN', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            })
                          : 'Not scheduled'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.nextDeliveryBadge}>
                    <Text style={styles.nextDeliveryBadgeText}>{getDaysUntilNextDelivery(sub.nextDeliveryDate)}</Text>
                  </View>
                </View>

                <View style={styles.subDetails}>
                  <View style={styles.subDetailItem}>
                    <Text style={styles.subDetailLabel}>Quantity</Text>
                    <Text style={styles.subDetailValue}>{sub.quantity}</Text>
                  </View>
                  <View style={styles.subDetailItem}>
                    <Text style={styles.subDetailLabel}>Frequency</Text>
                    <Text style={styles.subDetailValue}>
                      {sub.frequency === 'daily' && 'Daily'}
                      {sub.frequency === 'alternate' && 'Alternate Days'}
                      {sub.frequency === 'custom' && 'Custom Days'}
                    </Text>
                  </View>
                  <View style={styles.subDetailItem}>
                    <Text style={styles.subDetailLabel}>Price/Day</Text>
                    <Text style={styles.subDetailValue}>{formatCurrency(sub.price)}</Text>
                  </View>
                </View>

                {sub.frequency === 'custom' && sub.customDays && (
                  <View style={styles.customDaysContainer}>
                    <Text style={styles.customDaysLabel}>Delivery Days:</Text>
                    <View style={styles.customDaysRow}>
                      {WEEK_DAYS.map((day) => (
                        <View
                          key={day.id}
                          style={[
                            styles.customDayChip,
                            sub.customDays?.includes(day.id) && styles.customDayChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.customDayChipText,
                              sub.customDays?.includes(day.id) &&
                                styles.customDayChipTextActive,
                            ]}
                          >
                            {day.short}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Delivery Performance Stats */}
                <View style={styles.performanceCard}>
                  <View style={styles.performanceItem}>
                    <Text style={styles.performanceValue}>{sub.totalDeliveries}</Text>
                    <Text style={styles.performanceLabel}>Total</Text>
                  </View>
                  <View style={styles.performanceDivider} />
                  <View style={styles.performanceItem}>
                    <Text style={[styles.performanceValue, { color: theme.colors.success }]}>
                      {getDeliverySuccessRate(sub)}%
                    </Text>
                    <Text style={styles.performanceLabel}>Success</Text>
                  </View>
                  <View style={styles.performanceDivider} />
                  <View style={styles.performanceItem}>
                    <Text style={styles.performanceValue}>{sub.skippedDeliveries}</Text>
                    <Text style={styles.performanceLabel}>Skipped</Text>
                  </View>
                  <TouchableOpacity style={styles.historyButton} onPress={() => handleViewHistory(sub)}>
                    <Text style={styles.historyButtonText}>View History →</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.subStats}>
                  <Text style={styles.subStatsText}>
                    Started {new Date(sub.startDate).toLocaleDateString('en-IN')}
                  </Text>
                </View>

                <View style={styles.subActions}>
                  <TouchableOpacity
                    style={styles.subActionButton}
                    onPress={() => handleSkipDelivery(sub)}
                  >
                    <Text style={styles.subActionButtonText}>⏭️ Skip</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.subActionButton}
                    onPress={() => handleChangeFrequency(sub)}
                  >
                    <Text style={styles.subActionButtonText}>🔄 Frequency</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.subActionButton}
                    onPress={() => handleModify(sub)}
                  >
                    <Text style={styles.subActionButtonText}>✏️ Modify</Text>
                  </TouchableOpacity>
                </View>
                <View style={[styles.subActions, { marginTop: 8 }]}>
                  <TouchableOpacity
                    style={[styles.subActionButton, { flex: 1 }]}
                    onPress={() => handlePause(sub)}
                  >
                    <Text style={styles.subActionButtonText}>⏸️ Pause</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.subActionButton, styles.cancelButton, { flex: 1 }]}
                    onPress={() => handleCancel(sub)}
                  >
                    <Text style={[styles.subActionButtonText, styles.cancelButtonText]}>
                      ✕ Cancel
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Paused Subscriptions */}
        {pausedSubscriptions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Paused Subscriptions</Text>
            {pausedSubscriptions.map((sub) => (
              <View key={sub.id} style={[styles.subscriptionCard, styles.pausedCard, styles.cardShadow]}>
                <View style={styles.subHeader}>
                  <View style={[styles.statusBadge, styles.pausedBadge]}>
                    <Text style={styles.statusBadgeText}>⏸️ Paused</Text>
                  </View>
                </View>

                <Text style={styles.subProduct}>{sub.productName}</Text>
                <Text style={styles.subBrand}>{sub.brand}</Text>

                {sub.pausedUntil && (
                  <View style={styles.pauseInfo}>
                    <Text style={styles.pauseInfoText}>
                      Paused until {new Date(sub.pausedUntil).toLocaleDateString('en-IN')}
                    </Text>
                  </View>
                )}

                <View style={styles.subActions}>
                  <TouchableOpacity
                    style={[styles.subActionButton, styles.resumeButton]}
                    onPress={() => handleResume(sub.id)}
                  >
                    <Text style={[styles.subActionButtonText, { color: theme.colors.success }]}>
                      ▶️ Resume
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.subActionButton, styles.cancelButton]}
                    onPress={() => handleCancel(sub)}
                  >
                    <Text style={[styles.subActionButtonText, styles.cancelButtonText]}>
                      ✕ Cancel
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {subscriptions.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyTitle}>No Subscriptions Yet</Text>
            <Text style={styles.emptyText}>
              Create your first subscription to start getting daily deliveries!
            </Text>
            <TouchableOpacity style={styles.ctaButton} onPress={() => Alert.alert('Go to Catalog', 'Navigate to product catalog to create a subscription.') }>
              <Text style={styles.ctaButtonText}>Browse Products</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
          </>
        )}
      </ScrollView>

      {/* Modify Modal - Combined quantity, delivery time, and frequency */}
      <Modal
        visible={showModifyModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowModifyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView 
            style={styles.modalScrollView}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>✏️ Modify Subscription</Text>
                <TouchableOpacity onPress={() => setShowModifyModal(false)}>
                  <Text style={styles.modalCloseButton}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Product Info */}
              <View style={styles.modifyProductInfo}>
                <Text style={styles.modifyProductName}>{selectedSub?.productName}</Text>
                <Text style={styles.modifyProductBrand}>{selectedSub?.brand}</Text>
              </View>

              {/* Quantity Section */}
              <Text style={styles.modalLabel}>Quantity</Text>
              <View style={styles.quantityControl}>
                <TouchableOpacity
                  style={styles.quantityControlButton}
                  onPress={() => setModifyQuantity(Math.max(1, modifyQuantity - 1))}
                >
                  <Text style={styles.quantityControlButtonText}>−</Text>
                </TouchableOpacity>
                <View style={styles.quantityDisplay}>
                  <Text style={styles.quantityDisplayText}>{modifyQuantity}</Text>
                  <Text style={styles.quantityDisplayUnit}>{modifyUnit}</Text>
                </View>
                <TouchableOpacity
                  style={styles.quantityControlButton}
                  onPress={() => setModifyQuantity(Math.min(10, modifyQuantity + 1))}
                >
                  <Text style={styles.quantityControlButtonText}>+</Text>
                </TouchableOpacity>
              </View>

              {/* Frequency Section */}
              <Text style={styles.modalLabel}>Delivery Frequency</Text>
              <View style={styles.frequencyOptions}>
                {[
                  { value: 'daily', label: '📅 Daily', desc: 'Every day' },
                  { value: 'alternate', label: '🔄 Alternate', desc: 'Every other day' },
                  { value: 'custom', label: '📆 Custom', desc: 'Select days' },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.frequencyOption,
                      modifyFrequency === option.value && styles.frequencyOptionActive,
                    ]}
                    onPress={() => setModifyFrequency(option.value as typeof modifyFrequency)}
                  >
                    <Text style={[
                      styles.frequencyOptionLabel,
                      modifyFrequency === option.value && styles.frequencyOptionLabelActive,
                    ]}>
                      {option.label}
                    </Text>
                    <Text style={styles.frequencyOptionDesc}>{option.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Custom Days Selector */}
              {modifyFrequency === 'custom' && (
                <View style={styles.customDaysContainer}>
                  <Text style={styles.modalSubLabel}>Select delivery days:</Text>
                  <View style={styles.daySelector}>
                    {WEEK_DAYS.map((day) => (
                      <TouchableOpacity
                        key={day.id}
                        style={[
                          styles.dayButton,
                          modifyCustomDays.includes(day.id) && styles.dayButtonActive,
                        ]}
                        onPress={() => {
                          setModifyCustomDays((prev) =>
                            prev.includes(day.id)
                              ? prev.filter((d) => d !== day.id)
                              : [...prev, day.id].sort()
                          );
                        }}
                      >
                        <Text
                          style={[
                            styles.dayButtonText,
                            modifyCustomDays.includes(day.id) && styles.dayButtonTextActive,
                          ]}
                        >
                          {day.short}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Delivery Time Section */}
              <Text style={styles.modalLabel}>Delivery Time</Text>
              <View style={styles.timeButtons}>
                <TouchableOpacity
                  style={[
                    styles.timeButton,
                    modifyTime === 'morning' && styles.timeButtonActive,
                  ]}
                  onPress={() => setModifyTime('morning')}
                >
                  <Text
                    style={[
                      styles.timeButtonText,
                      modifyTime === 'morning' && styles.timeButtonTextActive,
                    ]}
                  >
                    🌅 Morning
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.timeButton,
                    modifyTime === 'evening' && styles.timeButtonActive,
                  ]}
                  onPress={() => setModifyTime('evening')}
                >
                  <Text
                    style={[
                      styles.timeButtonText,
                      modifyTime === 'evening' && styles.timeButtonTextActive,
                    ]}
                  >
                    🌆 Evening
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.modalApplyButton} onPress={applyModification}>
                <Text style={styles.modalApplyButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Pause Modal */}
      <Modal
        visible={showPauseModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPauseModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>⏸️ Pause Subscription</Text>
              <TouchableOpacity onPress={() => setShowPauseModal(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDescription}>
              Pause "{selectedSub?.productName}" for how many days?
            </Text>

            <Text style={styles.modalLabel}>Number of Days</Text>
            <TextInput
              style={styles.pauseInput}
              keyboardType="numeric"
              value={pauseDays}
              onChangeText={setPauseDays}
              placeholder="Enter days (e.g., 7)"
            />

            <View style={styles.quickPauseBadges}>
              {['3', '7', '14', '30'].map((days) => (
                <TouchableOpacity
                  key={days}
                  style={styles.quickPauseBadge}
                  onPress={() => setPauseDays(days)}
                >
                  <Text style={styles.quickPauseBadgeText}>{days} days</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.pauseNote}>
              <Text style={styles.pauseNoteText}>
                💡 No deliveries or charges during pause period. Resume anytime.
              </Text>
            </View>

            <TouchableOpacity style={styles.modalApplyButton} onPress={applyPause}>
              <Text style={styles.modalApplyButtonText}>Pause for {pauseDays} Days</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Change Frequency Modal */}
      <Modal
        visible={showFrequencyModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowFrequencyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🔄 Change Frequency</Text>
              <TouchableOpacity onPress={() => setShowFrequencyModal(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Select Frequency</Text>
            <View style={styles.frequencyOptions}>
              <TouchableOpacity
                style={[styles.frequencyOption, newFrequency === 'daily' && styles.frequencyOptionActive]}
                onPress={() => setNewFrequency('daily')}
              >
                <Text style={[styles.frequencyOptionText, newFrequency === 'daily' && styles.frequencyOptionTextActive]}>
                  📅 Daily
                </Text>
                <Text style={styles.frequencyOptionSubtext}>Every day</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.frequencyOption, newFrequency === 'alternate' && styles.frequencyOptionActive]}
                onPress={() => setNewFrequency('alternate')}
              >
                <Text style={[styles.frequencyOptionText, newFrequency === 'alternate' && styles.frequencyOptionTextActive]}>
                  📆 Alternate Days
                </Text>
                <Text style={styles.frequencyOptionSubtext}>Every 2 days</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.frequencyOption, newFrequency === 'custom' && styles.frequencyOptionActive]}
                onPress={() => setNewFrequency('custom')}
              >
                <Text style={[styles.frequencyOptionText, newFrequency === 'custom' && styles.frequencyOptionTextActive]}>
                  🗓️ Custom Days
                </Text>
                <Text style={styles.frequencyOptionSubtext}>Choose days</Text>
              </TouchableOpacity>
            </View>

            {newFrequency === 'custom' && (
              <View style={styles.customDaySelector}>
                <Text style={styles.modalLabel}>Select Delivery Days</Text>
                <View style={styles.daySelectionRow}>
                  {WEEK_DAYS.map((day) => (
                    <TouchableOpacity
                      key={day.id}
                      style={[
                        styles.daySelectionChip,
                        selectedDays.includes(day.id) && styles.daySelectionChipActive,
                      ]}
                      onPress={() => toggleDay(day.id)}
                    >
                      <Text
                        style={[
                          styles.daySelectionChipText,
                          selectedDays.includes(day.id) && styles.daySelectionChipTextActive,
                        ]}
                      >
                        {day.short}
                      </Text>
                      <Text
                        style={[
                          styles.daySelectionChipFull,
                          selectedDays.includes(day.id) && styles.daySelectionChipTextActive,
                        ]}
                      >
                        {day.full}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <TouchableOpacity style={styles.modalApplyButton} onPress={applyFrequencyChange}>
              <Text style={styles.modalApplyButtonText}>Apply Frequency Change</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delivery History Modal */}
      <Modal
        visible={showDeliveryHistoryModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDeliveryHistoryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: '85%', paddingBottom: Math.max(insets.bottom, 24) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📊 Delivery History</Text>
              <TouchableOpacity onPress={() => setShowDeliveryHistoryModal(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView 
              style={{ flex: 1 }} 
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingBottom: 16, flexGrow: 1 }}
              bounces={true}
            >
            {selectedSub && (
              <>
                <Text style={styles.modalDescription}>
                  {selectedSub.productName} • {selectedSub.quantity}
                </Text>

                <View style={styles.historyStats}>
                  <View style={styles.historyStatCard}>
                    <Text style={styles.historyStatValue}>{selectedSub.totalDeliveries}</Text>
                    <Text style={styles.historyStatLabel}>Total Deliveries</Text>
                  </View>
                  <View style={styles.historyStatCard}>
                    <Text style={[styles.historyStatValue, { color: theme.colors.success }]}>
                      {selectedSub.successfulDeliveries}
                    </Text>
                    <Text style={styles.historyStatLabel}>Successful</Text>
                  </View>
                  <View style={styles.historyStatCard}>
                    <Text style={[styles.historyStatValue, { color: theme.colors.warning }]}>
                      {selectedSub.skippedDeliveries}
                    </Text>
                    <Text style={styles.historyStatLabel}>Skipped</Text>
                  </View>
                  <View style={styles.historyStatCard}>
                    <Text style={[styles.historyStatValue, { color: theme.colors.error }]}>
                      {selectedSub.missedDeliveries || 0}
                    </Text>
                    <Text style={styles.historyStatLabel}>Missed</Text>
                  </View>
                </View>

                <View style={styles.successRateCard}>
                  <View style={styles.successRateHeader}>
                    <Text style={styles.successRateTitle}>Success Rate</Text>
                    <Text style={styles.successRatePercentage}>{getDeliverySuccessRate(selectedSub)}%</Text>
                  </View>
                  <View style={styles.successRateBar}>
                    <View
                      style={[
                        styles.successRateFill,
                        { width: `${getDeliverySuccessRate(selectedSub)}%` },
                      ]}
                    />
                  </View>
                </View>

                <View style={styles.historyList}>
                  <Text style={styles.modalLabel}>Recent Deliveries</Text>
                  {historyLoading ? (
                    <View style={{ padding: 20, alignItems: 'center' }}>
                      <Text style={{ color: theme.colors.textSecondary }}>Loading...</Text>
                    </View>
                  ) : deliveryHistory.length === 0 ? (
                    <View style={{ padding: 20, alignItems: 'center' }}>
                      <Text style={{ color: theme.colors.textSecondary }}>No delivery history yet</Text>
                    </View>
                  ) : deliveryHistory.map((delivery, index) => (
                    <View key={index} style={styles.historyItem}>
                      <View style={styles.historyItemLeft}>
                        <View
                          style={[
                            styles.historyItemDot,
                            delivery.status === 'delivered' && styles.historyItemDotSuccess,
                            delivery.status === 'skipped' && styles.historyItemDotWarning,
                          ]}
                        />
                        <View>
                          <Text style={styles.historyItemDate}>
                            {new Date(delivery.date).toLocaleDateString('en-IN', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </Text>
                          <Text style={styles.historyItemTime}>{delivery.time}</Text>
                        </View>
                      </View>
                      <View
                        style={[
                          styles.historyItemBadge,
                          delivery.status === 'delivered' && styles.historyItemBadgeSuccess,
                          delivery.status === 'skipped' && styles.historyItemBadgeWarning,
                          delivery.status === 'missed' && { backgroundColor: '#FFEBEE' },
                          delivery.status === 'pending' && { backgroundColor: '#E3F2FD' },
                        ]}
                      >
                        <Text style={styles.historyItemBadgeText}>
                          {delivery.status === 'delivered' ? '✅ Delivered' 
                            : delivery.status === 'skipped' ? '⏭️ Skipped'
                            : delivery.status === 'missed' ? '❌ Missed'
                            : '🕐 Pending'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}
            </ScrollView>
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
    backgroundColor: theme.colors.primary,
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 28,
    color: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 24,
    marginTop: 16,
    borderRadius: 12,
    padding: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 15,
    color: theme.colors.textSecondary,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: theme.colors.borderLight,
    marginVertical: 4,
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
  subscriptionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
  },
  pausedCard: {
    opacity: 0.7,
  },
  subHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  subBadge: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  subBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  activeBadge: {
    backgroundColor: theme.colors.success + '20',
  },
  pausedBadge: {
    backgroundColor: theme.colors.warning + '20',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text,
  },
  subProduct: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  subBrand: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 16,
  },
  subDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  subDetailItem: {
    alignItems: 'center',
  },
  subDetailLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  subDetailValue: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  customDaysLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  customDaysRow: {
    flexDirection: 'row',
    gap: 8,
  },
  customDayChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  customDayChipActive: {
    backgroundColor: theme.colors.primary,
  },
  customDayChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  customDayChipTextActive: {
    color: '#FFFFFF',
  },
  subStats: {
    marginBottom: 12,
  },
  subStatsText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  subActions: {
    flexDirection: 'row',
    gap: 8,
  },
  subActionButton: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  resumeButton: {
    flex: 2,
  },
  cancelButton: {
    backgroundColor: '#FFEBEE',
  },
  subActionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
  },
  cancelButtonText: {
    color: theme.colors.error,
  },
  pauseInfo: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  pauseInfoText: {
    fontSize: 13,
    color: theme.colors.warning,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  ctaButton: {
    marginTop: 16,
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalScrollView: {
    maxHeight: '90%',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  // Modify Modal specific styles
  modifyProductInfo: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  modifyProductName: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  modifyProductBrand: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 16,
  },
  quantityControlButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  quantityControlButtonText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  quantityDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    minWidth: 100,
    justifyContent: 'center',
  },
  quantityDisplayText: {
    fontSize: 48,
    fontWeight: '700',
    color: theme.colors.text,
  },
  quantityDisplayUnit: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },
  frequencyOptions: {
    gap: 12,
    marginBottom: 20,
  },
  frequencyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
    backgroundColor: '#FFFFFF',
  },
  frequencyOptionActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '08',
  },
  frequencyOptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  frequencyOptionLabelActive: {
    color: theme.colors.primary,
  },
  frequencyOptionDesc: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  customDaysContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  modalSubLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  modalCloseButton: {
    fontSize: 28,
    color: theme.colors.textSecondary,
  },
  modalDescription: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 24,
  },
  modalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 12,
  },
  quantityButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  quantityButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  quantityButtonActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '10',
  },
  quantityButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  quantityButtonTextActive: {
    color: theme.colors.primary,
  },
  timeButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  timeButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  timeButtonActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '10',
  },
  timeButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  timeButtonTextActive: {
    color: theme.colors.primary,
  },
  pauseInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  quickPauseBadges: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  quickPauseBadge: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  quickPauseBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text,
  },
  pauseNote: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  pauseNoteText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  modalApplyButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  modalApplyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
    paddingHorizontal: 40,
  },
  // Next Delivery & Performance Card Styles
  nextDeliveryCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nextDeliveryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  nextDeliveryIcon: {
    fontSize: 32,
  },
  nextDeliveryLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  nextDeliveryDate: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  nextDeliveryBadge: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  nextDeliveryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  performanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  performanceItem: {
    flex: 1,
    alignItems: 'center',
  },
  performanceValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  performanceLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  performanceDivider: {
    width: 1,
    height: 30,
    backgroundColor: theme.colors.borderLight,
  },
  historyButton: {
    flex: 1,
    alignItems: 'center',
  },
  historyButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  // Day selection styles for custom frequency
  daySelector: {
    flexDirection: 'row',
    gap: 8,
  },
  dayButton: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  dayButtonActive: {
    backgroundColor: '#E8F5E9',
    borderColor: theme.colors.primary,
  },
  dayButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  dayButtonTextActive: {
    color: theme.colors.primary,
  },
  // Frequency Modal Styles (for existing frequency modal)
  frequencyOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
  },
  frequencyOptionTextActive: {
    color: theme.colors.primary,
  },
  frequencyOptionSubtext: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  customDaySelector: {
    marginBottom: 20,
  },
  daySelectionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  daySelectionChip: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  daySelectionChipActive: {
    backgroundColor: '#E8F5E9',
    borderColor: theme.colors.primary,
  },
  daySelectionChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 2,
  },
  daySelectionChipTextActive: {
    color: theme.colors.primary,
  },
  daySelectionChipFull: {
    fontSize: 10,
    color: theme.colors.textSecondary,
  },
  // Delivery History Modal Styles
  historyStats: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 16,
  },
  historyStatCard: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  historyStatValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  historyStatLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  successRateCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  successRateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  successRateTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  successRatePercentage: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.success,
  },
  successRateBar: {
    height: 8,
    backgroundColor: '#C8E6C9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  successRateFill: {
    height: '100%',
    backgroundColor: theme.colors.success,
  },
  historyList: {
    marginTop: 8,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  historyItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  historyItemDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.textSecondary,
  },
  historyItemDotSuccess: {
    backgroundColor: theme.colors.success,
  },
  historyItemDotWarning: {
    backgroundColor: theme.colors.warning,
  },
  historyItemDate: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  historyItemTime: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  historyItemBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
  },
  historyItemBadgeSuccess: {
    backgroundColor: '#E8F5E9',
  },
  historyItemBadgeWarning: {
    backgroundColor: '#FFF3E0',
  },
  historyItemBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text,
  },
});
