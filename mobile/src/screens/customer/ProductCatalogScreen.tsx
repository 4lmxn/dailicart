import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Image,
  RefreshControl,
} from 'react-native';
import { AppLayout } from '../../components/AppLayout';
import { AppBar } from '../../components/AppBar';
import { theme } from '../../theme';
import { formatCurrency } from '../../utils/helpers';
import { ProductService } from '../../services/api/products';
import { SkeletonProductGrid } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { ErrorBanner } from '../../components/ErrorBanner';
import { useToast } from '../../components/Toast';
import { cdn } from '../../utils/helpers';

// NOTE: All mock products removed. If API call fails we now show EmptyState only.

interface ProductCatalogScreenProps {
  onBack: () => void;
  onProductSelect: (product: any) => void;
}

export const ProductCatalogScreen: React.FC<ProductCatalogScreenProps> = ({
  onBack,
  onProductSelect,
}) => {
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
  const toast = useToast();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [categoryOptions, setCategoryOptions] = useState<Array<{ id: string; name: string; icon: string }>>([{ id: 'all', name: 'All', icon: '🛒' }]);
  const [brandOptions, setBrandOptions] = useState<Array<{ id: string; name: string }>>([{ id: 'all', name: 'All Brands' }]);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await ProductService.getAllProducts(true);
      setProducts(Array.isArray(data) ? data : []);
      // Build dynamic filters from products
      const categoriesSet = new Map<string, string>();
      const brandsSet = new Map<string, string>();
      (Array.isArray(data) ? data : []).forEach((p: any) => {
        const cat = p.category;
        if (cat && !categoriesSet.has(cat)) {
          categoriesSet.set(cat, cat);
        }
        const brandId = p.brand_id || p.brand;
        const brandName = p.brand_name || p.brand || brandId;
        if (brandId && !brandsSet.has(String(brandId))) {
          brandsSet.set(String(brandId), brandName);
        }
      });
      const emojiMap: { [key: string]: string } = {
        Milk: '🥛', Dairy: '🧈', Eggs: '🥚', Bakery: '🍞', Vegetables: '🥬', Beverages: '🥤', 'Ready-to-Cook': '🍳', Essentials: '🌸',
      };
      const dynamicCategories = Array.from(categoriesSet.keys()).sort().map((c) => ({ id: c, name: c, icon: emojiMap[c] || '📦' }));
      const dynamicBrands = Array.from(brandsSet.entries()).sort((a,b)=>a[1].localeCompare(b[1])).map(([id, name]) => ({ id, name }));
      setCategoryOptions([{ id: 'all', name: 'All', icon: '🛒' }, ...dynamicCategories]);
      setBrandOptions([{ id: 'all', name: 'All Brands' }, ...dynamicBrands]);
    } catch (error: any) {
      console.error('Error loading products:', error);
      setError(error.message || 'Failed to load products. Please try again.');
      toast.show('Failed to load products', { type: 'error' });
      setProducts([]); // No fallback to mock data
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProducts();
    setRefreshing(false);
  };

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.brand_name || product.brand || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === 'all' || product.category === selectedCategory;
    const matchesBrand =
      selectedBrand === 'all' || product.brand_id === selectedBrand || product.brand === selectedBrand;
    return matchesSearch && matchesCategory && matchesBrand && (product.isActive !== false);
  });

  const renderProductCard = ({ item: product }: { item: any }) => {
              // Get emoji based on category
              const getCategoryEmoji = (category: string) => {
                const emojiMap: { [key: string]: string } = {
                  'Milk': '🥛',
                  'Dairy': '🧈',
                  'Eggs': '🥚',
                  'Bakery': '🍞',
                  'Vegetables': '🥬',
                  'Beverages': '🥤',
                  'Ready-to-Cook': '🍳',
                  'Essentials': '🌸',
                };
                return emojiMap[category] || '📦';
              };

    // Format unit display to show proper quantity
    const formatUnit = (name: string, unit: string) => {
      const bracketMatch = name.match(/\((\d+\s*(?:pcs?|pieces?|kg|g|ml|L|liters?|litres?|pack|bunch|tray|loaf))\)/i);
      if (bracketMatch) return bracketMatch[1];
      
      const unitDefaults: { [key: string]: string } = {
        'L': '1 L', 'ml': '500 ml', 'g': '500 g', 'kg': '1 kg',
        'tray': '1 tray', 'pack': '1 pack', 'loaf': '1 loaf',
        'bunch': '1 bunch', 'piece': '1 pc',
      };
      return unitDefaults[unit] || `1 ${unit}`;
    };

    return (
      <TouchableOpacity
        style={styles.productCard}
        onPress={() => onProductSelect(product)}
        activeOpacity={0.8}
      >
        <View style={styles.productImage}>
          {failedImageIds.has(product.id) ? (
            <Text style={styles.productEmoji}>
              {getCategoryEmoji(product.category)}
            </Text>
          ) : (
            <Image
              source={{ uri: cdn.productThumb(product.id) }}
              style={styles.productImageActual}
              resizeMode="cover"
              onError={() =>
                setFailedImageIds((prev) => {
                  const next = new Set(prev);
                  next.add(product.id);
                  return next;
                })
              }
            />
          )}
        </View>
        <View style={styles.productInfo}>
          <Text style={styles.productBrand}>{product.brand_name || product.brand}</Text>
          <Text style={styles.productName} numberOfLines={2}>
            {product.name}
          </Text>
          <Text style={styles.productUnit}>{formatUnit(product.name, product.unit)}</Text>
          <View style={styles.productFooter}>
            <Text style={styles.productPrice}>
              {formatCurrency(product.price)}
              <Text style={styles.priceUnit}>/{formatUnit(product.name, product.unit)}</Text>
            </Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => onProductSelect(product)}
              activeOpacity={0.7}
            >
              <Text style={styles.addButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const getCategoryEmoji = (category: string) => {
    const emojiMap: { [key: string]: string } = {
      'Milk': '🥛', 'Dairy': '🧈', 'Eggs': '🥚', 'Bakery': '🍞',
      'Vegetables': '🥬', 'Beverages': '🥤', 'Ready-to-Cook': '🍳', 'Essentials': '🌸',
    };
    return emojiMap[category] || '📦';
  };

  const renderListHeader = () => (
    <>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search products or brands..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#999"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
            <Text style={styles.clearIcon}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Error Banner */}
      {error && <ErrorBanner message={error} onRetry={loadProducts} />}

      {/* Categories */}
      <FlatList
        horizontal
        data={categoryOptions}
        keyExtractor={(item) => item.id}
        renderItem={({ item: category }) => (
          <TouchableOpacity
            style={[
              styles.categoryChip,
              selectedCategory === category.id && styles.categoryChipActive,
            ]}
            onPress={() => setSelectedCategory(category.id)}
            activeOpacity={0.7}
          >
            <Text style={styles.categoryIcon}>{category.icon}</Text>
            <Text
              style={[
                styles.categoryText,
                selectedCategory === category.id && styles.categoryTextActive,
              ]}
            >
              {category.name}
            </Text>
          </TouchableOpacity>
        )}
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesScroll}
        contentContainerStyle={styles.categoriesContent}
      />

      {/* Brands */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Filter by Brand</Text>
        <FlatList
          horizontal
          data={brandOptions}
          keyExtractor={(item) => item.id}
          renderItem={({ item: brand }) => (
            <TouchableOpacity
              style={[
                styles.brandChip,
                selectedBrand === brand.id && styles.brandChipActive,
              ]}
              onPress={() => setSelectedBrand(brand.id)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.brandText,
                  selectedBrand === brand.id && styles.brandTextActive,
                ]}
              >
                {brand.name}
              </Text>
            </TouchableOpacity>
          )}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.brandsContent}
        />
      </View>

      {/* Products Header */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {filteredProducts.length} Products
        </Text>
      </View>
    </>
  );

  return (
    <AppLayout>
      <AppBar title="Products" onBack={onBack} variant="surface" />

      {loading ? (
        <>
          {renderListHeader()}
          <SkeletonProductGrid count={6} />
        </>
      ) : (
        <FlatList
          ListHeaderComponent={renderListHeader}
          data={filteredProducts}
          renderItem={renderProductCard}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.productRow}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="📦"
              title="No Products Found"
              description="Try adjusting your search or filters to find what you're looking for."
              actionLabel="Clear Filters"
              onAction={() => {
                setSearchQuery('');
                setSelectedCategory('all');
                setSelectedBrand('all');
              }}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.md }} />}
          getItemLayout={(data, index) => ({
            length: 240,
            offset: 240 * index,
            index,
          })}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={5}
        />
      )}
    </AppLayout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  listContent: {
    paddingBottom: theme.spacing.xxl,
  },
  productRow: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.md,
  },
  searchContainer: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.text,
  },
  clearIcon: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    padding: 4,
  },
  content: {
    flex: 1,
  },
  categoriesScroll: {
    marginTop: 16,
  },
  categoriesContent: {
    paddingHorizontal: 16,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  categoryChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  categoryIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  categoryText: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '600',
  },
  categoryTextActive: {
    color: '#FFFFFF',
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 12,
  },
  brandsContent: {
    paddingBottom: 8,
  },
  brandChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  brandChipActive: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },
  brandText: {
    fontSize: 13,
    color: theme.colors.text,
    fontWeight: '600',
  },
  brandTextActive: {
    color: '#FFFFFF',
  },
  productCard: {
    flex: 1,
  },
  productImage: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    overflow: 'hidden',
  },
  productImageActual: {
    width: '100%',
    height: '100%',
  },
  productEmoji: {
    fontSize: 64,
  },
  productInfo: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
  },
  productBrand: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  productName: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
    height: 36,
  },
  productUnit: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  productFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  priceUnit: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: '400',
  },
  addButton: {
    backgroundColor: theme.colors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
