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
  Switch,
} from 'react-native';
import { theme } from '../../theme';
import { AppLayout } from '../../components/AppLayout';
import { AppBar } from '../../components/AppBar';
import { formatCurrency } from '../../utils/helpers';
import { ProductService } from '../../services/api/products';

interface ProductManagementScreenProps {
  onClose?: () => void;
}

export const ProductManagementScreen: React.FC<ProductManagementScreenProps> = ({ onClose }) => {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  const [productForm, setProductForm] = useState({
    name: '',
    brand: '',
    category: 'Milk',
    description: '',
    price: '',
    unit: '500ml',
    stock: '',
    lowStockThreshold: '',
    isActive: true,
  });

  const categories = ['all', 'Milk', 'Curd', 'Paneer', 'Ghee', 'Butter'];
  const units = ['250ml', '500ml', '1L', '2L', '200g', '500g', '1kg'];

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    filterProducts();
  }, [products, searchQuery, selectedCategory]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await ProductService.getAllProducts();
      setProducts(data);
    } catch (error) {
      console.error('Error loading products:', error);
      Alert.alert('Error', 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const filterProducts = () => {
    let filtered = products;

    if (selectedCategory !== 'all') {
      filtered = filtered.filter((p) => p.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.brand.toLowerCase().includes(query) ||
          p.category.toLowerCase().includes(query)
      );
    }

    setFilteredProducts(filtered);
  };

  const resetForm = () => {
    setProductForm({
      name: '',
      brand: '',
      category: 'Milk',
      description: '',
      price: '',
      unit: '500ml',
      stock: '',
      lowStockThreshold: '',
      isActive: true,
    });
  };

  const handleAddProduct = async () => {
    if (!productForm.name.trim() || !productForm.brand.trim() || !productForm.price) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      await ProductService.createProduct({
        name: productForm.name,
        brand: productForm.brand,
        category: productForm.category,
        description: productForm.description,
        price: parseFloat(productForm.price),
        unit: productForm.unit,
        stock: parseInt(productForm.stock) || 0,
        lowStockThreshold: parseInt(productForm.lowStockThreshold) || 50,
        isActive: productForm.isActive,
      });

      Alert.alert('Success', 'Product added successfully');
      setShowAddModal(false);
      resetForm();
      loadProducts();
    } catch (error) {
      console.error('Error adding product:', error);
      Alert.alert('Error', 'Failed to add product');
    }
  };

  const handleEditProduct = async () => {
    if (!selectedProduct) return;

    try {
      await ProductService.updateProduct(selectedProduct.id, {
        name: productForm.name,
        brand: productForm.brand,
        description: productForm.description,
        price: parseFloat(productForm.price),
        stock: parseInt(productForm.stock),
        lowStockThreshold: parseInt(productForm.lowStockThreshold),
        isActive: productForm.isActive,
      });

      Alert.alert('Success', 'Product updated successfully');
      setShowEditModal(false);
      setSelectedProduct(null);
      resetForm();
      loadProducts();
    } catch (error) {
      console.error('Error updating product:', error);
      Alert.alert('Error', 'Failed to update product');
    }
  };

  const handleDeleteProduct = (product: any) => {
    Alert.alert(
      'Delete Product',
      `Are you sure you want to delete "${product.name}"? This will deactivate the product.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await ProductService.deleteProduct(product.id);
              Alert.alert('Success', 'Product deleted successfully');
              loadProducts();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete product');
            }
          },
        },
      ]
    );
  };

  const handleAdjustStock = (product: any) => {
    Alert.prompt(
      'Adjust Stock',
      `Current stock: ${product.stock}\nEnter adjustment (+/- value):`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: async (value?: string) => {
            if (!value) return;
            const adjustment = parseInt(value);
            if (isNaN(adjustment)) {
              Alert.alert('Error', 'Invalid number');
              return;
            }

            try {
              await ProductService.adjustStock(product.id, adjustment);
              Alert.alert('Success', 'Stock updated successfully');
              loadProducts();
            } catch (error) {
              Alert.alert('Error', 'Failed to update stock');
            }
          },
        },
      ],
      'plain-text'
    );
  };

  const openEditModal = (product: any) => {
    setSelectedProduct(product);
    setProductForm({
      name: product.name,
      brand: product.brand,
      category: product.category,
      description: product.description || '',
      price: product.price.toString(),
      unit: product.unit,
      stock: product.stock.toString(),
      lowStockThreshold: product.lowStockThreshold.toString(),
      isActive: product.isActive,
    });
    setShowEditModal(true);
  };

  const renderProductForm = (isEdit: boolean) => (
    <ScrollView style={styles.modalBody}>
      <Text style={styles.modalLabel}>Product Name *</Text>
      <TextInput
        style={styles.modalInput}
        value={productForm.name}
        onChangeText={(text) => setProductForm({ ...productForm, name: text })}
        placeholder="e.g., Sid's Farm Full Cream Milk"
        editable={!isEdit}
      />

      <Text style={styles.modalLabel}>Brand *</Text>
      <TextInput
        style={styles.modalInput}
        value={productForm.brand}
        onChangeText={(text) => setProductForm({ ...productForm, brand: text })}
        placeholder="e.g., Sid's Farm"
        editable={!isEdit}
      />

      <Text style={styles.modalLabel}>Category *</Text>
      <View style={styles.categoryGrid}>
        {categories.filter((c) => c !== 'all').map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[
              styles.categoryChip,
              productForm.category === cat && styles.categoryChipActive,
            ]}
            onPress={() => setProductForm({ ...productForm, category: cat })}
            disabled={isEdit}
          >
            <Text
              style={[
                styles.categoryChipText,
                productForm.category === cat && styles.categoryChipTextActive,
              ]}
            >
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.modalLabel}>Unit</Text>
      <View style={styles.unitGrid}>
        {units.map((u) => (
          <TouchableOpacity
            key={u}
            style={[
              styles.unitChip,
              productForm.unit === u && styles.unitChipActive,
            ]}
            onPress={() => setProductForm({ ...productForm, unit: u })}
          >
            <Text
              style={[
                styles.unitChipText,
                productForm.unit === u && styles.unitChipTextActive,
              ]}
            >
              {u}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.modalLabel}>Price (₹) *</Text>
      <TextInput
        style={styles.modalInput}
        value={productForm.price}
        onChangeText={(text) => setProductForm({ ...productForm, price: text })}
        placeholder="e.g., 28"
        keyboardType="numeric"
      />

      <Text style={styles.modalLabel}>Stock Quantity</Text>
      <TextInput
        style={styles.modalInput}
        value={productForm.stock}
        onChangeText={(text) => setProductForm({ ...productForm, stock: text })}
        placeholder="e.g., 500"
        keyboardType="numeric"
      />

      <Text style={styles.modalLabel}>Low Stock Threshold</Text>
      <TextInput
        style={styles.modalInput}
        value={productForm.lowStockThreshold}
        onChangeText={(text) => setProductForm({ ...productForm, lowStockThreshold: text })}
        placeholder="e.g., 50"
        keyboardType="numeric"
      />

      <Text style={styles.modalLabel}>Description</Text>
      <TextInput
        style={[styles.modalInput, styles.modalInputMultiline]}
        value={productForm.description}
        onChangeText={(text) => setProductForm({ ...productForm, description: text })}
        placeholder="Product description..."
        multiline
        numberOfLines={3}
      />

      <View style={styles.switchRow}>
        <Text style={styles.modalLabel}>Active</Text>
        <Switch
          value={productForm.isActive}
          onValueChange={(value) => setProductForm({ ...productForm, isActive: value })}
          trackColor={{ false: '#ccc', true: '#9C27B0' }}
        />
      </View>

      <TouchableOpacity
        style={styles.modalButton}
        onPress={isEdit ? handleEditProduct : handleAddProduct}
      >
        <Text style={styles.modalButtonText}>
          {isEdit ? 'Update Product' : 'Add Product'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading products...</Text>
      </View>
    );
  }

  return (
    <AppLayout>
      <AppBar 
        title="Product Management" 
        subtitle={`${products.length} products`}
        onBack={onClose || undefined} 
        variant="surface"
        actions={[{ 
          label: '+ Add', 
          onPress: () => {
            resetForm();
            setShowAddModal(true);
          }
        }]}
      />

      {/* Search & Filter */}
      <View style={styles.filterSection}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search products..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={theme.colors.textSecondary}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
        >
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.categoryFilter,
                selectedCategory === cat && styles.categoryFilterActive,
              ]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text
                style={[
                  styles.categoryFilterText,
                  selectedCategory === cat && styles.categoryFilterTextActive,
                ]}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Product List */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {filteredProducts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>🥛</Text>
            <Text style={styles.emptyStateText}>No products found</Text>
          </View>
        ) : (
          filteredProducts.map((product) => (
            <View key={product.id} style={styles.productCard}>
              <View style={styles.productHeader}>
                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{product.name}</Text>
                  <Text style={styles.productBrand}>
                    {product.brand} • {product.category}
                  </Text>
                </View>
                <Text style={styles.productPrice}>{formatCurrency(product.price)}</Text>
              </View>

              <View style={styles.productStats}>
                <View style={styles.productStat}>
                  <Text style={styles.productStatLabel}>Stock</Text>
                  <Text
                    style={[
                      styles.productStatValue,
                      product.stock < product.lowStockThreshold && styles.productStatLow,
                    ]}
                  >
                    {product.stock}
                  </Text>
                </View>
                <View style={styles.productStat}>
                  <Text style={styles.productStatLabel}>Unit</Text>
                  <Text style={styles.productStatValue}>{product.unit}</Text>
                </View>
                <View style={styles.productStat}>
                  <Text style={styles.productStatLabel}>Status</Text>
                  <Text
                    style={[
                      styles.productStatValue,
                      product.isActive ? styles.statusActive : styles.statusInactive,
                    ]}
                  >
                    {product.isActive ? '✅ Active' : '⏸️ Inactive'}
                  </Text>
                </View>
              </View>

              <View style={styles.productActions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => openEditModal(product)}
                >
                  <Text style={styles.actionButtonText}>✏️ Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleAdjustStock(product)}
                >
                  <Text style={styles.actionButtonText}>📦 Stock</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionButtonDanger]}
                  onPress={() => handleDeleteProduct(product)}
                >
                  <Text style={[styles.actionButtonText, styles.actionButtonTextDanger]}>
                    🗑️ Delete
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add Product Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <Pressable style={styles.modalOverlay} onPress={() => setShowAddModal(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Product</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {renderProductForm(false)}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit Product Modal */}
      <Modal visible={showEditModal} animationType="slide" transparent>
        <Pressable style={styles.modalOverlay} onPress={() => setShowEditModal(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Product</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {renderProductForm(true)}
          </Pressable>
        </Pressable>
      </Modal>
    </AppLayout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  filterSection: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    marginHorizontal: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1E293B',
  },
  categoryScroll: {
    paddingHorizontal: 16,
  },
  categoryFilter: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    marginHorizontal: 4,
  },
  categoryFilterActive: {
    backgroundColor: '#10B981',
  },
  categoryFilterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  categoryFilterTextActive: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F8FAFC',
  },
  productCard: {
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
  productHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  productBrand: {
    fontSize: 14,
    color: '#64748B',
  },
  productPrice: {
    fontSize: 22,
    fontWeight: '700',
    color: '#10B981',
  },
  productStats: {
    flexDirection: 'row',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 16,
    backgroundColor: '#F8FAFC',
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  productStat: {
    flex: 1,
    alignItems: 'center',
  },
  productStatLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 6,
    fontWeight: '500',
  },
  productStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  productStatLow: {
    color: '#F59E0B',
  },
  statusActive: {
    color: '#10B981',
  },
  statusInactive: {
    color: '#94A3B8',
  },
  productActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    padding: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  actionButtonDanger: {
    backgroundColor: '#FEE2E2',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  actionButtonTextDanger: {
    color: '#DC2626',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginTop: 20,
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
    maxHeight: '90%',
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
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 20,
  },
  categoryChipActive: {
    backgroundColor: '#10B981',
  },
  categoryChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  unitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  unitChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  unitChipActive: {
    backgroundColor: '#10B981',
  },
  unitChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  unitChipTextActive: {
    color: '#FFFFFF',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
  },
  modalButton: {
    backgroundColor: '#7C3AED',
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
});
