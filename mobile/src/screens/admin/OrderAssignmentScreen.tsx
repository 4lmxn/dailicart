import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, RefreshControl, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { AppLayout } from '../../components/AppLayout';
import { theme } from '../../theme';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { ErrorBanner } from '../../components/ErrorBanner';
import { useToast } from '../../components/Toast';
import { AdminService } from '../../services/api/admin';
import { formatQuantity, getLocalDateString } from '../../utils/helpers';

interface Order {
  id: string;
  order_number: string;
  delivery_date: string;
  status: string;
  total_amount: number;
  quantity: number;
  unit_price: number;
  assigned_distributor_id: string | null;
  customer: any;
  address: any;
  product: any;
}

interface Distributor {
  id: any;
  user: any;
}

export const OrderAssignmentScreen = () => {
  const { show: showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [filterStatus, setFilterStatus] = useState<string>('unassigned');
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [selectedDistributor, setSelectedDistributor] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    loadData();
  }, [selectedDate, filterStatus]);

  const loadData = async () => {
    setError(null);
    // Map filter to actual query params
    const statusFilter = filterStatus === 'unassigned' ? undefined : filterStatus;
    const [ordersRes, distRes] = await Promise.all([
      AdminService.getUnassignedOrders({ date: selectedDate, status: statusFilter }),
      AdminService.getActiveDistributors(),
    ]);

    setLoading(false);
    setRefreshing(false);

    if (ordersRes.error) {
      setError(ordersRes.error.message || 'Failed to load orders');
    } else {
      // Filter for unassigned if that's selected
      let ordersList = ordersRes.data || [];
      if (filterStatus === 'unassigned') {
        ordersList = ordersList.filter((o: any) => !o.assigned_distributor_id);
      }
      setOrders(ordersList);
    }

    if (distRes.error) {
      setError(distRes.error.message || 'Failed to load distributors');
    } else {
      setDistributors(distRes.data || []);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrders((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  };

  const handleBulkAssign = async () => {
    if (!selectedDistributor || selectedOrders.length === 0) {
      showToast('Select distributor and orders', { type: 'error' });
      return;
    }
    setAssigning(true);
    const { error } = await AdminService.bulkAssignDistributor(selectedOrders, selectedDistributor);
    setAssigning(false);
    if (error) {
      showToast(error.message || 'Failed to assign', { type: 'error' });
    } else {
      showToast(`${selectedOrders.length} orders assigned`, { type: 'success' });
      setAssignModalVisible(false);
      setSelectedOrders([]);
      setSelectedDistributor(null);
      loadData();
    }
  };

  const handleSingleAssign = async (orderId: string, distributorId: string) => {
    const { error } = await AdminService.assignDistributorToOrder(orderId, distributorId);
    if (error) {
      showToast(error.message || 'Failed to assign', { type: 'error' });
    } else {
      showToast('Order assigned', { type: 'success' });
      loadData();
    }
  };

  const renderItem = ({ item }: { item: Order }) => {
    const isSelected = selectedOrders.includes(item.id);
    return (
      <View style={[styles.card, isSelected && styles.cardSelected]}>
        <View style={styles.cardHeader}>
          <TouchableOpacity onPress={() => toggleOrderSelection(item.id)} style={styles.checkbox}>
            <Text style={styles.checkboxIcon}>{isSelected ? '☑' : '☐'}</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderNumber}>{item.order_number}</Text>
            <Text style={styles.customerText}>{item.customer?.user?.name || 'Unknown'}</Text>
          </View>
          <View style={[styles.statusBadge, item.assigned_distributor_id && styles.statusAssigned]}>
            <Text style={styles.statusText}>{item.assigned_distributor_id ? 'Assigned' : 'Unassigned'}</Text>
          </View>
        </View>
        <View style={styles.cardBody}>
          {/* Schema has single product per order */}
          {item.product && (
            <Text style={styles.itemText}>
              • {(item.product as any)?.name || 'Product'} ({formatQuantity(item.quantity, (item.product as any)?.unit)})
            </Text>
          )}
          {item.address && (
            <Text style={styles.addressText}>
              📍 {(item.address as any)?.society?.name || ''}
              {(item.address as any)?.tower?.name ? ` - ${(item.address as any)?.tower?.name}` : ''}
              {(item.address as any)?.unit?.number ? `, Unit ${(item.address as any)?.unit?.number}` : ''}
            </Text>
          )}
        </View>
        {!item.assigned_distributor_id && (
          <View style={styles.quickAssign}>
            <Text style={styles.quickAssignLabel}>Quick Assign:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.distributorRow}>
              {distributors.slice(0, 3).map((d: any) => (
                <TouchableOpacity
                  key={d.id}
                  style={styles.distributorChip}
                  onPress={() => handleSingleAssign(item.id, d.id)}
                >
                  <Text style={styles.distributorChipText}>{d.user?.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <AppLayout>
        <Text style={styles.title}>Order Assignment</Text>
        <SkeletonList count={5} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Text style={styles.title}>Order Assignment</Text>
      <View style={styles.filters}>
        <TextInput
          style={styles.dateInput}
          value={selectedDate}
          onChangeText={setSelectedDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={theme.colors.textMuted}
        />
        <View style={styles.filterRow}>
          {['unassigned', 'scheduled', 'assigned', 'all'].map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.filterChip, filterStatus === s && styles.filterChipActive]}
              onPress={() => setFilterStatus(s)}
            >
              <Text style={[styles.filterText, filterStatus === s && styles.filterTextActive]}>
                {s === 'unassigned' ? 'Unassigned' : s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {error && <ErrorBanner message={error} onRetry={loadData} style={{ marginHorizontal: theme.spacing.md, marginBottom: theme.spacing.md }} />}

      {selectedOrders.length > 0 && (
        <View style={styles.actionBar}>
          <Text style={styles.actionText}>{selectedOrders.length} selected</Text>
          <TouchableOpacity style={styles.bulkBtn} onPress={() => setAssignModalVisible(true)}>
            <Text style={styles.bulkBtnText}>Bulk Assign →</Text>
          </TouchableOpacity>
        </View>
      )}

      {orders.length === 0 ? (
        <EmptyState icon="📦" title="No orders" description="No orders match the selected filters." />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.md }} />}
        />
      )}

      <Modal visible={assignModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Assign to Distributor</Text>
            <Text style={styles.modalSubtitle}>Select a distributor for {selectedOrders.length} orders</Text>
            <ScrollView style={styles.distributorList}>
              {distributors.map((d: any) => (
                <TouchableOpacity
                  key={d.id}
                  style={[styles.distributorItem, selectedDistributor === d.id && styles.distributorItemActive]}
                  onPress={() => setSelectedDistributor(d.id)}
                >
                  <Text style={[styles.distributorName, selectedDistributor === d.id && styles.distributorNameActive]}>
                    {d.user?.name}
                  </Text>
                  <Text style={styles.distributorPhone}>{d.user?.phone}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setAssignModalVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.assignBtn, (!selectedDistributor || assigning) && styles.assignBtnDisabled]}
                onPress={handleBulkAssign}
                disabled={!selectedDistributor || assigning}
              >
                {assigning ? <ActivityIndicator color="#FFF" /> : <Text style={styles.assignText}>Assign</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </AppLayout>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  title: { fontSize: 24, fontWeight: '700', color: '#1E293B', marginHorizontal: 20, marginTop: 20, letterSpacing: -0.5 },
  filters: { paddingHorizontal: 20, paddingVertical: 16, gap: 12 },
  dateInput: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, fontSize: 15, borderWidth: 1, borderColor: '#E2E8F0', color: '#1E293B' },
  filterRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  filterChip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center' },
  filterChipActive: { backgroundColor: '#7C3AED' },
  filterText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  filterTextActive: { color: '#FFFFFF' },
  actionBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, backgroundColor: '#7C3AED', marginHorizontal: 20, borderRadius: 14, marginBottom: 16 },
  actionText: { fontSize: 14, color: '#FFFFFF', fontWeight: '600' },
  bulkBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)' },
  bulkBtnText: { fontSize: 13, color: '#FFFFFF', fontWeight: '700' },
  list: { padding: 20, paddingTop: 0 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  cardSelected: { borderWidth: 2, borderColor: '#7C3AED' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 },
  checkbox: { padding: 4 },
  checkboxIcon: { fontSize: 22, color: '#7C3AED' },
  orderNumber: { fontSize: 16, fontWeight: '700', color: '#1E293B', letterSpacing: -0.3 },
  customerText: { fontSize: 13, color: '#64748B' },
  statusBadge: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FEF3C7' },
  statusAssigned: { backgroundColor: '#D1FAE5' },
  statusText: { fontSize: 12, color: '#1E293B', fontWeight: '700' },
  cardBody: { marginBottom: 12 },
  itemText: { fontSize: 14, color: '#1E293B', marginBottom: 4 },
  addressText: { fontSize: 13, color: '#64748B', marginTop: 4 },
  quickAssign: { borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 14 },
  quickAssignLabel: { fontSize: 13, color: '#64748B', marginBottom: 8 },
  distributorRow: { flexDirection: 'row', gap: 10 },
  distributorChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#7C3AED', marginRight: 8 },
  distributorChipText: { fontSize: 13, color: '#FFFFFF', fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '80%' },
  modalTitle: { fontSize: 22, fontWeight: '700', color: '#1E293B', marginBottom: 6, letterSpacing: -0.3 },
  modalSubtitle: { fontSize: 14, color: '#64748B', marginBottom: 20 },
  distributorList: { maxHeight: 300, marginBottom: 20 },
  distributorItem: { padding: 16, borderRadius: 14, backgroundColor: '#F8FAFC', marginBottom: 10 },
  distributorItemActive: { backgroundColor: '#7C3AED' },
  distributorName: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  distributorNameActive: { color: '#FFFFFF' },
  distributorPhone: { fontSize: 13, color: '#64748B', marginTop: 4 },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, padding: 16, borderRadius: 14, backgroundColor: '#F1F5F9', alignItems: 'center' },
  cancelText: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  assignBtn: { flex: 1, padding: 16, borderRadius: 14, backgroundColor: '#7C3AED', alignItems: 'center' },
  assignBtnDisabled: { opacity: 0.5 },
  assignText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
