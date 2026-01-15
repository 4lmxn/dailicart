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
} from 'react-native';
import { theme } from '../../theme';
import { AppLayout } from '../../components/AppLayout';
import { AppBar } from '../../components/AppBar';
import type { AdminScreenProps } from '../../navigation/types';
import { formatCurrency, formatQuantity } from '../../utils/helpers';
import { SubscriptionService } from '../../services/api/subscriptions';
import type { Subscription } from '../../services/api/types';

interface SubscriptionDetailScreenProps {}

const WEEK_DAYS = [
  { id: 0, short: 'S', full: 'Sunday' },
  { id: 1, short: 'M', full: 'Monday' },
  { id: 2, short: 'T', full: 'Tuesday' },
  { id: 3, short: 'W', full: 'Wednesday' },
  { id: 4, short: 'T', full: 'Thursday' },
  { id: 5, short: 'F', full: 'Friday' },
  { id: 6, short: 'S', full: 'Saturday' },
];

export const SubscriptionDetailScreen: React.FC<AdminScreenProps<'SubscriptionDetail'>> = ({ route, navigation }) => {
  const { subscriptionId } = route.params;
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'history' | 'modify'>('details');
  
  // Modals
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  
  // Modify form
  const [modifyForm, setModifyForm] = useState({
    quantity: 1,
    deliveryTime: 'morning' as 'morning' | 'evening',
    frequency: 'daily' as 'daily' | 'alternate' | 'custom',
    customDays: [] as number[],
  });

  // Pause form
  const [pauseDays, setPauseDays] = useState('7');

  useEffect(() => {
    loadSubscription();
  }, [subscriptionId]);

  const loadSubscription = async () => {
    try {
      setLoading(true);
      const data = await SubscriptionService.getSubscriptionById(subscriptionId!);
      setSubscription(data);
    } catch (error) {
      console.error('Error loading subscription:', error);
      Alert.alert('Error', 'Failed to load subscription details');
    } finally {
      setLoading(false);
    }
  };

  const handleModify = () => {
    if (!subscription) return;
    setModifyForm({
      quantity: subscription.quantity,
      deliveryTime: subscription.deliveryTime,
      frequency: subscription.frequency,
      customDays: subscription.customDays || [],
    });
    setShowModifyModal(true);
  };

  const handleSaveModification = async () => {
    try {
      await SubscriptionService.updateSubscription(subscriptionId!, {
        quantity: modifyForm.quantity,
        deliveryTime: modifyForm.deliveryTime,
        frequency: modifyForm.frequency,
        customDays: modifyForm.frequency === 'custom' ? modifyForm.customDays : undefined,
      });

      await loadSubscription();
      setShowModifyModal(false);
      Alert.alert('✅ Updated', 'Subscription modified successfully');
    } catch (error) {
      console.error('Error modifying subscription:', error);
      Alert.alert('Error', 'Failed to update subscription');
    }
  };

  const handlePause = () => {
    setShowPauseModal(true);
  };

  const handleSavePause = async () => {
    const days = parseInt(pauseDays);
    if (days <= 0) {
      Alert.alert('Error', 'Please enter a valid number of days');
      return;
    }

    try {
      await SubscriptionService.pauseSubscription(subscriptionId!, days);
      await loadSubscription();
      setShowPauseModal(false);
      Alert.alert('✅ Paused', `Subscription paused for ${days} days`);
    } catch (error) {
      console.error('Error pausing subscription:', error);
      Alert.alert('Error', 'Failed to pause subscription');
    }
  };

  const handleResume = async () => {
    Alert.alert(
      'Resume Subscription',
      'Are you sure you want to resume this subscription?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resume',
          onPress: async () => {
            try {
              await SubscriptionService.resumeSubscription(subscriptionId!);
              await loadSubscription();
              Alert.alert('✅ Resumed', 'Subscription resumed successfully');
            } catch (error) {
              console.error('Error resuming subscription:', error);
              Alert.alert('Error', 'Failed to resume subscription');
            }
          },
        },
      ]
    );
  };

  const handleCancel = () => {
    setShowCancelModal(true);
  };

  const handleConfirmCancel = async () => {
    try {
      await SubscriptionService.cancelSubscription(subscriptionId!);
      setShowCancelModal(false);
      Alert.alert('✅ Cancelled', 'Subscription cancelled successfully', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      Alert.alert('Error', 'Failed to cancel subscription');
    }
  };

  const toggleDay = (dayId: number) => {
    setModifyForm(prev => ({
      ...prev,
      customDays: prev.customDays.includes(dayId)
        ? prev.customDays.filter((d) => d !== dayId)
        : [...prev.customDays, dayId],
    }));
  };

  if (loading) {
    return (
      <AppLayout>
        <AppBar 
          title="Subscription Details" 
          onBack={() => navigation.goBack()} 
          variant="surface" 
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading subscription...</Text>
        </View>
      </AppLayout>
    );
  }

  if (!subscription) {
    return (
      <AppLayout>
        <AppBar 
          title="Subscription Details" 
          onBack={() => navigation.goBack()} 
          variant="surface" 
        />
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Subscription not found</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.emptyButton}>
            <Text style={styles.emptyButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </AppLayout>
    );
  }

  const renderDetails = () => (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
      {/* Product Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Product Details</Text>
        <View style={styles.infoCard}>
          <Text style={styles.productName}>{subscription.productName}</Text>
          <Text style={styles.productBrand}>{subscription.brand}</Text>
          <View style={styles.productSpecs}>
            <Text style={styles.productSpec}>
              📦 {formatQuantity(subscription.quantity, subscription.unit)}
            </Text>
            <Text style={styles.productSpec}>
              💰 {formatCurrency(subscription.price || 0)}
            </Text>
          </View>
        </View>
      </View>

      {/* Delivery Schedule */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Delivery Schedule</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>⏰ Delivery Time</Text>
            <Text style={styles.infoValue}>
              {subscription.deliveryTime === 'morning' ? '🌅 Morning' : '🌆 Evening'}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>📅 Frequency</Text>
            <Text style={styles.infoValue}>
              {subscription.frequency === 'daily'
                ? 'Daily'
                : subscription.frequency === 'alternate'
                ? 'Alternate Days'
                : 'Custom Schedule'}
            </Text>
          </View>
          {subscription.frequency === 'custom' && subscription.customDays && (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Custom Days</Text>
                <View style={styles.daysDisplay}>
                  {WEEK_DAYS.filter((day) => subscription.customDays?.includes(day.id)).map((day) => (
                    <View key={day.id} style={styles.dayChip}>
                      <Text style={styles.dayChipText}>{day.short}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          )}
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>📍 Next Delivery</Text>
            <Text style={styles.infoValue}>
              {subscription.nextDeliveryDate 
                ? new Date(subscription.nextDeliveryDate).toLocaleDateString('en-IN')
                : 'Not scheduled'}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>🚀 Start Date</Text>
            <Text style={styles.infoValue}>
              {subscription.startDate 
                ? new Date(subscription.startDate).toLocaleDateString('en-IN')
                : 'Unknown'}
            </Text>
          </View>
        </View>
      </View>

      {/* Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Status</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Current Status</Text>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor:
                    subscription.status === 'active'
                      ? '#E8F5E9'
                      : subscription.status === 'paused'
                      ? '#FFF3E0'
                      : '#FFEBEE',
                },
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  {
                    color:
                      subscription.status === 'active'
                        ? '#4CAF50'
                        : subscription.status === 'paused'
                        ? '#FF9800'
                        : '#F44336',
                  },
                ]}
              >
                {subscription.status === 'active'
                  ? '✅ Active'
                  : subscription.status === 'paused'
                  ? '⏸️ Paused'
                  : '❌ Cancelled'}
              </Text>
            </View>
          </View>
          {subscription.status === 'paused' && subscription.pausedUntil && (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Paused Until</Text>
                <Text style={styles.infoValue}>
                  {new Date(subscription.pausedUntil).toLocaleDateString('en-IN')}
                </Text>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Statistics */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Delivery Statistics</Text>
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: '#E3F2FD' }]}>
            <Text style={styles.statValue}>{subscription.totalDeliveries}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#E8F5E9' }]}>
            <Text style={styles.statValue}>{subscription.successfulDeliveries}</Text>
            <Text style={styles.statLabel}>Delivered</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#FFF3E0' }]}>
            <Text style={styles.statValue}>{subscription.skippedDeliveries}</Text>
            <Text style={styles.statLabel}>Skipped</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#FFEBEE' }]}>
            <Text style={styles.statValue}>{subscription.missedDeliveries}</Text>
            <Text style={styles.statLabel}>Missed</Text>
          </View>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.actionButton} onPress={handleModify}>
          <Text style={styles.actionButtonText}>✏️ Modify Subscription</Text>
        </TouchableOpacity>
        {subscription.status === 'active' ? (
          <TouchableOpacity style={[styles.actionButton, styles.actionButtonWarning]} onPress={handlePause}>
            <Text style={styles.actionButtonText}>⏸️ Pause Subscription</Text>
          </TouchableOpacity>
        ) : subscription.status === 'paused' ? (
          <TouchableOpacity style={[styles.actionButton, styles.actionButtonSuccess]} onPress={handleResume}>
            <Text style={styles.actionButtonText}>▶️ Resume Subscription</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={[styles.actionButton, styles.actionButtonDanger]} onPress={handleCancel}>
          <Text style={styles.actionButtonText}>❌ Cancel Subscription</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  const renderHistory = () => (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Delivery History</Text>
        <Text style={styles.placeholderText}>
          📦 Delivery history will be available here
        </Text>
      </View>
    </ScrollView>
  );

  const renderModify = () => (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Modify</Text>
        <Text style={styles.placeholderText}>
          ✏️ Quick modification options will be available here
        </Text>
      </View>
    </ScrollView>
  );

  return (
    <AppLayout>
      <AppBar 
        title="Subscription Details" 
        onBack={() => navigation.goBack()} 
        variant="surface" 
      />

      {/* Tabs */}
      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBarContent}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'details' && styles.tabActive]}
            onPress={() => setActiveTab('details')}
          >
            <Text style={[styles.tabText, activeTab === 'details' && styles.tabTextActive]}>Details</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'history' && styles.tabActive]}
            onPress={() => setActiveTab('history')}
          >
            <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>History</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'modify' && styles.tabActive]}
            onPress={() => setActiveTab('modify')}
          >
            <Text style={[styles.tabText, activeTab === 'modify' && styles.tabTextActive]}>Modify</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Content */}
      {activeTab === 'details' && renderDetails()}
      {activeTab === 'history' && renderHistory()}
      {activeTab === 'modify' && renderModify()}

      {/* Modify Modal */}
      <Modal visible={showModifyModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Modify Subscription</Text>
              <TouchableOpacity onPress={() => setShowModifyModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {/* Quantity */}
              <Text style={styles.inputLabel}>Quantity</Text>
              <TextInput
                style={styles.input}
                value={modifyForm.quantity.toString()}
                onChangeText={(text) => setModifyForm({ ...modifyForm, quantity: parseFloat(text) || 1 })}
                keyboardType="numeric"
                placeholder="Enter quantity"
              />

              {/* Delivery Time */}
              <Text style={styles.inputLabel}>Delivery Time</Text>
              <View style={styles.optionRow}>
                <TouchableOpacity
                  style={[
                    styles.optionButton,
                    modifyForm.deliveryTime === 'morning' && styles.optionButtonActive,
                  ]}
                  onPress={() => setModifyForm({ ...modifyForm, deliveryTime: 'morning' })}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      modifyForm.deliveryTime === 'morning' && styles.optionButtonTextActive,
                    ]}
                  >
                    🌅 Morning
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.optionButton,
                    modifyForm.deliveryTime === 'evening' && styles.optionButtonActive,
                  ]}
                  onPress={() => setModifyForm({ ...modifyForm, deliveryTime: 'evening' })}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      modifyForm.deliveryTime === 'evening' && styles.optionButtonTextActive,
                    ]}
                  >
                    🌆 Evening
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Frequency */}
              <Text style={styles.inputLabel}>Frequency</Text>
              <View style={styles.optionColumn}>
                <TouchableOpacity
                  style={[
                    styles.optionButton,
                    modifyForm.frequency === 'daily' && styles.optionButtonActive,
                  ]}
                  onPress={() => setModifyForm({ ...modifyForm, frequency: 'daily' })}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      modifyForm.frequency === 'daily' && styles.optionButtonTextActive,
                    ]}
                  >
                    Daily
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.optionButton,
                    modifyForm.frequency === 'alternate' && styles.optionButtonActive,
                  ]}
                  onPress={() => setModifyForm({ ...modifyForm, frequency: 'alternate' })}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      modifyForm.frequency === 'alternate' && styles.optionButtonTextActive,
                    ]}
                  >
                    Alternate Days
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.optionButton,
                    modifyForm.frequency === 'custom' && styles.optionButtonActive,
                  ]}
                  onPress={() => setModifyForm({ ...modifyForm, frequency: 'custom' })}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      modifyForm.frequency === 'custom' && styles.optionButtonTextActive,
                    ]}
                  >
                    Custom Schedule
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Custom Days */}
              {modifyForm.frequency === 'custom' && (
                <>
                  <Text style={styles.inputLabel}>Select Days</Text>
                  <View style={styles.daysGrid}>
                    {WEEK_DAYS.map((day) => (
                      <TouchableOpacity
                        key={day.id}
                        style={[
                          styles.dayButton,
                          modifyForm.customDays.includes(day.id) && styles.dayButtonActive,
                        ]}
                        onPress={() => toggleDay(day.id)}
                      >
                        <Text
                          style={[
                            styles.dayButtonText,
                            modifyForm.customDays.includes(day.id) && styles.dayButtonTextActive,
                          ]}
                        >
                          {day.short}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={() => setShowModifyModal(false)}
                >
                  <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalButton} onPress={handleSaveModification}>
                  <Text style={styles.modalButtonText}>Save Changes</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Pause Modal */}
      <Modal visible={showPauseModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pause Subscription</Text>
              <TouchableOpacity onPress={() => setShowPauseModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>Number of Days</Text>
            <TextInput
              style={styles.input}
              value={pauseDays}
              onChangeText={setPauseDays}
              keyboardType="numeric"
              placeholder="Enter number of days"
            />
            <Text style={styles.helperText}>
              Subscription will be paused for {pauseDays} days and automatically resume after that.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => setShowPauseModal(false)}
              >
                <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalButton} onPress={handleSavePause}>
                <Text style={styles.modalButtonText}>Pause</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Cancel Confirmation Modal */}
      <Modal visible={showCancelModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Cancel Subscription?</Text>
            <Text style={styles.modalText}>
              Are you sure you want to cancel this subscription? This action cannot be undone.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => setShowCancelModal(false)}
              >
                <Text style={styles.modalButtonSecondaryText}>Go Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonDanger]}
                onPress={handleConfirmCancel}
              >
                <Text style={styles.modalButtonText}>Cancel Subscription</Text>
              </TouchableOpacity>
            </View>
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
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tabBarContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tab: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginRight: 10,
    borderRadius: 12,
  },
  tabActive: {
    backgroundColor: '#0D9488',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748B',
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#F8FAFC',
  },
  emptyText: {
    fontSize: 18,
    color: '#64748B',
    marginBottom: 24,
    fontWeight: '500',
  },
  emptyButton: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  productName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  productBrand: {
    fontSize: 15,
    color: '#64748B',
    marginBottom: 14,
  },
  productSpecs: {
    flexDirection: 'row',
    gap: 16,
  },
  productSpec: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoLabel: {
    fontSize: 15,
    color: '#64748B',
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  daysDisplay: {
    flexDirection: 'row',
    gap: 6,
  },
  dayChip: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  dayChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statusBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  statCard: {
    width: '47%',
    margin: '1.5%',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  actionButton: {
    backgroundColor: '#0D9488',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButtonWarning: {
    backgroundColor: '#F59E0B',
  },
  actionButtonSuccess: {
    backgroundColor: '#10B981',
  },
  actionButtonDanger: {
    backgroundColor: '#DC2626',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  placeholderText: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    padding: 32,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 28,
    width: '100%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E293B',
    letterSpacing: -0.3,
  },
  modalText: {
    fontSize: 15,
    color: '#64748B',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalClose: {
    fontSize: 28,
    color: '#64748B',
    fontWeight: '300',
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 10,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    color: '#1E293B',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  helperText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 8,
    lineHeight: 18,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  optionColumn: {
    gap: 8,
  },
  optionButton: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionButtonActive: {
    backgroundColor: '#CCFBF1',
    borderColor: '#0D9488',
  },
  optionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },
  optionButtonTextActive: {
    color: '#0D9488',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  dayButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  dayButtonActive: {
    backgroundColor: '#0D9488',
    borderColor: '#0D9488',
  },
  dayButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  dayButtonTextActive: {
    color: '#FFFFFF',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 28,
  },
  modalButton: {
    flex: 1,
    backgroundColor: '#0D9488',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  modalButtonDanger: {
    backgroundColor: '#DC2626',
  },
  modalButtonSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalButtonSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
});
