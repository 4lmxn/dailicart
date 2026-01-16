import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  Platform,
} from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { theme } from '../../theme';
import { AppBar } from '../../components/AppBar';
import { formatCurrency, formatSocietyAddress, parseAddressJson, getLocalDateString } from '../../utils/helpers';
import { WalletService } from '../../services/api/wallet';
import { SubscriptionService } from '../../services/api/subscriptions';
import { supabase } from '../../services/supabase';
import { getDefaultAddress } from '../../services/address';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_PADDING = 20;
const CARD_MARGIN = 16;

// Delivery status helper to avoid nested ternaries
type DeliveryStatus = 'missed' | 'pending' | 'skipped' | 'delivered';

function getDeliveryStatus(missed: number, pending: number, skipped: number, delivered: number): DeliveryStatus {
  if (missed > 0) return 'missed';
  if (pending > 0) return 'pending';
  if (skipped > 0 && delivered === 0) return 'skipped';
  return 'delivered';
}

const DELIVERY_STATUS_CONFIG = {
  missed: { icon: '❌', title: 'Delivery Issue!', style: 'Missed' },
  pending: { icon: '🚚', title: "Today's Deliveries", style: 'Pending' },
  skipped: { icon: '⏭️', title: 'Delivery Skipped', style: 'Skipped' },
  delivered: { icon: '✅', title: 'Delivered Successfully!', style: 'Delivered' },
} as const;

interface CustomerHomeScreenProps {
  onNavigateToProducts?: () => void;
  onNavigateToWallet?: () => void;
  onNavigateToOrders?: () => void;
  onNavigateToCalendar?: () => void;
  onNavigateToSubscriptions?: () => void;
  onNavigateToProfile?: () => void;
  onNavigateToSupport?: () => void;
}

export const CustomerHomeScreen: React.FC<CustomerHomeScreenProps> = ({
  onNavigateToProducts,
  onNavigateToWallet,
  onNavigateToOrders,
  onNavigateToCalendar,
  onNavigateToSubscriptions,
  onNavigateToProfile,
  onNavigateToSupport,
}) => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [activeSubscriptions, setActiveSubscriptions] = useState<any[]>([]);
  const [todayPending, setTodayPending] = useState(0);
  const [todayDelivered, setTodayDelivered] = useState(0);
  const [todayMissed, setTodayMissed] = useState(0);
  const [todaySkipped, setTodaySkipped] = useState(0);
  const [addressLine, setAddressLine] = useState<string | null>(null);

  const loadData = async () => {
    if (!user) return;

    try {
      // Subscriptions and wallet use user_id directly
      const [walletData, subscriptionsData, defaultAddr] = await Promise.all([
        WalletService.getBalance(user.id),
        SubscriptionService.getCustomerSubscriptions(user.id),
        getDefaultAddress(user.id),
      ]);

      // `getBalance` returns a number; assign directly
      setWalletBalance(walletData);
      const active = subscriptionsData.filter((s: any) => s.status === 'active');
      setActiveSubscriptions(active);
      
      // Count today's orders - both pending and delivered
      const today = getLocalDateString();
      const { data: todayOrders } = await supabase
        .from('orders')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('delivery_date', today);
      
      const pending = (todayOrders || []).filter(o => 
        ['scheduled', 'pending', 'assigned', 'in_transit'].includes(o.status)
      ).length;
      const delivered = (todayOrders || []).filter(o => o.status === 'delivered').length;
      const missed = (todayOrders || []).filter(o => o.status === 'missed').length;
      const skipped = (todayOrders || []).filter(o => o.status === 'skipped').length;
      
      setTodayPending(pending);
      setTodayDelivered(delivered);
      setTodayMissed(missed);
      setTodaySkipped(skipped);

      // Address from addresses table
      if (defaultAddr) {
        const parts = [
          defaultAddr.apartment_number,
          defaultAddr.society_name,
          defaultAddr.area,
          defaultAddr.city,
        ].filter(Boolean);
        setAddressLine(parts.join(', ') || null);
      } else {
        setAddressLine(null);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  return (
    <View style={styles.container}>
      <AppBar
        title="Customer Dashboard"
        subtitle={user?.name || 'Guest'}
        variant="surface"
        actions={onNavigateToProfile ? [{ label: 'Profile', icon: '👤', onPress: onNavigateToProfile }] : []}
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
          <Text style={styles.greetingText}>{getGreeting()}, {user?.name?.split(' ')[0] || 'there'}! 👋</Text>
          <Text style={styles.greetingSubtext}>
            {todayPending > 0 
              ? `You have ${todayPending} pending delivery${todayPending > 1 ? 'ies' : ''} today`
              : todayDelivered > 0
                ? `${todayDelivered} delivery${todayDelivered > 1 ? 'ies' : ''} completed today ✓`
                : 'No deliveries scheduled for today'
            }
          </Text>
        </View>

        {/* Address Identity - Improved UI */}
        <TouchableOpacity 
          style={styles.addressCard}
          onPress={onNavigateToProfile}
          activeOpacity={0.7}
        >
          <View style={styles.addressIconContainer}>
            <Text style={styles.addressIcon}>📍</Text>
          </View>
          <View style={styles.addressContent}>
            <Text style={styles.addressLabel}>Delivering to</Text>
            {addressLine ? (
              <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="tail">
                {addressLine}
              </Text>
            ) : (
              <Text style={styles.addressPlaceholder}>Add delivery address</Text>
            )}
          </View>
          <View style={styles.addressChevron}>
            <Text style={styles.chevronText}>›</Text>
          </View>
        </TouchableOpacity>
        {/* Low Balance Alert Banner */}
        {walletBalance < 100 && (
          <View style={[styles.alertBanner, walletBalance < 50 && styles.alertBannerCritical]}>
            <View style={styles.alertIcon}>
              <Text style={styles.alertIconText}>⚠️</Text>
            </View>
            <View style={styles.alertContent}>
              <Text style={styles.alertTitle}>
                {walletBalance < 50 ? 'Critical: Low Wallet Balance' : 'Low Wallet Balance'}
              </Text>
              <Text style={styles.alertMessage}>
                Your balance is {formatCurrency(walletBalance)}. Recharge now to avoid delivery interruptions.
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.alertButton}
              onPress={onNavigateToWallet}
              activeOpacity={0.7}
            >
              <Text style={styles.alertButtonText}>Recharge</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Wallet Card - Enhanced */}
        <TouchableOpacity style={styles.walletCard} onPress={onNavigateToWallet} activeOpacity={0.8}>
          <View style={styles.walletGradientOverlay} />
          <View style={styles.walletHeader}>
            <View>
              <Text style={styles.walletLabel}>Wallet Balance</Text>
              <Text style={styles.walletAmount}>{formatCurrency(walletBalance)}</Text>
            </View>
            <View style={[styles.walletStatusBadge, walletBalance < 100 ? styles.walletStatusLow : styles.walletStatusGood]}>
              <Text style={styles.walletStatusIcon}>{walletBalance < 100 ? '⚠️' : '✓'}</Text>
              <Text style={[styles.walletStatusText, walletBalance < 100 ? styles.walletStatusTextLow : styles.walletStatusTextGood]}>
                {walletBalance < 50 ? 'Critical' : walletBalance < 100 ? 'Low' : 'Good'}
              </Text>
            </View>
          </View>
          <View style={styles.walletFooter}>
            <View style={styles.walletActionButton}>
              <Text style={styles.walletActionText}>+ Add Money</Text>
            </View>
            <Text style={styles.walletHint}>Instant recharge via UPI</Text>
          </View>
        </TouchableOpacity>

        {/* Today's Deliveries Card - Shows different states */}
        {(todayPending > 0 || todayDelivered > 0 || todayMissed > 0 || todaySkipped > 0) && (() => {
          const status = getDeliveryStatus(todayMissed, todayPending, todaySkipped, todayDelivered);
          const config = DELIVERY_STATUS_CONFIG[status];
          
          return (
            <TouchableOpacity 
              style={[
                styles.todayCard,
                status === 'delivered' && styles.todayCardDelivered,
                status === 'missed' && styles.todayCardMissed,
                status === 'skipped' && styles.todayCardSkipped,
              ]}
              onPress={onNavigateToCalendar}
              activeOpacity={0.7}
            >
              <View style={styles.todayLeft}>
                <View style={[
                  styles.todayIconContainer,
                  status === 'delivered' && styles.todayIconContainerDelivered,
                  status === 'missed' && styles.todayIconContainerMissed,
                ]}>
                  <Text style={styles.todayIconText}>{config.icon}</Text>
                  {status === 'pending' && <View style={styles.todayPulse} />}
                </View>
                <View style={styles.todayContent}>
                  <Text style={[
                    styles.todayTitle,
                    status === 'delivered' && styles.todayTitleDelivered,
                    status === 'missed' && styles.todayTitleMissed,
                  ]}>
                    {config.title}
                  </Text>
                <Text style={[
                  styles.todayCount,
                  status === 'delivered' && styles.todayCountDelivered,
                  status === 'missed' && styles.todayCountMissed,
                ]}>
                  {status === 'missed' 
                    ? `${todayMissed} item${todayMissed !== 1 ? 's' : ''} not delivered • Contact support`
                    : status === 'pending' 
                      ? `${todayPending} item${todayPending !== 1 ? 's' : ''} • On the way`
                      : status === 'skipped'
                        ? `${todaySkipped} item${todaySkipped !== 1 ? 's' : ''} • Paused by you`
                        : `${todayDelivered} item${todayDelivered !== 1 ? 's' : ''} • Enjoy your fresh products!`
                  }
                </Text>
              </View>
            </View>
            <View style={styles.todayChevron}>
              <Text style={[
                styles.todayChevronText,
                status === 'delivered' && styles.todayChevronDelivered,
                status === 'missed' && styles.todayChevronMissed,
              ]}>→</Text>
            </View>
          </TouchableOpacity>
          );
        })()}

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity style={styles.actionCard} onPress={onNavigateToProducts}>
              <View style={styles.actionIcon}>
                <Text style={styles.actionEmoji}>🛒</Text>
              </View>
              <Text style={styles.actionLabel}>Products</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard} onPress={onNavigateToSubscriptions}>
              <View style={styles.actionIcon}>
                <Text style={styles.actionEmoji}>📦</Text>
              </View>
              <Text style={styles.actionLabel}>My Orders</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard} onPress={onNavigateToCalendar}>
              <View style={styles.actionIcon}>
                <Text style={styles.actionEmoji}>📅</Text>
              </View>
              <Text style={styles.actionLabel}>Calendar</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard} onPress={onNavigateToOrders}>
              <View style={styles.actionIcon}>
                <Text style={styles.actionEmoji}>🕐</Text>
              </View>
              <Text style={styles.actionLabel}>History</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard} onPress={onNavigateToSupport}>
              <View style={styles.actionIcon}>
                <Text style={styles.actionEmoji}>🎧</Text>
              </View>
              <Text style={styles.actionLabel}>Support</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Active Subscriptions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Active Subscriptions</Text>
            <TouchableOpacity onPress={onNavigateToSubscriptions}>
              <Text style={styles.sectionLink}>View All</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : activeSubscriptions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyTitle}>No Active Subscriptions</Text>
              <Text style={styles.emptyText}>Start your first milk subscription today!</Text>
              <TouchableOpacity style={styles.emptyButton} onPress={onNavigateToProducts}>
                <Text style={styles.emptyButtonText}>Browse Products</Text>
              </TouchableOpacity>
            </View>
          ) : (
            activeSubscriptions.slice(0, 3).map((sub, index) => (
              <TouchableOpacity
                key={sub.id}
                style={[styles.subCard, index > 0 && styles.subCardMargin]}
                onPress={onNavigateToSubscriptions}
                activeOpacity={0.7}
              >
                <View style={styles.subHeader}>
                  <Text style={styles.subProduct}>{sub.productName}</Text>
                  <View style={styles.subBadge}>
                    <Text style={styles.subBadgeText}>Active</Text>
                  </View>
                </View>
                <Text style={styles.subBrand}>{sub.brand}</Text>
                <View style={styles.subFooter}>
                  <View style={styles.subDetail}>
                    <Text style={styles.subDetailLabel}>Quantity:</Text>
                    <Text style={styles.subDetailValue}>
                      {sub.quantity === 1 ? sub.unit : `${sub.quantity} × ${sub.unit}`}
                    </Text>
                  </View>
                  <View style={styles.subDetail}>
                    <Text style={styles.subDetailLabel}>Next:</Text>
                    <Text style={styles.subDetailValue}>
                      {new Date(sub.nextDeliveryDate).toLocaleDateString('en-IN', { 
                        day: 'numeric', 
                        month: 'short' 
                      })}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
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
  // Header removed in favor of shared AppBar
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  // Greeting Section Styles
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
  // Enhanced Wallet Card Styles
  walletCard: {
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
  walletGradientOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.1)',
    transform: [{ translateX: 50 }, { translateY: -50 }],
  },
  walletHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  walletLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  walletStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  walletStatusGood: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  walletStatusLow: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  walletStatusIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  walletStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  walletStatusTextGood: {
    color: '#86EFAC',
  },
  walletStatusTextLow: {
    color: '#FCA5A5',
  },
  walletAmount: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1.5,
    marginTop: 4,
  },
  walletFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  walletActionButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  walletActionText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  walletHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  // Enhanced Today's Deliveries Styles
  todayCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  todayLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  todayIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FCD34D',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  todayPulse: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22C55E',
    top: -2,
    right: -2,
    borderWidth: 2,
    borderColor: '#FEF3C7',
  },
  todayIconText: {
    fontSize: 22,
  },
  todayContent: {
    flex: 1,
  },
  todayTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 2,
  },
  todayCount: {
    fontSize: 13,
    color: '#B45309',
    fontWeight: '500',
  },
  todayChevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FDE68A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  todayChevronText: {
    fontSize: 16,
    color: '#92400E',
    fontWeight: '600',
  },
  // Delivered state styles
  todayCardDelivered: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  todayIconContainerDelivered: {
    backgroundColor: '#6EE7B7',
  },
  todayTitleDelivered: {
    color: '#065F46',
  },
  todayCountDelivered: {
    color: '#047857',
  },
  todayChevronDelivered: {
    color: '#065F46',
  },
  // Missed state styles
  todayCardMissed: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  todayIconContainerMissed: {
    backgroundColor: '#FCA5A5',
  },
  todayTitleMissed: {
    color: '#991B1B',
  },
  todayCountMissed: {
    color: '#B91C1C',
  },
  todayChevronMissed: {
    color: '#991B1B',
  },
  // Skipped state styles
  todayCardSkipped: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  // Address Card Styles
  addressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  addressIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  addressIcon: {
    fontSize: 20,
  },
  addressContent: {
    flex: 1,
  },
  addressLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 2,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addressText: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
  },
  addressPlaceholder: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '500',
    fontStyle: 'italic',
  },
  addressChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  chevronText: {
    fontSize: 18,
    color: '#64748B',
    fontWeight: '600',
  },
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
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F8FAFC',
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
  loadingContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
  },
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
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  alertBanner: {
    backgroundColor: '#FFF3E0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFB74D',
  },
  alertBannerCritical: {
    backgroundColor: '#FFEBEE',
    borderColor: '#EF5350',
  },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  alertIconText: {
    fontSize: 20,
  },
  alertContent: {
    flex: 1,
    marginRight: 12,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F57C00',
    marginBottom: 4,
  },
  alertMessage: {
    fontSize: 12,
    color: '#E65100',
    lineHeight: 16,
  },
  alertButton: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  alertButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  subCardMargin: {
    marginTop: 12,
  },
  subHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  subProduct: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    marginRight: 8,
  },
  subBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  subBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16A34A',
  },
  subBrand: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 16,
    fontWeight: '500',
  },
  subFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  subDetail: {
    flex: 1,
  },
  subDetailLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 4,
    fontWeight: '500',
  },
  subDetailValue: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
  },
  bottomSpacer: {
    height: 20,
  },
});
