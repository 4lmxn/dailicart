import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { theme } from '../../theme';
import { AppLayout } from '../../components/AppLayout';
import { AppBar } from '../../components/AppBar';
import type { AdminScreenProps } from '../../navigation/types';
import { formatCurrency, formatQuantity } from '../../utils/helpers';
import { CustomerAdminService } from '../../services/api/customers';
import { WalletService } from '../../services/api/wallet';
import { SubscriptionService } from '../../services/api/subscriptions';

export const CustomerDetailScreen: React.FC<AdminScreenProps<'CustomerDetail'>> = ({ route, navigation }) => {
  const { customerId } = route.params;
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<any>(null);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'subscriptions' | 'transactions' | 'settings'>('overview');
  
  // Modals
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [walletAmount, setWalletAmount] = useState('');
  const [walletAction, setWalletAction] = useState<'add' | 'deduct'>('add');
  const [walletReason, setWalletReason] = useState('');

  // Edit form
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    address: '',
    area: '',
    city: '',
    pincode: '',
  });

  useEffect(() => {
    loadCustomerData();
  }, [customerId]);

  const loadCustomerData = async () => {
    try {
      setLoading(true);
      if (!customerId) {
        Alert.alert('Missing ID', 'No customer ID provided');
        setLoading(false);
        return;
      }
      const [customerData, subsData, txnData] = await Promise.all([
        CustomerAdminService.getCustomerById(customerId!),
        SubscriptionService.getCustomerSubscriptions(customerId!),
        WalletService.getTransactions(customerId!, 20),
      ]);

      // Always fetch wallet via WalletService to ensure accuracy
      const walletBalance = await WalletService.getBalance(customerId!);

      if (customerData) {
        setCustomer({ ...customerData, wallet: walletBalance });
        setEditForm({
          name: customerData.name,
          phone: customerData.phone,
          address: customerData.address,
          area: customerData.area || '',
          city: customerData.city || '',
          pincode: customerData.pincode || '',
        });
      }

      setSubscriptions(subsData);
      setTransactions(txnData);
    } catch (error) {
      console.error('Error loading customer data:', error);
      Alert.alert('Error', 'Failed to load customer data');
    } finally {
      setLoading(false);
    }
  };

  const handleWalletAdjustment = async () => {
    if (!walletAmount || parseFloat(walletAmount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    if (!walletReason.trim()) {
      Alert.alert('Error', 'Please enter a reason for adjustment');
      return;
    }

    try {
      const amount = parseFloat(walletAmount);
      const adjustAmount = walletAction === 'add' ? amount : -amount;

      await CustomerAdminService.adjustWallet(customerId!, adjustAmount, walletReason);
      
      Alert.alert('Success', `Wallet ${walletAction === 'add' ? 'credited' : 'debited'} successfully`);
      setShowWalletModal(false);
      setWalletAmount('');
      setWalletReason('');
      loadCustomerData();
    } catch (error) {
      console.error('Error adjusting wallet:', error);
      Alert.alert('Error', 'Failed to adjust wallet');
    }
  };

  const handleUpdateProfile = async () => {
    try {
      if (!customerId) {
        Alert.alert('Error', 'No customer ID provided');
        return;
      }
      await CustomerAdminService.updateCustomer(customerId!, editForm);
      Alert.alert('Success', 'Customer profile updated successfully');
      setShowEditModal(false);
      loadCustomerData();
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile');
    }
  };

  const handleBlockCustomer = () => {
    Alert.alert(
      'Block Customer',
      'Are you sure you want to block this customer? They will not be able to access the app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await CustomerAdminService.blockCustomer(customerId!);
              Alert.alert('✅ Success', 'Customer has been blocked');
              loadCustomerData();
            } catch (error) {
              console.error('Error blocking customer:', error);
              Alert.alert('Error', 'Failed to block customer');
            }
          },
        },
      ]
    );
  };

  const handleUnblockCustomer = () => {
    Alert.alert(
      'Unblock Customer',
      'Are you sure you want to unblock this customer? They will be able to access the app again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            try {
              await CustomerAdminService.unblockCustomer(customerId!);
              Alert.alert('✅ Success', 'Customer has been unblocked');
              loadCustomerData();
            } catch (error) {
              console.error('Error unblocking customer:', error);
              Alert.alert('Error', 'Failed to unblock customer');
            }
          },
        },
      ]
    );
  };

  const renderOverview = () => (
    <View style={styles.tabContent}>
      {/* Customer Info Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Customer Information</Text>
          <TouchableOpacity onPress={() => setShowEditModal(true)}>
            <Text style={styles.editButton}>Edit</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Name</Text>
          <Text style={styles.infoValue}>{customer?.name}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Phone</Text>
          <Text style={styles.infoValue}>{customer?.phone}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email</Text>
          <Text style={styles.infoValue}>{customer?.email || 'Not provided'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Address</Text>
          <Text style={styles.infoValue}>
            {customer?.address ? `${customer.address}, ${customer.area}, ${customer.city} - ${customer.pincode}` : 'Not provided'}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Member Since</Text>
          <Text style={styles.infoValue}>{customer?.createdAt ? new Date(customer.createdAt).toLocaleDateString() : 'N/A'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Account Status</Text>
          <View style={[styles.statusBadge, { backgroundColor: customer?.isActive ? '#DCFCE7' : '#FEE2E2' }]}>
            <Text style={[styles.statusBadgeText, { color: customer?.isActive ? '#16A34A' : '#DC2626' }]}>
              {customer?.isActive ? '✅ Active' : '🚫 Blocked'}
            </Text>
          </View>
        </View>
      </View>

      {/* Wallet Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>💰 Wallet Balance</Text>
          <TouchableOpacity onPress={() => setShowWalletModal(true)}>
            <Text style={styles.editButton}>Adjust</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.walletBalance}>{formatCurrency(customer?.wallet || 0)}</Text>
        <View style={styles.walletInfo}>
          <View style={styles.walletInfoItem}>
            <Text style={styles.walletInfoLabel}>Auto-deduct</Text>
            <Text style={styles.walletInfoValue}>{customer?.autoDeduct ? '✅ Enabled' : '❌ Disabled'}</Text>
          </View>
        </View>
      </View>

      {/* Subscription Stats */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📋 Subscriptions</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{customer?.subscriptions || 0}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{subscriptions.filter(s => s.status === 'paused').length}</Text>
            <Text style={styles.statLabel}>Paused</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{subscriptions.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Quick Actions</Text>
        <TouchableOpacity style={styles.actionButton} onPress={() => setShowWalletModal(true)}>
          <Text style={styles.actionButtonIcon}>💰</Text>
          <Text style={styles.actionButtonText}>Adjust Wallet Balance</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => setActiveTab('subscriptions')}>
          <Text style={styles.actionButtonIcon}>📋</Text>
          <Text style={styles.actionButtonText}>Manage Subscriptions</Text>
        </TouchableOpacity>
        {/* TODO: Implement notification feature
        <TouchableOpacity style={styles.actionButton} onPress={() => {}}>
          <Text style={styles.actionButtonIcon}>📧</Text>
          <Text style={styles.actionButtonText}>Send Notification</Text>
        </TouchableOpacity>
        */}
        {customer?.isActive ? (
          <TouchableOpacity style={[styles.actionButton, styles.actionButtonDanger]} onPress={handleBlockCustomer}>
            <Text style={styles.actionButtonIcon}>🚫</Text>
            <Text style={[styles.actionButtonText, styles.actionButtonTextDanger]}>Block Customer</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.actionButton, styles.actionButtonSuccess]} onPress={handleUnblockCustomer}>
            <Text style={styles.actionButtonIcon}>✅</Text>
            <Text style={[styles.actionButtonText, styles.actionButtonTextSuccess]}>Unblock Customer</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderSubscriptions = () => (
    <View style={styles.tabContent}>
      {subscriptions.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateIcon}>📋</Text>
          <Text style={styles.emptyStateText}>No subscriptions found</Text>
        </View>
      ) : (
        subscriptions.map((sub) => (
          <View key={sub.id} style={styles.subscriptionCard}>
            <View style={styles.subscriptionHeader}>
              <Text style={styles.subscriptionProduct}>{sub.productName}</Text>
              <View style={[styles.subscriptionStatusBadge, sub.status === 'active' ? styles.statusActive : styles.statusPaused]}>
                <Text style={styles.statusText}>{sub.status.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={styles.subscriptionDetail}>{formatQuantity(sub.quantity, sub.unit)}</Text>
            <Text style={styles.subscriptionDetail}>Frequency: {sub.frequency}</Text>
            <Text style={styles.subscriptionDetail}>Next Delivery: {sub.nextDeliveryDate}</Text>
            <Text style={styles.subscriptionDetail}>Price: {formatCurrency(sub.price || 0)}</Text>
          </View>
        ))
      )}
    </View>
  );

  const renderTransactions = () => (
    <View style={styles.tabContent}>
      {transactions.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateIcon}>💳</Text>
          <Text style={styles.emptyStateText}>No transactions found</Text>
        </View>
      ) : (
        transactions.map((txn) => (
          <View key={txn.id} style={styles.transactionCard}>
            <View style={styles.transactionHeader}>
              <Text style={[styles.transactionAmount, txn.type === 'credit' ? styles.amountCredit : styles.amountDebit]}>
                {txn.type === 'credit' ? '+' : '-'}{formatCurrency(txn.amount)}
              </Text>
              <Text style={styles.transactionDate}>
                {new Date(txn.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <Text style={styles.transactionDesc}>{txn.description}</Text>
            <Text style={styles.transactionBalance}>Balance: {formatCurrency(txn.balanceAfter || 0)}</Text>
          </View>
        ))
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading customer data...</Text>
      </View>
    );
  }

  if (!customer) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Customer not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <AppLayout>
      <AppBar 
        title={customer.name} 
        subtitle={customer.phone}
        onBack={() => navigation.goBack()} 
        variant="surface" 
      />

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'overview' && styles.tabActive]}
          onPress={() => setActiveTab('overview')}
        >
          <Text style={[styles.tabText, activeTab === 'overview' && styles.tabTextActive]}>Overview</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'subscriptions' && styles.tabActive]}
          onPress={() => setActiveTab('subscriptions')}
        >
          <Text style={[styles.tabText, activeTab === 'subscriptions' && styles.tabTextActive]}>Subscriptions</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'transactions' && styles.tabActive]}
          onPress={() => setActiveTab('transactions')}
        >
          <Text style={[styles.tabText, activeTab === 'transactions' && styles.tabTextActive]}>Transactions</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'subscriptions' && renderSubscriptions()}
        {activeTab === 'transactions' && renderTransactions()}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Wallet Adjustment Modal */}
      <Modal visible={showWalletModal} animationType="slide" transparent>
        <Pressable style={styles.modalOverlay} onPress={() => setShowWalletModal(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Adjust Wallet Balance</Text>
              <TouchableOpacity onPress={() => setShowWalletModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.modalLabel}>Action</Text>
              <View style={styles.actionToggle}>
                <TouchableOpacity
                  style={[styles.actionToggleButton, walletAction === 'add' && styles.actionToggleButtonActive]}
                  onPress={() => setWalletAction('add')}
                >
                  <Text style={[styles.actionToggleText, walletAction === 'add' && styles.actionToggleTextActive]}>
                    Add Money
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionToggleButton, walletAction === 'deduct' && styles.actionToggleButtonActive]}
                  onPress={() => setWalletAction('deduct')}
                >
                  <Text style={[styles.actionToggleText, walletAction === 'deduct' && styles.actionToggleTextActive]}>
                    Deduct Money
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.modalLabel}>Amount</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter amount"
                keyboardType="numeric"
                value={walletAmount}
                onChangeText={setWalletAmount}
              />

              <Text style={styles.modalLabel}>Reason</Text>
              <TextInput
                style={[styles.modalInput, styles.modalInputMultiline]}
                placeholder="Enter reason for adjustment"
                multiline
                numberOfLines={3}
                value={walletReason}
                onChangeText={setWalletReason}
              />

              <TouchableOpacity style={styles.modalButton} onPress={handleWalletAdjustment}>
                <Text style={styles.modalButtonText}>
                  {walletAction === 'add' ? 'Add' : 'Deduct'} {walletAmount ? formatCurrency(parseFloat(walletAmount)) : '₹0'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal visible={showEditModal} animationType="slide" transparent>
        <Pressable style={styles.modalOverlay} onPress={() => setShowEditModal(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Customer Profile</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.modalLabel}>Name</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.name}
                onChangeText={(text) => setEditForm({ ...editForm, name: text })}
              />

              <Text style={styles.modalLabel}>Phone</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.phone}
                onChangeText={(text) => setEditForm({ ...editForm, phone: text })}
                keyboardType="phone-pad"
              />

              <Text style={styles.modalLabel}>Address</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.address}
                onChangeText={(text) => setEditForm({ ...editForm, address: text })}
              />

              <Text style={styles.modalLabel}>Area</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.area}
                onChangeText={(text) => setEditForm({ ...editForm, area: text })}
              />

              <Text style={styles.modalLabel}>City</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.city}
                onChangeText={(text) => setEditForm({ ...editForm, city: text })}
              />

              <Text style={styles.modalLabel}>Pincode</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.pincode}
                onChangeText={(text) => setEditForm({ ...editForm, pincode: text })}
                keyboardType="numeric"
              />

              <TouchableOpacity style={styles.modalButton} onPress={handleUpdateProfile}>
                <Text style={styles.modalButtonText}>Update Profile</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </AppLayout>
  );
};

const styles = StyleSheet.create({
  container: {
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  errorText: {
    fontSize: 18,
    color: '#DC2626',
    marginBottom: 24,
    fontWeight: '600',
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#0D9488',
    borderRadius: 14,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tabs: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#0D9488',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#0D9488',
  },
  content: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  tabContent: {
    padding: 20,
  },
  card: {
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E293B',
    letterSpacing: -0.3,
  },
  editButton: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0D9488',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  infoLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  walletBalance: {
    fontSize: 40,
    fontWeight: '700',
    color: '#10B981',
    marginBottom: 16,
    letterSpacing: -1,
  },
  walletInfo: {
    flexDirection: 'row',
  },
  walletInfoItem: {
    flex: 1,
  },
  walletInfoLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 6,
    fontWeight: '500',
  },
  walletInfoValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  statsGrid: {
    flexDirection: 'row',
    marginTop: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    padding: 18,
    borderRadius: 16,
    marginBottom: 12,
  },
  actionButtonDanger: {
    backgroundColor: '#FEE2E2',
  },
  actionButtonSuccess: {
    backgroundColor: '#DCFCE7',
  },
  actionButtonIcon: {
    fontSize: 22,
    marginRight: 14,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  actionButtonTextDanger: {
    color: '#DC2626',
  },
  actionButtonTextSuccess: {
    color: '#16A34A',
  },
  subscriptionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  subscriptionProduct: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
    letterSpacing: -0.3,
  },
  subscriptionStatusBadge: {
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
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  subscriptionDetail: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 8,
  },
  transactionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  transactionAmount: {
    fontSize: 22,
    fontWeight: '700',
  },
  amountCredit: {
    color: '#10B981',
  },
  amountDebit: {
    color: '#DC2626',
  },
  transactionDate: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  transactionDesc: {
    fontSize: 15,
    color: '#1E293B',
    marginBottom: 8,
  },
  transactionBalance: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginTop: 16,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#64748B',
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
    fontWeight: '700',
    color: '#1E293B',
    letterSpacing: -0.3,
  },
  modalClose: {
    fontSize: 24,
    color: '#64748B',
  },
  modalBody: {
    padding: 24,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 8,
    marginTop: 16,
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    color: '#1E293B',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalInputMultiline: {
    height: 100,
    textAlignVertical: 'top',
  },
  modalButton: {
    backgroundColor: '#0D9488',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 28,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  actionToggle: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
  },
  actionToggleButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
  },
  actionToggleButtonActive: {
    backgroundColor: '#0D9488',
  },
  actionToggleText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },
  actionToggleTextActive: {
    color: '#FFFFFF',
  },
});
