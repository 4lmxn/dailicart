import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { AppLayout } from '../../components/AppLayout';
import { AppBar } from '../../components/AppBar';
import { theme } from '../../theme';
import { supabase } from '../../services/supabase';
import { AdminService } from '../../services/api/admin';
import { useAuthStore } from '../../store/authStore';
import { formatQuantity, getLocalDateString } from '../../utils/helpers';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { ErrorBanner } from '../../components/ErrorBanner';
import type { AdminScreenProps } from '../../navigation/types';

interface StockCollection {
  collection_id: string;
  distributor_id: string;
  distributor_name: string;
  distributor_phone: string;
  collection_date: string;
  status: 'pending' | 'collected' | 'verified' | 'returned';
  total_items: number;
  total_required: number;
  total_collected: number;
  collected_at: string | null;
  verified_at: string | null;
}

interface CollectionItem {
  product_id: string;
  product_name: string;
  product_unit: string;
  required_quantity: number;
  collected_quantity: number | null;
  returned_quantity: number | null;
}

interface InventoryItem {
  product_id: string;
  product_name: string;
  product_unit: string;
  quantity_on_hand: number;
  last_updated: string | null;
}

export const StockManagementScreen: React.FC<AdminScreenProps<'StockManagement'>> = ({ navigation }) => {
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'collections' | 'inventory' | 'movements'>('collections');
  
  const [collections, setCollections] = useState<StockCollection[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<StockCollection | null>(null);
  const [collectionItems, setCollectionItems] = useState<CollectionItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [editedQuantities, setEditedQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      await Promise.all([
        loadCollections(),
        loadInventory(),
        loadMovements(),
      ]);
    } catch (err: any) {
      console.error('Error loading data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadMovements = async () => {
    const { data, error } = await supabase
      .from('stock_movements')
      .select('id, created_at, movement_type, quantity, reference_type, notes, products:product_id(name, unit), created_by_user:created_by(name)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      console.error('Error loading movements:', error);
      return;
    }
    setMovements(data || []);
  };

  const loadCollections = async () => {
    // First, trigger auto-generation of stock collections for this date via RPC
    // This ensures collections are always up-to-date with current orders
    try {
      const { data: distributors } = await supabase
        .from('distributors')
        .select('id')
        .eq('is_active', true);
      
      // Auto-generate collections for each distributor (via RPC if available)
      for (const dist of distributors || []) {
        try {
          await supabase.rpc('upsert_stock_collection', {
            p_distributor_id: dist.id,
            p_date: selectedDate,
          });
        } catch {
          // RPC might not exist yet, ignore
        }
      }
    } catch (e) {
      // Ignore errors - RPC might not exist
      console.log('Auto-generation RPC not available, using existing collections');
    }
    
    // Now fetch the collections
    const { data, error } = await AdminService.getStockCollections(selectedDate);
    if (error) {
      console.error('Error loading collections:', error);
      // If RPC doesn't exist, set empty array
      if (error.code === 'PGRST202' || error.message?.includes('function')) {
        setCollections([]);
        return;
      }
      throw error;
    }
    setCollections(data || []);
  };

  const loadInventory = async () => {
    const { data, error } = await AdminService.getInventorySummary();
    if (error) {
      console.error('Error loading inventory:', error);
      throw error;
    }
    setInventory(data || []);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleViewCollection = async (collection: StockCollection) => {
    setSelectedCollection(collection);
    setShowDetailModal(true);
    setLoadingItems(true);
    
    try {
      // Query distributor_stock_handover directly
      const { data: handoverData, error } = await supabase
        .from('distributor_stock_handover')
        .select('id, stock_given, stock_returned')
        .eq('distributor_id', collection.distributor_id)
        .eq('handover_date', collection.collection_date)
        .maybeSingle();
      
      if (error) throw error;
      
      if (handoverData) {
        const stockGiven = handoverData.stock_given || [];
        const productIds = stockGiven.map((item: any) => item.product_id);
        
        const { data: productsData } = productIds.length > 0
          ? await supabase.from('products').select('id, name, unit').in('id', productIds)
          : { data: [] };
        
        const productsMap = new Map((productsData || []).map((p: any) => [p.id, p]));
        const stockReturned = handoverData.stock_returned || [];
        const returnedMap = new Map(stockReturned.map((item: any) => [item.product_id, item.quantity]));

        const items: CollectionItem[] = stockGiven.map((item: any) => {
          const product = productsMap.get(item.product_id);
          return {
            product_id: item.product_id,
            product_name: product?.name || 'Unknown',
            product_unit: product?.unit || '',
            required_quantity: item.quantity,
            collected_quantity: item.quantity,
            returned_quantity: returnedMap.get(item.product_id) || 0,
          };
        });
        
        setCollectionItems(items);
        // Initialize edited quantities with required quantities
        const initialQuantities: Record<string, number> = {};
        items.forEach(item => {
          initialQuantities[item.product_id] = item.required_quantity;
        });
        setEditedQuantities(initialQuantities);
      } else {
        setCollectionItems([]);
        setEditedQuantities({});
      }
    } catch (err: any) {
      console.error('Error loading collection items:', err);
      Alert.alert('Error', 'Failed to load collection details');
    } finally {
      setLoadingItems(false);
    }
  };

  const handleGiveStock = async () => {
    if (!selectedCollection || !user) return;
    
    // Build stock given array from edited quantities
    const stockGiven = collectionItems.map(item => ({
      product_id: item.product_id,
      quantity: editedQuantities[item.product_id] ?? item.required_quantity,
    }));
    
    // Check if any quantities were modified
    const hasChanges = collectionItems.some(item => 
      editedQuantities[item.product_id] !== item.required_quantity
    );
    
    const confirmMessage = hasChanges
      ? `You have modified some quantities. Confirm giving stock to ${selectedCollection.distributor_name}?`
      : `Confirm giving stock to ${selectedCollection.distributor_name}?`;
    
    Alert.alert(
      'Give Stock to Distributor',
      confirmMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              setVerifying(true);
              const { error } = await AdminService.giveStockToDistributor(
                selectedCollection.collection_id,
                user.id,
                stockGiven,
                hasChanges ? 'Quantities adjusted by admin' : undefined
              );
              
              if (error) throw error;
              
              Alert.alert('✅ Done', 'Stock has been given to distributor');
              setShowDetailModal(false);
              await loadData();
            } catch (err: any) {
              console.error('Error giving stock:', err);
              Alert.alert('Error', err.message || 'Failed to give stock');
            } finally {
              setVerifying(false);
            }
          },
        },
      ]
    );
  };

  const handleQuantityChange = (productId: string, value: string) => {
    const qty = parseInt(value, 10);
    if (!isNaN(qty) && qty >= 0) {
      setEditedQuantities(prev => ({ ...prev, [productId]: qty }));
    } else if (value === '') {
      setEditedQuantities(prev => ({ ...prev, [productId]: 0 }));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#FF9800';
      case 'collected': return '#4CAF50';
      case 'returned': return '#9C27B0';
      default: return '#666';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'PENDING';
      case 'collected': return 'GIVEN';
      case 'returned': return 'RETURNED';
      default: return status.toUpperCase();
    }
  };

  const renderCollectionsTab = () => (
    <View>
      {/* Date Selector */}
      <View style={styles.dateSelector}>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => {
            const d = new Date(selectedDate);
            d.setDate(d.getDate() - 1);
            setSelectedDate(getLocalDateString(d));
          }}
        >
          <Text style={styles.dateButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.dateText}>
          {new Date(selectedDate).toLocaleDateString('en-IN', { 
            weekday: 'short', 
            day: 'numeric', 
            month: 'short' 
          })}
        </Text>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => {
            const d = new Date(selectedDate);
            d.setDate(d.getDate() + 1);
            setSelectedDate(getLocalDateString(d));
          }}
        >
          <Text style={styles.dateButtonText}>→</Text>
        </TouchableOpacity>
      </View>

      {/* Info Banner */}
      <View style={{ backgroundColor: '#F0FDF4', padding: 12, borderRadius: 8, marginBottom: 16 }}>
        <Text style={{ fontSize: 12, color: '#166534', textAlign: 'center' }}>
          ✨ Stock collections auto-update based on assigned orders
        </Text>
      </View>

      {/* Collections List */}
      {collections.length === 0 ? (
        <EmptyState
          icon="📋"
          title="No Collections"
          description="No orders assigned to distributors for this date yet."
        />
      ) : (
        collections.map((collection) => (
          <TouchableOpacity
            key={collection.collection_id}
            style={styles.collectionCard}
            onPress={() => handleViewCollection(collection)}
          >
            <View style={styles.collectionHeader}>
              <View>
                <Text style={styles.distributorName}>{collection.distributor_name}</Text>
                <Text style={styles.distributorPhone}>📞 {collection.distributor_phone}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(collection.status || 'pending') + '20' }]}>
                <Text style={[styles.statusText, { color: getStatusColor(collection.status || 'pending') }]}>
                  {getStatusLabel(collection.status || 'pending')}
                </Text>
              </View>
            </View>
            
            <View style={styles.collectionStats}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{collection.total_items}</Text>
                <Text style={styles.statLabel}>Items</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{collection.total_required}</Text>
                <Text style={styles.statLabel}>Required</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: theme.colors.success }]}>
                  {collection.total_collected || 0}
                </Text>
                <Text style={styles.statLabel}>Collected</Text>
              </View>
            </View>
            
            {collection.collected_at && (
              <Text style={styles.timestamp}>
                Collected: {new Date(collection.collected_at).toLocaleTimeString()}
              </Text>
            )}
            {collection.verified_at && (
              <Text style={[styles.timestamp, { color: theme.colors.success }]}>
                ✓ Verified: {new Date(collection.verified_at).toLocaleTimeString()}
              </Text>
            )}
          </TouchableOpacity>
        ))
      )}
    </View>
  );

  const renderInventoryTab = () => (
    <View>
      <Text style={styles.sectionTitle}>Current Stock Levels</Text>
      
      {inventory.length === 0 ? (
        <EmptyState
          icon="📦"
          title="No Inventory"
          description="No inventory records found. Add products and stock to get started."
        />
      ) : (
        inventory.map((item) => (
          <View key={item.product_id} style={styles.inventoryCard}>
            <View style={styles.inventoryInfo}>
              <Text style={styles.productName}>{item.product_name}</Text>
              <Text style={styles.productUnit}>{item.product_unit} per unit</Text>
              {item.last_updated && (
                <Text style={styles.lastUpdated}>
                  Updated: {new Date(item.last_updated).toLocaleDateString()}
                </Text>
              )}
            </View>
            <View style={[
              styles.quantityBadge,
              { backgroundColor: item.quantity_on_hand > 10 ? '#E8F5E9' : '#FFEBEE' }
            ]}>
              <Text style={[
                styles.quantityText,
                { color: item.quantity_on_hand > 10 ? '#4CAF50' : '#F44336' }
              ]}>
                {item.quantity_on_hand} units
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );

  const renderMovementsTab = () => (
    <View>
      <Text style={styles.sectionTitle}>Recent Stock Movements</Text>
      
      {movements.length === 0 ? (
        <EmptyState
          icon="🔄"
          title="No Movements"
          description="Receipts, issues, and returns will show here."
        />
      ) : (
        movements.map((m) => (
          <View key={m.id} style={styles.movementCard}>
            <View style={styles.movementHeader}>
              <Text style={styles.productName}>{m.products?.name || 'Unknown'}</Text>
              <View style={[
                styles.movementTypeBadge,
                { backgroundColor: m.movement_type === 'receipt' ? '#E8F5E9' : m.movement_type === 'issue' ? '#FFF3E0' : '#FFEBEE' }
              ]}>
                <Text style={[
                  styles.movementTypeText,
                  { color: m.movement_type === 'receipt' ? '#4CAF50' : m.movement_type === 'issue' ? '#FF9800' : '#F44336' }
                ]}>
                  {m.movement_type?.toUpperCase()}
                </Text>
              </View>
            </View>
            <Text style={styles.movementQuantity}>
              {m.movement_type === 'receipt' ? '+' : '-'}{formatQuantity(m.quantity, m.products?.unit)}
            </Text>
            {m.notes && <Text style={styles.movementNotes}>{m.notes}</Text>}
            <Text style={styles.movementDate}>
              {new Date(m.created_at).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
              })}
            </Text>
          </View>
        ))
      )}
    </View>
  );

  if (loading && !refreshing) {
    return (
      <AppLayout>
        <AppBar title="Stock Management" onBack={() => navigation.goBack()} variant="surface" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <AppBar title="Stock Management" onBack={() => navigation.goBack()} variant="surface" />
      
      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'collections' && styles.tabActive]}
          onPress={() => setActiveTab('collections')}
        >
          <Text style={[styles.tabText, activeTab === 'collections' && styles.tabTextActive]}>
            📋 Collections
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'inventory' && styles.tabActive]}
          onPress={() => setActiveTab('inventory')}
        >
          <Text style={[styles.tabText, activeTab === 'inventory' && styles.tabTextActive]}>
            📦 Inventory
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'movements' && styles.tabActive]}
          onPress={() => setActiveTab('movements')}
        >
          <Text style={[styles.tabText, activeTab === 'movements' && styles.tabTextActive]}>
            🔄 Movements
          </Text>
        </TouchableOpacity>
      </View>

      {error && (
        <ErrorBanner message={error} onRetry={loadData} />
      )}

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {activeTab === 'collections' && renderCollectionsTab()}
        {activeTab === 'inventory' && renderInventoryTab()}
        {activeTab === 'movements' && renderMovementsTab()}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Collection Detail Modal */}
      <Modal
        visible={showDetailModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDetailModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedCollection?.distributor_name}'s Collection
              </Text>
              <TouchableOpacity onPress={() => setShowDetailModal(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            {loadingItems ? (
              <ActivityIndicator size="large" color={theme.colors.primary} />
            ) : collectionItems.length === 0 ? (
              <View style={styles.emptyItems}>
                <Text style={styles.emptyItemsIcon}>📭</Text>
                <Text style={styles.emptyItemsText}>No items in this collection</Text>
                <Text style={styles.emptyItemsHint}>No orders assigned to this distributor for this date</Text>
              </View>
            ) : (
              <ScrollView style={styles.modalBody}>
                {/* Header for pending collections */}
                {selectedCollection?.status === 'pending' && (
                  <View style={styles.editHint}>
                    <Text style={styles.editHintText}>📝 Tap on quantity to adjust before giving stock</Text>
                  </View>
                )}
                {collectionItems.map((item) => {
                  const isPending = selectedCollection?.status === 'pending';
                  const currentQty = editedQuantities[item.product_id] ?? item.required_quantity;
                  const isModified = currentQty !== item.required_quantity;
                  
                  return (
                    <View key={item.product_id} style={styles.itemRow}>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemName}>{item.product_name}</Text>
                        <Text style={styles.itemUnit}>{item.product_unit} per unit</Text>
                        {isPending && (
                          <Text style={styles.requiredLabel}>Required: {item.required_quantity}</Text>
                        )}
                      </View>
                      <View style={styles.itemQuantities}>
                        {isPending ? (
                          <View style={[styles.qtyInputContainer, isModified && styles.qtyInputModified]}>
                            <TextInput
                              style={styles.qtyInput}
                              value={String(currentQty)}
                              onChangeText={(v) => handleQuantityChange(item.product_id, v)}
                              keyboardType="number-pad"
                              selectTextOnFocus
                            />
                            <Text style={styles.qtyInputLabel}>units</Text>
                          </View>
                        ) : (
                          <View style={[styles.qtyBadge, { backgroundColor: '#E8F5E9' }]}>
                            <Text style={[styles.qtyText, { color: '#2E7D32' }]}>
                              {item.required_quantity} units
                            </Text>
                          </View>
                        )}
                        {item.returned_quantity !== null && item.returned_quantity > 0 && (
                          <View style={[styles.qtyBadge, { backgroundColor: '#FFF3E0' }]}>
                            <Text style={[styles.qtyText, { color: '#E65100' }]}>
                              ↩ {item.returned_quantity} returned
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            {/* Show "Give Stock" button only for pending collections with items */}
            {selectedCollection?.status === 'pending' && collectionItems.length > 0 && (
              <TouchableOpacity
                style={[styles.giveStockButton, verifying && styles.buttonDisabled]}
                onPress={handleGiveStock}
                disabled={verifying}
              >
                {verifying ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.giveStockButtonText}>📦 Give Stock to Distributor</Text>
                )}
              </TouchableOpacity>
            )}

            {/* Show status if already given */}
            {selectedCollection?.status === 'collected' && (
              <View style={styles.statusInfo}>
                <Text style={styles.statusInfoIcon}>✅</Text>
                <Text style={styles.statusInfoText}>
                  Stock given on {selectedCollection.collected_at ? new Date(selectedCollection.collected_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'N/A'}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </AppLayout>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
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
    fontWeight: '700',
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 24,
  },
  dateButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  dateText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E293B',
  },
  generateButton: {
    backgroundColor: '#0D9488',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  generateButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  collectionCard: {
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
  collectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  distributorName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  distributorPhone: {
    fontSize: 14,
    color: '#64748B',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  collectionStats: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '500',
  },
  timestamp: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  inventoryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  inventoryInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 2,
  },
  productUnit: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 4,
  },
  lastUpdated: {
    fontSize: 13,
    color: '#64748B',
  },
  quantityBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  quantityText: {
    fontSize: 15,
    fontWeight: '700',
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
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E293B',
    letterSpacing: -0.3,
  },
  closeButton: {
    fontSize: 24,
    color: '#64748B',
    padding: 8,
  },
  modalBody: {
    maxHeight: 400,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  itemUnit: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  itemQuantities: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 6,
  },
  qtyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  qtyText: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptyItems: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyItemsIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyItemsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
  },
  emptyItemsHint: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  verifyButton: {
    backgroundColor: '#10B981',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  verifyButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  giveStockButton: {
    backgroundColor: '#7C3AED',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  giveStockButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  statusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5E9',
    padding: 16,
    borderRadius: 14,
    marginTop: 20,
    gap: 8,
  },
  statusInfoIcon: {
    fontSize: 20,
  },
  statusInfoText: {
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  editHint: {
    backgroundColor: '#EEF2FF',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  editHintText: {
    fontSize: 13,
    color: '#4F46E5',
    fontWeight: '500',
    textAlign: 'center',
  },
  requiredLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },
  qtyInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 100,
  },
  qtyInputModified: {
    borderColor: '#7C3AED',
    backgroundColor: '#F5F3FF',
  },
  qtyInput: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    minWidth: 40,
    textAlign: 'right',
    paddingVertical: 6,
  },
  qtyInputLabel: {
    fontSize: 12,
    color: '#64748B',
    marginLeft: 6,
    fontWeight: '500',
  },
  // Movements tab styles
  movementCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  movementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  movementTypeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  movementTypeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  movementQuantity: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  movementNotes: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 4,
  },
  movementDate: {
    fontSize: 12,
    color: '#94A3B8',
  },
});

export default StockManagementScreen;
