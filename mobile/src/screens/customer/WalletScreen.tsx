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
  Switch,
  RefreshControl,
} from 'react-native';
import { AppLayout } from '../../components/AppLayout';
import { AppBar } from '../../components/AppBar';
import { theme } from '../../theme';
import { formatCurrency } from '../../utils/helpers';
import { supabase } from '../../services/supabase';
import { useAuthStore } from '../../store/authStore';
import { EmptyState } from '../../components/EmptyState';
import { ErrorBanner } from '../../components/ErrorBanner';
import { useToast } from '../../components/Toast';
import { Skeleton } from '../../components/Skeleton';
import { MINIMUM_BALANCE } from '../../constants';
import { WalletService } from '../../services/api/wallet';

const LOW_BALANCE_THRESHOLD = 150;
const AUTO_RECHARGE_MIN = MINIMUM_BALANCE;
const PRESET_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];

const PAYMENT_METHODS = [
  { id: 'upi', name: 'UPI', icon: '📱', recommended: true },
  { id: 'card', name: 'Debit/Credit Card', icon: '💳', recommended: false },
  { id: 'netbanking', name: 'Net Banking', icon: '🏦', recommended: false },
  { id: 'wallet', name: 'Paytm/PhonePe', icon: '👛', recommended: false },
];

interface WalletScreenProps {
  onBack: () => void;
}

export const WalletScreen: React.FC<WalletScreenProps> = ({ onBack }) => {
  const toast = useToast();
  const [walletBalance, setWalletBalance] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [showAutoRechargeModal, setShowAutoRechargeModal] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('upi');
  
  // Payment verification states
  const [paymentInProgress, setPaymentInProgress] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'pending' | 'verifying' | 'confirmed' | 'failed'>('idle');
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null);
  const [transactionFilter, setTransactionFilter] = useState<'all' | 'credit' | 'debit'>('all');
  
  // Auto-recharge settings
  const [autoRechargeEnabled, setAutoRechargeEnabled] = useState(false);
  const [autoRechargeThreshold, setAutoRechargeThreshold] = useState(MINIMUM_BALANCE.toString());
  const [autoRechargeAmount, setAutoRechargeAmount] = useState('200');

  // Load wallet data on mount
  useEffect(() => {
    loadWalletData();
  }, []);

  const loadWalletData = async () => {
    try {
      setLoading(true);
      setError(null);

      const authUser = useAuthStore.getState().user;
      if (!authUser) {
        throw new Error('Please login to view wallet');
      }

      // Fetch wallet balance
      const { data: profile, error: profileError } = await supabase
        .from('customers')
        .select('wallet_balance, auto_deduct')
        .eq('user_id', authUser.id)
        .single();

      if (profileError) throw profileError;

      if (profile) {
        setWalletBalance(profile.wallet_balance || 0);
        setAutoRechargeEnabled(profile.auto_deduct || false);
      }

      // Load transaction history
      const txns = await WalletService.getTransactions(authUser.id, 50);
      setTransactions(txns);
    } catch (error: any) {
      console.error('Error loading wallet:', error);
      setError(error.message || 'Failed to load wallet data. Please try again.');
      toast.show('Failed to load wallet', { type: 'error' });
      // On failure, keep existing state; do not inject sample data
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadWalletData();
    setRefreshing(false);
  };

  const isBelowMinimum = walletBalance < MINIMUM_BALANCE;
  const isLowBalance = walletBalance < LOW_BALANCE_THRESHOLD;

  const handleRecharge = () => {
    const amount = selectedAmount || parseInt(customAmount);
    if (!amount || amount < 50) {
      Alert.alert('Invalid Amount', 'Minimum recharge amount is ₹50');
      return;
    }

    const newBalance = walletBalance + amount;
    const willReachMinimum = newBalance >= MINIMUM_BALANCE;
    
    const paymentMethod = PAYMENT_METHODS.find(m => m.id === selectedPaymentMethod);
    
    Alert.alert(
      'Payment Confirmation',
      `Amount: ${formatCurrency(amount)}\n` +
      `Payment Method: ${paymentMethod?.name}\n` +
      `New Balance: ${formatCurrency(newBalance)}\n\n` +
      `${!willReachMinimum ? '⚠️ Note: Balance will still be below minimum ₹' + MINIMUM_BALANCE : '✅ Balance will be sufficient'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Pay Now', 
          onPress: async () => {
            try {
              setShowRechargeModal(false);
              setPaymentInProgress(true);
              setVerificationStatus('pending');
              
              const { razorpayService } = await import('../../services/payment/razorpayService');
              const { generateIdempotencyKey } = await import('../../services/api/payment');
              
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) {
                Alert.alert('Error', 'Please login to continue');
                setPaymentInProgress(false);
                setVerificationStatus('idle');
                return;
              }

              const { data: profile } = await supabase
                .from('users')
                .select('id,name,phone,email')
                .eq('id', user.id)
                .single();

              // Generate idempotency key to prevent duplicate charges
              const idempotencyKey = generateIdempotencyKey(user.id, 'razorpay');

              toast.show('🔒 Opening secure payment gateway...', { type: 'info' });

              // Initiate Razorpay payment with userId and idempotency key
              const result = await razorpayService.initiatePayment({
                amount: amount,
                customerName: profile?.name || user.email || 'Customer',
                customerEmail: user.email || '',
                customerPhone: profile?.phone || '',
                description: `Wallet recharge of ₹${amount}`,
                userId: user.id,
                idempotencyKey,
              });

              if (result.success && result.paymentId) {
                setVerificationStatus('verifying');
                setLastPaymentId(result.paymentId);
                toast.show('✓ Payment successful, verifying...', { type: 'info' });

                // Record transaction (with retry logic built into service)
                const recorded = await razorpayService.recordWalletTransaction(
                  user.id,
                  amount,
                  result.paymentId,
                  result.orderId || '',
                  idempotencyKey
                );

                if (recorded) {
                  setVerificationStatus('confirmed');

                  // Refresh wallet balance
                  const { data: updatedProfile } = await supabase
                    .from('customers')
                    .select('wallet_balance')
                    .eq('user_id', user.id)
                    .single();

                  const updatedBalance = updatedProfile?.wallet_balance || 0;

                  // Check if user now has sufficient balance and has paused subscriptions
                  if (updatedBalance >= MINIMUM_BALANCE) {
                    const { data: pausedSubs, error: pausedError } = await supabase
                      .from('subscriptions')
                      .select('id')
                      .eq('user_id', user.id)
                      .eq('status', 'paused')
                      .is('pause_end_date', null);

                    if (!pausedError && pausedSubs && pausedSubs.length > 0) {
                      // User has auto-paused subscriptions, offer to resume
                      Alert.alert(
                        'Resume Subscriptions? 🎉',
                        `Your balance is now ${formatCurrency(updatedBalance)}!\n\n` +
                        `You have ${pausedSubs.length} paused subscription${pausedSubs.length > 1 ? 's' : ''} ` +
                        `that were auto-paused due to low balance.\n\nWould you like to resume them?`,
                        [
                          {
                            text: 'Not Now',
                            style: 'cancel',
                            onPress: () => {
                              setSelectedAmount(null);
                              setCustomAmount('');
                              loadWalletData();
                            }
                          },
                          {
                            text: 'Resume All',
                            onPress: async () => {
                              // First verify subscriptions are still paused
                              const { data: stillPaused } = await supabase
                                .from('subscriptions')
                                .select('id')
                                .eq('user_id', user.id)
                                .eq('status', 'paused')
                                .is('pause_end_date', null);
                              
                              if (!stillPaused || stillPaused.length === 0) {
                                toast.show('Subscriptions already resumed', { type: 'info' });
                                setSelectedAmount(null);
                                setCustomAmount('');
                                loadWalletData();
                                return;
                              }
                              
                              const { error: resumeError } = await supabase
                                .from('subscriptions')
                                .update({
                                  status: 'active',
                                  pause_start_date: null,
                                  pause_end_date: null,
                                  updated_at: new Date().toISOString(),
                                })
                                .in('id', stillPaused.map(s => s.id));

                              if (!resumeError) {
                                toast.show(`✅ ${stillPaused.length} subscription${stillPaused.length > 1 ? 's' : ''} resumed!`, { type: 'success' });
                              } else {
                                toast.show('Failed to resume subscriptions', { type: 'error' });
                              }
                              setSelectedAmount(null);
                              setCustomAmount('');
                              loadWalletData();
                            }
                          }
                        ]
                      );
                      // Exit early after offering resume; no further success alert
                      return;
                    }
                  }

                  // No paused subs to resume; show success confirmation
                  toast.show('🎉 Wallet recharged successfully!', { type: 'success' });
                  Alert.alert(
                    'Payment Successful! 🎉',
                    `₹${amount} added to your wallet\n` +
                    `New Balance: ${formatCurrency(updatedBalance)}\n\n` +
                    `Transaction ID: ${result.paymentId}\n` +
                    `Payment Method: ${paymentMethod?.name || 'Razorpay'}`,
                    [
                      {
                        text: 'Great!',
                        onPress: () => {
                          setSelectedAmount(null);
                          setCustomAmount('');
                          loadWalletData();
                        }
                      }
                    ]
                  );
                } else {
                  setVerificationStatus('failed');
                  toast.show('⚠️ Payment succeeded but verification failed', { type: 'error' });
                  Alert.alert(
                    'Payment Processing',
                    'Your payment was successful but there was an issue updating your wallet. ' +
                    'Please contact support with payment ID: ' + result.paymentId,
                    [{ text: 'OK' }]
                  );
                }
              } else {
                setVerificationStatus('failed');
                if (result.errorCode === 'USER_CANCELLED') {
                  console.log('User cancelled payment');
                  toast.show('Payment cancelled', { type: 'info' });
                } else {
                  toast.show('Payment failed', { type: 'error' });
                  Alert.alert(
                    'Payment Failed',
                    result.error || 'Something went wrong. Please try again.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Retry',
                        onPress: () => setShowRechargeModal(true)
                      }
                    ]
                  );
                }
              }
            } catch (error: any) {
              console.error('❌ Payment error:', error);
              setVerificationStatus('failed');
              toast.show('Payment error occurred', { type: 'error' });
              Alert.alert(
                'Payment Error',
                error.message || 'An unexpected error occurred. Please try again.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { 
                    text: 'Retry', 
                    onPress: () => setShowRechargeModal(true) 
                  }
                ]
              );
            } finally {
              setPaymentInProgress(false);
              // Reset verification status after a delay
              setTimeout(() => setVerificationStatus('idle'), 3000);
            }
          }
        }
      ]
    );
  };

  const handleSaveAutoRecharge = () => {
    const threshold = parseInt(autoRechargeThreshold);
    const amount = parseInt(autoRechargeAmount);
    
    if (threshold < MINIMUM_BALANCE) {
      Alert.alert('Invalid Threshold', `Auto-recharge threshold must be at least ₹${MINIMUM_BALANCE}`);
      return;
    }
    
    if (amount < AUTO_RECHARGE_MIN) {
      Alert.alert('Invalid Amount', `Auto-recharge amount must be at least ₹${AUTO_RECHARGE_MIN}`);
      return;
    }
    
    Alert.alert(
      'Auto-Recharge ' + (autoRechargeEnabled ? 'Enabled' : 'Disabled'),
      autoRechargeEnabled 
        ? `Your wallet will auto-recharge ₹${amount} when balance falls below ₹${threshold}`
        : 'Auto-recharge has been disabled',
      [{ text: 'Got it!' }]
    );
    setShowAutoRechargeModal(false);
  };

  const filteredTransactions = transactions.filter(t => {
    if (transactionFilter === 'all') return true;
    return t.type === transactionFilter;
  });

  const rechargeAmount = selectedAmount || parseInt(customAmount) || 0;

  return (
    <AppLayout>
      <AppBar title="Wallet" onBack={onBack} variant="surface" />

      {error && <ErrorBanner message={error} onRetry={loadWalletData} />}

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Payment Verification Status */}
        {verificationStatus !== 'idle' && (
          <View style={[
            styles.verificationBanner,
            verificationStatus === 'pending' && styles.verificationPending,
            verificationStatus === 'verifying' && styles.verificationVerifying,
            verificationStatus === 'confirmed' && styles.verificationConfirmed,
            verificationStatus === 'failed' && styles.verificationFailed,
          ]}>
            <Text style={styles.verificationIcon}>
              {verificationStatus === 'pending' && '🕒'}
              {verificationStatus === 'verifying' && '⏳'}
              {verificationStatus === 'confirmed' && '✅'}
              {verificationStatus === 'failed' && '❌'}
            </Text>
            <View style={styles.verificationTextContainer}>
              <Text style={styles.verificationTitle}>
                {verificationStatus === 'pending' && 'Payment in Progress'}
                {verificationStatus === 'verifying' && 'Verifying Payment'}
                {verificationStatus === 'confirmed' && 'Payment Confirmed'}
                {verificationStatus === 'failed' && 'Payment Failed'}
              </Text>
              <Text style={styles.verificationSubtitle}>
                {verificationStatus === 'pending' && 'Processing your payment...'}
                {verificationStatus === 'verifying' && 'Updating your wallet balance...'}
                {verificationStatus === 'confirmed' && 'Wallet recharged successfully'}
                {verificationStatus === 'failed' && 'Please try again or contact support'}
              </Text>
              {lastPaymentId && verificationStatus === 'failed' && (
                <Text style={styles.verificationPaymentId}>ID: {lastPaymentId}</Text>
              )}
            </View>
          </View>
        )}

        {/* Enhanced Balance Card with Gradient */}
        {loading ? (
          <View style={styles.balanceCard}>
            <View style={styles.balanceHeader}>
              <View>
                <Skeleton height={14} width={120} style={{ marginBottom: 8 }} />
                <Skeleton height={48} width={200} style={{ marginBottom: 8 }} />
                <Skeleton height={24} width={140} radius={12} />
              </View>
              <Skeleton height={60} width={60} radius={12} />
            </View>
            <View style={styles.balanceFooter}>
              <Skeleton height={40} width="45%" radius={12} />
              <View style={styles.balanceDivider} />
              <Skeleton height={40} width="45%" radius={12} />
            </View>
            <Skeleton height={48} width="100%" radius={30} />
          </View>
        ) : (
          <View style={[styles.balanceCard, isBelowMinimum && styles.balanceCardCritical]}>
            <View style={styles.balanceHeader}>
              <View>
                <Text style={styles.balanceLabel}>Available Balance</Text>
                <Text style={styles.balanceAmount}>{formatCurrency(walletBalance)}</Text>
              {isBelowMinimum && (
                <View style={styles.criticalBadge}>
                  <Text style={styles.criticalBadgeText}>⚠️ Below Minimum</Text>
                </View>
              )}
              {!isBelowMinimum && isLowBalance && (
                <View style={styles.warningBadge}>
                  <Text style={styles.warningBadgeText}>Low Balance</Text>
                </View>
              )}
            </View>
            <TouchableOpacity 
              style={styles.autoRechargeIcon}
              onPress={() => setShowAutoRechargeModal(true)}
            >
              <Text style={styles.autoRechargeIconText}>⚡</Text>
              <Text style={styles.autoRechargeIconLabel}>Auto</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.balanceFooter}>
            <View style={styles.balanceInfo}>
              <Text style={styles.balanceInfoLabel}>Minimum Required</Text>
              <Text style={styles.balanceInfoValue}>{formatCurrency(MINIMUM_BALANCE)}</Text>
            </View>
            <View style={styles.balanceDivider} />
            <View style={styles.balanceInfo}>
              <Text style={styles.balanceInfoLabel}>Auto-Recharge</Text>
              <Text style={styles.balanceInfoValue}>{autoRechargeEnabled ? 'ON' : 'OFF'}</Text>
            </View>
          </View>
          
          <TouchableOpacity
            style={styles.rechargeButton}
            onPress={() => setShowRechargeModal(true)}
          >
            <Text style={styles.rechargeButtonText}>💳 Recharge Wallet</Text>
          </TouchableOpacity>
        </View>
        )}

        {/* Critical Balance Alert */}
        {isBelowMinimum && (
          <View style={styles.criticalCard}>
            <Text style={styles.criticalIcon}>🚨</Text>
            <View style={styles.criticalContent}>
              <Text style={styles.criticalTitle}>Action Required!</Text>
              <Text style={styles.criticalText}>
                Your balance is below minimum ₹{MINIMUM_BALANCE}. Deliveries will be paused until you recharge.
              </Text>
              <TouchableOpacity 
                style={styles.criticalButton}
                onPress={() => setShowRechargeModal(true)}
              >
                <Text style={styles.criticalButtonText}>Recharge Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Low Balance Warning */}
        {!isBelowMinimum && isLowBalance && (
          <View style={styles.warningCard}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <View style={styles.warningContent}>
              <Text style={styles.warningTitle}>Low Balance Alert</Text>
              <Text style={styles.warningText}>
                Your wallet balance is low. Please recharge to avoid delivery interruptions.
              </Text>
            </View>
          </View>
        )}

        {/* Auto-deduct Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>ℹ️</Text>
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>How it works</Text>
            <Text style={styles.infoText}>
              • Amount is auto-deducted after each delivery{'\n'}
              • Low balance notifications sent at 9 PM{'\n'}
              • Recharge anytime using UPI, cards, or net banking
            </Text>
          </View>
        </View>

        {/* Transaction History */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Transaction History</Text>
            <Text style={styles.transactionCount}>
              {filteredTransactions.length} transactions
            </Text>
          </View>

          {/* Transaction Filters */}
          <View style={styles.filterContainer}>
            {(['all', 'credit', 'debit'] as const).map((filter) => (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterPill,
                  transactionFilter === filter && styles.filterPillActive,
                ]}
                onPress={() => setTransactionFilter(filter)}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    transactionFilter === filter && styles.filterPillTextActive,
                  ]}
                >
                  {filter === 'all' ? 'All' : filter === 'credit' ? 'Received' : 'Spent'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {loading ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <View key={i} style={styles.transactionCard}>
                  <Skeleton height={48} width={48} radius={24} style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Skeleton height={16} width="70%" style={{ marginBottom: 6 }} />
                    <Skeleton height={14} width="50%" style={{ marginBottom: 6 }} />
                    <Skeleton height={20} width={80} radius={6} />
                  </View>
                  <Skeleton height={20} width={60} />
                </View>
              ))}
            </>
          ) : filteredTransactions.length === 0 ? (
            <EmptyState
              icon="💰"
              title="No Transactions Yet"
              description="Your transaction history will appear here once you make a recharge or delivery."
              actionLabel="Recharge Wallet"
              onAction={() => setShowRechargeModal(true)}
            />
          ) : (
            filteredTransactions.map((transaction) => (
            <View key={transaction.id} style={styles.transactionCard}>
              <View style={styles.transactionIconContainer}>
                <Text style={styles.transactionIcon}>
                  {transaction.type === 'credit' ? '💰' : '📦'}
                </Text>
              </View>
              <View style={styles.transactionInfo}>
                <Text style={styles.transactionDescription}>{transaction.description}</Text>
                <Text style={styles.transactionDate}>{transaction.date}</Text>
                
                {/* Status Badge */}
                <View
                  style={[
                    styles.statusBadge,
                    transaction.status === 'completed' && styles.statusBadgeCompleted,
                    transaction.status === 'pending' && styles.statusBadgePending,
                    transaction.status === 'failed' && styles.statusBadgeFailed,
                  ]}
                >
                  <Text style={styles.statusBadgeText}>
                    {transaction.status === 'completed' ? '✓ Completed' : 
                     transaction.status === 'pending' ? '⏳ Pending' : 
                     '✗ Failed'}
                  </Text>
                </View>

                {/* Failure Reason & Retry Button */}
                {transaction.status === 'failed' && transaction.failureReason && (
                  <>
                    <Text style={styles.failureReason}>
                      Reason: {transaction.failureReason}
                    </Text>
                    <TouchableOpacity 
                      style={styles.retryButton}
                      onPress={() => {
                        Alert.alert(
                          'Retry Payment',
                          `Retry payment of ${formatCurrency(transaction.amount)}?`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { 
                              text: 'Retry',
                              onPress: () => {
                                setSelectedAmount(transaction.amount);
                                setCustomAmount('');
                                setShowRechargeModal(true);
                              }
                            }
                          ]
                        );
                      }}
                    >
                      <Text style={styles.retryButtonText}>🔄 Retry Payment</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
              <Text
                style={[
                  styles.transactionAmount,
                  transaction.type === 'credit' ? styles.creditAmount : styles.debitAmount,
                ]}
              >
                {transaction.type === 'credit' ? '+' : '-'}
                {formatCurrency(transaction.amount)}
              </Text>
            </View>
          ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Recharge Modal */}
      <Modal
        visible={showRechargeModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowRechargeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Recharge Wallet</Text>
              <TouchableOpacity onPress={() => setShowRechargeModal(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              {/* Preset Amounts */}
              <Text style={styles.modalLabel}>Select Amount</Text>
              <View style={styles.presetGrid}>
                {PRESET_AMOUNTS.map((amount) => (
                  <TouchableOpacity
                    key={amount}
                    style={[
                      styles.presetButton,
                      selectedAmount === amount && styles.presetButtonActive,
                    ]}
                    onPress={() => {
                      setSelectedAmount(amount);
                      setCustomAmount('');
                    }}
                  >
                    <Text
                      style={[
                        styles.presetButtonText,
                        selectedAmount === amount && styles.presetButtonTextActive,
                      ]}
                    >
                      ₹{amount}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Custom Amount */}
              <Text style={styles.modalLabel}>Or Enter Custom Amount</Text>
              <TextInput
                style={styles.customInput}
                placeholder="Enter amount (min ₹10)"
                keyboardType="numeric"
                value={customAmount}
                onChangeText={(text) => {
                  setCustomAmount(text);
                  setSelectedAmount(null);
                }}
              />

              {/* Payment Method Selection */}
              {rechargeAmount >= 10 && (
                <>
                  <Text style={styles.modalLabel}>Select Payment Method</Text>
                  <View style={styles.paymentMethodsGrid}>
                    {PAYMENT_METHODS.map((method) => (
                      <TouchableOpacity
                        key={method.id}
                        style={[
                          styles.paymentMethodCard,
                          selectedPaymentMethod === method.id && styles.paymentMethodCardSelected,
                        ]}
                        onPress={() => setSelectedPaymentMethod(method.id)}
                      >
                        <Text style={styles.paymentMethodIcon}>{method.icon}</Text>
                        <Text style={styles.paymentMethodName}>{method.name}</Text>
                        {method.recommended && (
                          <View style={styles.recommendedBadge}>
                            <Text style={styles.recommendedText}>⚡ Fast</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Summary */}
              {rechargeAmount >= 10 && (
                <View style={styles.rechargeSummary}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Recharge Amount</Text>
                    <Text style={styles.summaryValue}>{formatCurrency(rechargeAmount)}</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>New Balance</Text>
                    <Text style={[styles.summaryValue, { color: theme.colors.success }]}>
                      {formatCurrency(walletBalance + rechargeAmount)}
                    </Text>
                  </View>
                </View>
              )}

              {/* Recharge Button */}
              <TouchableOpacity
                style={[
                  styles.modalRechargeButton,
                  rechargeAmount < 10 && styles.modalRechargeButtonDisabled,
                ]}
                onPress={handleRecharge}
                disabled={rechargeAmount < 10}
              >
                <Text style={styles.modalRechargeButtonText}>
                  {rechargeAmount >= 10
                    ? `Proceed to Pay ${formatCurrency(rechargeAmount)}`
                    : 'Select or Enter Amount'}
                </Text>
              </TouchableOpacity>

              <Text style={styles.paymentNote}>
                🔒 Secured by Razorpay | UPI, Cards, Net Banking accepted
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Auto-Recharge Settings Modal */}
      <Modal
        visible={showAutoRechargeModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAutoRechargeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>⚡ Auto-Recharge</Text>
              <TouchableOpacity onPress={() => setShowAutoRechargeModal(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              <Text style={styles.modalDescription}>
                Never run out of balance! Auto-recharge keeps your wallet topped up automatically.
              </Text>

              {/* Enable/Disable Toggle */}
              <View style={styles.toggleContainer}>
                <View>
                  <Text style={styles.toggleLabel}>Enable Auto-Recharge</Text>
                  <Text style={styles.toggleHint}>Automatically recharge when balance is low</Text>
                </View>
                <Switch
                  value={autoRechargeEnabled}
                  onValueChange={setAutoRechargeEnabled}
                  trackColor={{ false: '#E0E0E0', true: theme.colors.primary + '40' }}
                  thumbColor={autoRechargeEnabled ? theme.colors.primary : '#F5F5F5'}
                />
              </View>

              {autoRechargeEnabled && (
                <>
                  {/* Threshold Setting */}
                  <Text style={styles.modalLabel}>Recharge When Balance Falls Below</Text>
                  <TextInput
                    style={styles.customInput}
                    placeholder={`Minimum ₹${MINIMUM_BALANCE}`}
                    keyboardType="numeric"
                    value={autoRechargeThreshold}
                    onChangeText={setAutoRechargeThreshold}
                  />

                  {/* Amount Setting */}
                  <Text style={styles.modalLabel}>Auto-Recharge Amount</Text>
                  <TextInput
                    style={styles.customInput}
                    placeholder={`Minimum ₹${AUTO_RECHARGE_MIN}`}
                    keyboardType="numeric"
                    value={autoRechargeAmount}
                    onChangeText={setAutoRechargeAmount}
                  />

                  {/* Info Box */}
                  <View style={styles.infoBox}>
                    <Text style={styles.infoBoxIcon}>ℹ️</Text>
                    <Text style={styles.infoBoxText}>
                      When your balance falls below ₹{autoRechargeThreshold}, we'll automatically recharge ₹{autoRechargeAmount} using your saved payment method.
                    </Text>
                  </View>
                </>
              )}

              {/* Save Button */}
              <TouchableOpacity
                style={styles.modalRechargeButton}
                onPress={handleSaveAutoRecharge}
              >
                <Text style={styles.modalRechargeButtonText}>
                  {autoRechargeEnabled ? 'Save Settings' : 'Disable Auto-Recharge'}
                </Text>
              </TouchableOpacity>
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
    backgroundColor: '#F5F5F5',
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
  balanceCard: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 16,
    borderRadius: 20,
    padding: 28,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
    position: 'relative',
    // Beautiful gradient background (will be implemented with LinearGradient or styled properly)
    backgroundColor: '#667eea', // Fallback solid color
  },
  balanceLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
    marginBottom: 8,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  balanceAmount: {
    fontSize: 52,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
    letterSpacing: -2,
  },
  rechargeButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rechargeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#667eea',
    marginLeft: 4,
  },
  warningCard: {
    backgroundColor: '#FFF4E5',
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1.5,
    borderColor: '#FFB84D',
    shadowColor: '#FF9800',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  warningIcon: {
    fontSize: 28,
    marginRight: 14,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F57C00',
    marginBottom: 6,
  },
  warningText: {
    fontSize: 13,
    color: '#6B4E00',
    lineHeight: 19,
  },
  infoCard: {
    backgroundColor: '#E8F5E9',
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1.5,
    borderColor: '#81C784',
  },
  infoIcon: {
    fontSize: 28,
    marginRight: 14,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  section: {
    marginTop: 8,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 12,
  },
  transactionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  transactionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transactionIcon: {
    fontSize: 24,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  creditAmount: {
    color: theme.colors.success,
  },
  debitAmount: {
    color: theme.colors.text,
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
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
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
  modalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 12,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
    marginBottom: 24,
  },
  presetButton: {
    width: '33.33%',
    paddingHorizontal: 6,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  presetButtonActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '10',
  },
  presetButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
  },
  presetButtonTextActive: {
    color: theme.colors.primary,
  },
  customInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  rechargeSummary: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
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
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: theme.colors.borderLight,
    marginVertical: 4,
  },
  modalRechargeButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  modalRechargeButtonDisabled: {
    backgroundColor: theme.colors.borderLight,
  },
  modalRechargeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  paymentNote: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  // Enhanced balance card styles
  balanceCardCritical: {
    backgroundColor: '#D32F2F',
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    width: '100%',
    marginBottom: 20,
  },
  criticalBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 8,
  },
  criticalBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  warningBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 8,
  },
  warningBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  autoRechargeIcon: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
  },
  autoRechargeIconText: {
    fontSize: 24,
  },
  autoRechargeIconLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 2,
  },
  balanceFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    padding: 12,
  },
  balanceInfo: {
    flex: 1,
    alignItems: 'center',
  },
  balanceInfoLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 4,
  },
  balanceInfoValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  balanceDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  // Critical alert styles
  criticalCard: {
    backgroundColor: '#FFEBEE',
    marginHorizontal: 24,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderLeftWidth: 4,
    borderLeftColor: '#D32F2F',
  },
  criticalIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  criticalContent: {
    flex: 1,
  },
  criticalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#D32F2F',
    marginBottom: 6,
  },
  criticalText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  criticalButton: {
    backgroundColor: '#D32F2F',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  criticalButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  toggleHint: {
    fontSize: 12,
    color: '#666',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  infoBoxIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  infoBoxText: {
    flex: 1,
    fontSize: 13,
    color: '#1565C0',
    lineHeight: 18,
  },
  paymentMethodsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  paymentMethodCard: {
    width: '48%',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paymentMethodCardSelected: {
    backgroundColor: '#E3F2FD',
    borderColor: theme.colors.primary,
  },
  paymentMethodIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  paymentMethodName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  recommendedBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 6,
  },
  recommendedText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFF',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  transactionCount: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  filterPillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  filterPillTextActive: {
    color: '#FFF',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 6,
  },
  statusBadgeCompleted: {
    backgroundColor: '#E8F5E9',
  },
  statusBadgePending: {
    backgroundColor: '#FFF3E0',
  },
  statusBadgeFailed: {
    backgroundColor: '#FFEBEE',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  failureReason: {
    fontSize: 12,
    color: '#D32F2F',
    marginTop: 4,
    fontStyle: 'italic',
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  retryButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
  // Verification Status Banner
  verificationBanner: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  verificationPending: {
    backgroundColor: '#FFF3E0',
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  verificationVerifying: {
    backgroundColor: '#E3F2FD',
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  verificationConfirmed: {
    backgroundColor: '#E8F5E9',
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  verificationFailed: {
    backgroundColor: '#FFEBEE',
    borderLeftWidth: 4,
    borderLeftColor: '#F44336',
  },
  verificationIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  verificationTextContainer: {
    flex: 1,
  },
  verificationTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  verificationSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  verificationPaymentId: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 4,
    fontFamily: 'monospace',
  },
});
