import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal } from 'react-native';
import { AppLayout } from '../../components/AppLayout';
import { theme } from '../../theme';
import { ErrorBanner } from '../../components/ErrorBanner';
import { useToast } from '../../components/Toast';
import { getLocalDateString } from '../../utils/helpers';
import { AdminService } from '../../services/api/admin';
import { supabase } from '../../services/supabase';
import { ProductService } from '../../services/api/products';

interface Customer {
  id: any;
  user: any;
  addresses: any[];
}

interface Product {
  id: string;
  name: string;
  price: number;
  unit: string;
}

interface OrderItem {
  product_id: string;
  product_name?: string;
  quantity: number;
  unit_price: number;
}

export const CreateManualOrderScreen = ({ navigation }: any) => {
  const { show: showToast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [distributors, setDistributors] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [selectedDistributor, setSelectedDistributor] = useState<string | null>(null);
  const [deliveryDate, setDeliveryDate] = useState(getLocalDateString());
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productModalVisible, setProductModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setError(null);
    const [customersRes, productsRes, distRes] = await Promise.all([
      supabase.from('customers').select('id,user:users(name,phone),addresses(id,unit:tower_units(number),tower:society_towers(name),society:societies(name))').limit(50),
      supabase.from('products').select('id,name,price,unit').eq('is_active', true),
      AdminService.getActiveDistributors(),
    ]);

    setLoading(false);
    if (customersRes.error) setError(customersRes.error.message);
    else setCustomers(customersRes.data || []);

    if (productsRes.error) setError(productsRes.error.message);
    else setProducts(productsRes.data || []);

    if (distRes.error) setError(distRes.error.message);
    else setDistributors(distRes.data || []);
  };

  const addOrderItem = (product: Product) => {
    setOrderItems((prev) => [...prev, { product_id: product.id, product_name: product.name, quantity: 1, unit_price: product.price }]);
    setProductModalVisible(false);
    setSearchQuery('');
  };

  const updateQuantity = (index: number, quantity: number) => {
    setOrderItems((prev) => prev.map((item, i) => (i === index ? { ...item, quantity: Math.max(1, quantity) } : item)));
  };

  const removeItem = (index: number) => {
    setOrderItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateOrder = async () => {
    if (!selectedCustomer || !selectedAddress || orderItems.length === 0) {
      showToast('Fill all required fields', { type: 'error' });
      return;
    }
    setCreating(true);
    const { data, error } = await AdminService.createManualOrder({
      user_id: selectedCustomer,
      address_id: selectedAddress,
      delivery_date: deliveryDate,
      items: orderItems,
      assigned_distributor_id: selectedDistributor || undefined,
    });
    setCreating(false);
    if (error) {
      showToast(error.message || 'Failed to create order', { type: 'error' });
    } else {
      showToast(`Order ${data?.order_number} created`, { type: 'success' });
      navigation.goBack();
    }
  };

  const selectedCustomerObj = customers.find((c) => c.id === selectedCustomer);
  const totalAmount = orderItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  if (loading) {
    return (
      <AppLayout>
        <Text style={styles.title}>Create Manual Order</Text>
        <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: theme.spacing.xl }} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Create Manual Order</Text>
        {error && <ErrorBanner message={error} onRetry={loadData} style={{ marginBottom: theme.spacing.md }} />}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer</Text>
          {customers.map((c: any) => (
            <TouchableOpacity
              key={c.id}
              style={[styles.selectionItem, selectedCustomer === c.id && styles.selectionItemActive]}
              onPress={() => { setSelectedCustomer(c.id); setSelectedAddress(null); }}
            >
              <Text style={[styles.selectionText, selectedCustomer === c.id && styles.selectionTextActive]}>
                {c.user?.name} - {c.user?.phone}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {selectedCustomerObj && selectedCustomerObj.addresses && selectedCustomerObj.addresses.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Delivery Address</Text>
            {(selectedCustomerObj.addresses as any[]).map((a: any) => (
              <TouchableOpacity
                key={a.id}
                style={[styles.selectionItem, selectedAddress === a.id && styles.selectionItemActive]}
                onPress={() => setSelectedAddress(a.id)}
              >
                <Text style={[styles.selectionText, selectedAddress === a.id && styles.selectionTextActive]}>
                  {[a.unit?.number, a.tower?.name, a.society?.name].filter(Boolean).join(', ') || 'Unknown'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Date</Text>
          <TextInput
            style={styles.input}
            value={deliveryDate}
            onChangeText={setDeliveryDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.colors.textMuted}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Distributor (Optional)</Text>
          <View style={styles.distributorRow}>
            {distributors.slice(0, 4).map((d: any) => (
              <TouchableOpacity
                key={d.id}
                style={[styles.distributorChip, selectedDistributor === d.id && styles.distributorChipActive]}
                onPress={() => setSelectedDistributor(selectedDistributor === d.id ? null : d.id)}
              >
                <Text style={[styles.distributorChipText, selectedDistributor === d.id && styles.distributorChipTextActive]}>
                  {d.user?.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Items</Text>
          {orderItems.map((item, index) => (
            <View key={index} style={styles.orderItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.product_name}</Text>
                <Text style={styles.itemPrice}>₹{item.unit_price.toFixed(2)} each</Text>
              </View>
              <View style={styles.quantityControl}>
                <TouchableOpacity onPress={() => updateQuantity(index, item.quantity - 1)} style={styles.qtyBtn}>
                  <Text style={styles.qtyBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.qtyText}>{item.quantity}</Text>
                <TouchableOpacity onPress={() => updateQuantity(index, item.quantity + 1)} style={styles.qtyBtn}>
                  <Text style={styles.qtyBtnText}>+</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => removeItem(index)} style={styles.removeBtn}>
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.addItemBtn} onPress={() => setProductModalVisible(true)}>
            <Text style={styles.addItemText}>+ Add Product</Text>
          </TouchableOpacity>
        </View>

        {orderItems.length > 0 && (
          <View style={styles.totalSection}>
            <Text style={styles.totalLabel}>Total Amount:</Text>
            <Text style={styles.totalValue}>₹{totalAmount.toFixed(2)}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.createBtn, (!selectedCustomer || !selectedAddress || orderItems.length === 0 || creating) && styles.createBtnDisabled]}
          onPress={handleCreateOrder}
          disabled={!selectedCustomer || !selectedAddress || orderItems.length === 0 || creating}
        >
          {creating ? <ActivityIndicator color="#FFF" /> : <Text style={styles.createText}>Create Order</Text>}
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={productModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Product</Text>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search products..."
              placeholderTextColor={theme.colors.textMuted}
            />
            <ScrollView style={styles.productList}>
              {filteredProducts.map((p) => (
                <TouchableOpacity key={p.id} style={styles.productItem} onPress={() => addOrderItem(p)}>
                  <Text style={styles.productName}>{p.name}</Text>
                  <Text style={styles.productPrice}>₹{p.price} / {p.unit}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setProductModalVisible(false)}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </AppLayout>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 20 },
  title: { fontSize: 24, fontWeight: '700', color: '#1E293B', marginBottom: 20, letterSpacing: -0.5 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#1E293B', marginBottom: 12, letterSpacing: -0.3 },
  selectionItem: { padding: 16, borderRadius: 14, backgroundColor: '#F8FAFC', marginBottom: 8 },
  selectionItemActive: { backgroundColor: '#7C3AED' },
  selectionText: { fontSize: 15, color: '#1E293B' },
  selectionTextActive: { color: '#FFFFFF', fontWeight: '600' },
  input: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, fontSize: 15, borderWidth: 1, borderColor: '#E2E8F0', color: '#1E293B' },
  distributorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  distributorChip: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#F1F5F9' },
  distributorChipActive: { backgroundColor: '#7C3AED' },
  distributorChipText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  distributorChipTextActive: { color: '#FFFFFF' },
  orderItem: { flexDirection: 'row', alignItems: 'center', padding: 18, backgroundColor: '#FFFFFF', borderRadius: 16, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  itemName: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  itemPrice: { fontSize: 13, color: '#64748B', marginTop: 2 },
  quantityControl: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qtyBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { fontSize: 18, fontWeight: '700', color: '#1E293B' },
  qtyText: { fontSize: 16, fontWeight: '700', color: '#1E293B', minWidth: 28, textAlign: 'center' },
  removeBtn: { marginLeft: 12, padding: 4 },
  removeBtnText: { fontSize: 20, color: '#DC2626' },
  addItemBtn: { padding: 18, borderRadius: 14, backgroundColor: '#F8FAFC', alignItems: 'center', borderWidth: 2, borderColor: '#E2E8F0', borderStyle: 'dashed' },
  addItemText: { fontSize: 15, fontWeight: '600', color: '#7C3AED' },
  totalSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#FFFFFF', borderRadius: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  totalLabel: { fontSize: 17, fontWeight: '700', color: '#1E293B' },
  totalValue: { fontSize: 24, fontWeight: '700', color: '#7C3AED' },
  createBtn: { backgroundColor: '#7C3AED', padding: 18, borderRadius: 16, alignItems: 'center' },
  createBtnDisabled: { opacity: 0.5 },
  createText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '80%' },
  modalTitle: { fontSize: 22, fontWeight: '700', color: '#1E293B', marginBottom: 16, letterSpacing: -0.3 },
  searchInput: { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 16, fontSize: 15, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0', color: '#1E293B' },
  productList: { maxHeight: 400, marginBottom: 16 },
  productItem: { padding: 16, borderRadius: 14, backgroundColor: '#F8FAFC', marginBottom: 10 },
  productName: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
  productPrice: { fontSize: 14, color: '#64748B', marginTop: 4 },
  closeBtn: { padding: 16, borderRadius: 14, backgroundColor: '#F1F5F9', alignItems: 'center' },
  closeText: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
});
