import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  TextInput,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppLayout } from '../../components/AppLayout';
import { AppBar } from '../../components/AppBar';
import { theme } from '../../theme';
import { supabase } from '../../services/supabase';
import { getAuthUserId } from '../../utils/auth';
import { formatQuantity, getLocalDateString } from '../../utils/helpers';
import { EmptyState } from '../../components/EmptyState';
import { ErrorBanner } from '../../components/ErrorBanner';
import { useToast } from '../../components/Toast';
import type { DistributorScreenProps } from '../../navigation/types';

const { width } = Dimensions.get('window');

interface CollectionItem {
  product_id: string;
  product_name: string;
  product_unit: string;
  required_quantity: number;
  collected_quantity: number | null;
  returned_quantity: number | null;
}

interface CollectionData {
  collection_id: string;
  collection_date: string;
  status: string;
  collected_at: string | null;
  verified_at: string | null;
  items: CollectionItem[];
}

export const StockCollectionScreen = ({ navigation }: DistributorScreenProps<'StockCollection'>) => {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [distributorId, setDistributorId] = useState<string | null>(null);
  const [collection, setCollection] = useState<CollectionData | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const userId = await getAuthUserId();
      if (!userId) {
        setError('Not authenticated');
        return;
      }

      // Get distributor ID
      const { data: dist, error: distError } = await supabase
        .from('distributors')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (distError || !dist?.id) {
        setError('Distributor profile not found');
        return;
      }

      setDistributorId(dist.id);

      const today = getLocalDateString();

      // Query distributor_stock_handover table directly
      const { data: handoverData, error: fetchError } = await supabase
        .from('distributor_stock_handover')
        .select('id, handover_date, stock_given, stock_returned, given_at, returned_at')
        .eq('distributor_id', dist.id)
        .eq('handover_date', today)
        .maybeSingle();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      if (handoverData) {
        // Parse stock_given JSONB to get items
        const stockGiven = handoverData.stock_given || [];

        // Fetch product details for the items
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
            product_name: product?.name || 'Unknown Product',
            product_unit: product?.unit || '',
            required_quantity: item.quantity,
            collected_quantity: item.quantity,
            returned_quantity: returnedMap.get(item.product_id) || 0,
          };
        });

        setCollection({
          collection_id: handoverData.id,
          collection_date: handoverData.handover_date,
          status: handoverData.returned_at ? 'returned' : (handoverData.given_at ? 'collected' : 'pending'),
          collected_at: handoverData.given_at,
          verified_at: handoverData.returned_at,
          items,
        });

        // Pre-fill quantities with required amounts
        const initialQty: Record<string, string> = {};
        items.forEach(item => {
          if (item.collected_quantity !== null) {
            initialQty[item.product_id] = item.collected_quantity.toString();
          } else {
            initialQty[item.product_id] = item.required_quantity.toString();
          }
        });
        setQuantities(initialQty);
      } else {
        // No handover record - calculate stock requirements from pending orders
        // Get active building assignments
        const { data: activeAssignments } = await supabase
          .from('distributor_building_assignments')
          .select('tower_id')
          .eq('distributor_id', dist.id)
          .eq('is_active', true);

        const activeTowerIds = (activeAssignments || []).map(a => a.tower_id);

        if (activeTowerIds.length === 0) {
          setCollection(null);
          return;
        }

        // Get today's pending orders with product info
        const { data: orders } = await supabase
          .from('orders')
          .select('id, quantity, product_id, products!orders_product_id_fkey(id, name, unit), addresses!orders_address_id_fkey(tower_id)')
          .eq('assigned_distributor_id', dist.id)
          .eq('delivery_date', today)
          .in('status', ['scheduled', 'pending', 'assigned', 'in_transit']);

        // Filter to active buildings and aggregate by product
        const stockMap = new Map<string, CollectionItem>();
        (orders || [])
          .filter((order: any) => activeTowerIds.includes(order.addresses?.tower_id))
          .forEach((order: any) => {
            const product = order.products as any;
            if (!product?.id) return;

            const existing = stockMap.get(product.id);
            if (existing) {
              existing.required_quantity += order.quantity || 0;
            } else {
              stockMap.set(product.id, {
                product_id: product.id,
                product_name: product.name || 'Unknown',
                product_unit: product.unit || '',
                required_quantity: order.quantity || 0,
                collected_quantity: null,
                returned_quantity: null,
              });
            }
          });

        const items = Array.from(stockMap.values()).sort((a, b) => a.product_name.localeCompare(b.product_name));

        if (items.length === 0) {
          setCollection(null);
        } else {
          setCollection({
            collection_id: 'auto-generated',
            collection_date: today,
            status: 'pending',
            collected_at: null,
            verified_at: null,
            items,
          });

          // Pre-fill quantities
          const initialQty: Record<string, string> = {};
          items.forEach(item => {
            initialQty[item.product_id] = item.required_quantity.toString();
          });
          setQuantities(initialQty);
        }
      }
    } catch (err: any) {
      console.error('Error loading collection:', err);
      setError(err.message || 'Failed to load stock collection');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleQuantityChange = (productId: string, value: string) => {
    const numericValue = value.replace(/[^0-9.]/g, '');
    setQuantities(prev => ({ ...prev, [productId]: numericValue }));
  };

  const handleReturnQuantityChange = (productId: string, value: string) => {
    const numericValue = value.replace(/[^0-9.]/g, '');
    setReturnQuantities(prev => ({ ...prev, [productId]: numericValue }));
  };

  const handleConfirmCollection = async () => {
    if (!collection || !distributorId) return;

    const items = collection.items.map(item => ({
      product_id: item.product_id,
      quantity: parseFloat(quantities[item.product_id] || '0'),
    }));

    const invalidItems = items.filter(item => isNaN(item.quantity) || item.quantity < 0);
    if (invalidItems.length > 0) {
      Alert.alert('Invalid Quantities', 'Please enter valid quantities for all items');
      return;
    }

    Alert.alert(
      'Confirm Stock Collection',
      'Are you sure you want to confirm collecting this stock?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              setSubmitting(true);

              const stockItems = items.map(item => ({
                product_id: item.product_id,
                quantity: item.quantity,
              }));

              const { error } = await supabase
                .from('distributor_stock_handover')
                .update({
                  stock_given: stockItems,
                  given_at: new Date().toISOString(),
                })
                .eq('id', collection.collection_id);

              if (error) throw error;

              toast.show('Stock collection confirmed!', { type: 'success' });
              await loadData();
            } catch (err: any) {
              console.error('Error confirming collection:', err);
              Alert.alert('Error', err.message || 'Failed to confirm collection');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const handleReturnStock = async () => {
    if (!collection || !distributorId) return;

    const items = collection.items
      .filter(item => {
        const returnQty = parseFloat(returnQuantities[item.product_id] || '0');
        return returnQty > 0;
      })
      .map(item => ({
        product_id: item.product_id,
        quantity: parseFloat(returnQuantities[item.product_id] || '0'),
      }));

    if (items.length === 0) {
      Alert.alert('No Returns', 'Enter return quantities for items you want to return');
      return;
    }

    Alert.alert(
      'Return Stock',
      `Return ${items.length} item(s) to inventory?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Return',
          onPress: async () => {
            try {
              setSubmitting(true);

              const { error } = await supabase
                .from('distributor_stock_handover')
                .update({
                  stock_returned: items,
                  returned_at: new Date().toISOString(),
                })
                .eq('id', collection.collection_id);

              if (error) throw error;

              toast.show('Stock returned successfully!', { type: 'success' });
              setReturnQuantities({});
              await loadData();
            } catch (err: any) {
              console.error('Error returning stock:', err);
              Alert.alert('Error', err.message || 'Failed to return stock');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'pending':
        return {
          color: '#FF9800',
          bgColor: '#FFF8E1',
          text: 'Pending Collection',
          icon: '⏳',
          gradient: ['#FFB74D', '#FF9800'] as const
        };
      case 'collected':
        return {
          color: '#2196F3',
          bgColor: '#E3F2FD',
          text: 'Stock Collected',
          icon: '📦',
          gradient: ['#64B5F6', '#2196F3'] as const
        };
      case 'verified':
        return {
          color: '#4CAF50',
          bgColor: '#E8F5E9',
          text: 'Verified',
          icon: '✅',
          gradient: ['#81C784', '#4CAF50'] as const
        };
      case 'returned':
        return {
          color: '#9C27B0',
          bgColor: '#F3E5F5',
          text: 'Stock Returned',
          icon: '↩️',
          gradient: ['#BA68C8', '#9C27B0'] as const
        };
      default:
        return {
          color: '#666',
          bgColor: '#F5F5F5',
          text: status,
          icon: '📋',
          gradient: ['#9E9E9E', '#757575'] as const
        };
    }
  };

  const totalItems = collection?.items.length || 0;
  const totalQuantity = collection?.items.reduce((acc, item) => acc + item.required_quantity, 0) || 0;

  if (loading && !refreshing) {
    return (
      <AppLayout>
        <AppBar title="Stock Collection" onBack={() => navigation.goBack()} variant="surface" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading stock data...</Text>
        </View>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <AppBar title="Today's Stock" onBack={() => navigation.goBack()} variant="surface" />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Date Header Card */}
        <View style={styles.dateCard}>
          <Text style={styles.dateIcon}>📅</Text>
          <View>
            <Text style={styles.dateLabel}>Today's Date</Text>
            <Text style={styles.dateValue}>
              {new Date().toLocaleDateString('en-IN', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </Text>
          </View>
        </View>

        {error && <ErrorBanner message={error} onRetry={loadData} />}

        {!collection || collection.items.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconContainer}>
              <Text style={styles.emptyIcon}>📦</Text>
            </View>
            <Text style={styles.emptyTitle}>No Stock Required</Text>
            <Text style={styles.emptyDescription}>
              You have no deliveries scheduled for today, so no stock collection is needed.
            </Text>
            <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
              <Text style={styles.refreshButtonText}>🔄 Refresh</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Status Card with Gradient */}
            <LinearGradient
              colors={getStatusInfo(collection.status).gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.statusCard}
            >
              <View style={styles.statusIconContainer}>
                <Text style={styles.statusIcon}>{getStatusInfo(collection.status).icon}</Text>
              </View>
              <View style={styles.statusContent}>
                <Text style={styles.statusTitle}>{getStatusInfo(collection.status).text}</Text>
                <Text style={styles.statusSubtitle}>
                  {collection.status === 'pending' ? 'Collect from admin office' :
                    collection.status === 'collected' ? 'Ready for deliveries' :
                      collection.status === 'returned' ? 'All stock accounted' : ''}
                </Text>
              </View>
            </LinearGradient>

            {/* Summary Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{totalItems}</Text>
                <Text style={styles.statLabel}>Products</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{totalQuantity}</Text>
                <Text style={styles.statLabel}>Total Qty</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: getStatusInfo(collection.status).bgColor }]}>
                <Text style={[styles.statValue, { color: getStatusInfo(collection.status).color }]}>
                  {collection.status === 'pending' ? '⏳' : collection.status === 'collected' ? '✓' : '↩️'}
                </Text>
                <Text style={styles.statLabel}>Status</Text>
              </View>
            </View>

            {/* Instructions (only for pending) */}
            {collection.status === 'pending' && (
              <View style={styles.instructionsCard}>
                <View style={styles.instructionsHeader}>
                  <Text style={styles.instructionsIcon}>📋</Text>
                  <Text style={styles.instructionsTitle}>Instructions</Text>
                </View>
                <View style={styles.instructionsList}>
                  <View style={styles.instructionItem}>
                    <View style={styles.instructionNumber}>
                      <Text style={styles.instructionNumberText}>1</Text>
                    </View>
                    <Text style={styles.instructionText}>Collect the items listed below from admin</Text>
                  </View>
                  <View style={styles.instructionItem}>
                    <View style={styles.instructionNumber}>
                      <Text style={styles.instructionNumberText}>2</Text>
                    </View>
                    <Text style={styles.instructionText}>Verify quantities match what you receive</Text>
                  </View>
                  <View style={styles.instructionItem}>
                    <View style={styles.instructionNumber}>
                      <Text style={styles.instructionNumberText}>3</Text>
                    </View>
                    <Text style={styles.instructionText}>Tap "Confirm Collection" when done</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Stock Items Section */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>📦 Stock Items</Text>
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>{collection.items.length} items</Text>
              </View>
            </View>

            {collection.items.map((item, index) => (
              <View key={item.product_id} style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <View style={styles.itemIconContainer}>
                    <Text style={styles.itemIcon}>🥛</Text>
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.product_name}</Text>
                    <View style={styles.itemBadge}>
                      <Text style={styles.itemBadgeText}>
                        Required: {formatQuantity(item.required_quantity, item.product_unit)}
                      </Text>
                    </View>
                  </View>
                </View>

                {collection.status === 'pending' ? (
                  <View style={styles.inputSection}>
                    <Text style={styles.inputLabel}>Collected Quantity</Text>
                    <View style={styles.inputRow}>
                      <TextInput
                        style={styles.quantityInput}
                        value={quantities[item.product_id] || ''}
                        onChangeText={(v) => handleQuantityChange(item.product_id, v)}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor="#CBD5E1"
                      />
                      <View style={styles.unitBadge}>
                        <Text style={styles.unitText}>{item.product_unit}</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View style={styles.collectedSection}>
                    <View style={styles.collectedBadge}>
                      <Text style={styles.collectedIcon}>✓</Text>
                      <Text style={styles.collectedText}>
                        Collected: {formatQuantity(item.collected_quantity || 0, item.product_unit)}
                      </Text>
                    </View>
                    {item.returned_quantity !== null && item.returned_quantity > 0 && (
                      <View style={styles.returnedBadge}>
                        <Text style={styles.returnedIcon}>↩️</Text>
                        <Text style={styles.returnedText}>
                          Returned: {formatQuantity(item.returned_quantity, item.product_unit)}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Return input for collected status */}
                {collection.status === 'collected' && (
                  <View style={styles.returnSection}>
                    <Text style={styles.returnLabel}>Return unused stock:</Text>
                    <View style={styles.inputRow}>
                      <TextInput
                        style={[styles.quantityInput, styles.returnInput]}
                        value={returnQuantities[item.product_id] || ''}
                        onChangeText={(v) => handleReturnQuantityChange(item.product_id, v)}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor="#CBD5E1"
                      />
                      <View style={[styles.unitBadge, { backgroundColor: '#F3E5F5' }]}>
                        <Text style={[styles.unitText, { color: '#9C27B0' }]}>{item.product_unit}</Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            ))}

            {/* Action Buttons */}
            {collection.status === 'pending' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.confirmButton, submitting && styles.buttonDisabled]}
                onPress={handleConfirmCollection}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Text style={styles.actionButtonIcon}>✓</Text>
                    <Text style={styles.actionButtonText}>Confirm Collection</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {collection.status === 'collected' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.returnButton, submitting && styles.buttonDisabled]}
                onPress={handleReturnStock}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Text style={styles.actionButtonIcon}>↩️</Text>
                    <Text style={styles.actionButtonText}>Return Unused Stock</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {collection.status === 'returned' && (
              <View style={styles.completedBanner}>
                <Text style={styles.completedIcon}>🎉</Text>
                <View style={styles.completedContent}>
                  <Text style={styles.completedTitle}>All Done!</Text>
                  <Text style={styles.completedText}>Stock collection completed for today</Text>
                </View>
              </View>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </AppLayout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },

  // Date Card
  dateCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  dateIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  dateLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 2,
  },
  dateValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },

  // Error Banner
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  errorContent: {
    flex: 1,
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '500',
  },
  errorRetry: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 2,
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

  // Status Card
  statusCard: {
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  statusIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  statusIcon: {
    fontSize: 28,
  },
  statusContent: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: 'white',
    marginBottom: 4,
  },
  statusSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
  },

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
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
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
  },

  // Instructions Card
  instructionsCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  instructionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  instructionsIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400E',
  },
  instructionsList: {
    gap: 10,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  instructionNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  instructionNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'white',
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: '#78350F',
  },

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  sectionBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary,
  },

  // Item Card
  itemCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemIcon: {
    fontSize: 24,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  itemBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  itemBadgeText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },

  // Input Section
  inputSection: {
    marginTop: 8,
  },
  inputLabel: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quantityInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    color: '#0F172A',
  },
  unitBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  unitText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },

  // Collected Section
  collectedSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  collectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  collectedIcon: {
    fontSize: 14,
    marginRight: 6,
    color: '#059669',
  },
  collectedText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#059669',
  },
  returnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E5F5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  returnedIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  returnedText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9C27B0',
  },

  // Return Section
  returnSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  returnLabel: {
    fontSize: 13,
    color: '#9C27B0',
    fontWeight: '500',
    marginBottom: 8,
  },
  returnInput: {
    borderColor: '#E1BEE7',
  },

  // Action Buttons
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderRadius: 16,
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  confirmButton: {
    backgroundColor: theme.colors.primary,
  },
  returnButton: {
    backgroundColor: '#9C27B0',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  actionButtonIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  actionButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: 'white',
  },

  // Completed Banner
  completedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  completedIcon: {
    fontSize: 36,
    marginRight: 16,
  },
  completedContent: {
    flex: 1,
  },
  completedTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#059669',
    marginBottom: 4,
  },
  completedText: {
    fontSize: 14,
    color: '#047857',
  },
});

export default StockCollectionScreen;
