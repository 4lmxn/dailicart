import { supabase } from '../supabase';
import { Product } from './types';

export class ProductService {
  /**
   * Get all products
   */
  static async getAllProducts(activeOnly: boolean = false): Promise<Product[]> {
    try {
      let query = supabase
        .from('products')
        .select(`*, brands!inner(name)`) // join brands to get brand name
        .order('category')
        .order('name');

      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map((product: any) => ({
        id: product.id,
        name: product.name,
        brand: product.brands?.name || '',
        sku: product.sku || '',
        category: product.category,
        description: product.description,
        price: product.price,
        unit: product.unit,
        minOrderQty: product.min_order_qty || 1,
        maxOrderQty: product.max_order_qty,
        stock: product.stock_quantity ?? 0,
        lowStockThreshold: product.low_stock_threshold ?? 0,
        isActive: product.is_active,
      }));
    } catch (error) {
      console.error('Error fetching products:', error);
      throw error;
    }
  }

  /**
   * Get product by ID
   */
  static async getProductById(productId: string): Promise<Product | null> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`*, brands!inner(name)`) // brand name
        .eq('id', productId)
        .single();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        name: data.name,
        brand: (data as any).brands?.name || '',
        sku: data.sku || '',
        category: data.category,
        description: data.description,
        price: data.price,
        unit: data.unit,
        minOrderQty: data.min_order_qty || 1,
        maxOrderQty: data.max_order_qty,
        stock: (data as any).stock_quantity ?? 0,
        lowStockThreshold: (data as any).low_stock_threshold ?? 0,
        isActive: data.is_active,
      };
    } catch (error) {
      console.error('Error fetching product:', error);
      throw error;
    }
  }

  /**
   * Get products by category
   */
  static async getProductsByCategory(category: string): Promise<Product[]> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`*, brands!inner(name)`) // brand name
        .eq('category', category)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      return (data || []).map((product: any) => ({
        id: product.id,
        name: product.name,
        brand: product.brands?.name || '',
        sku: product.sku || '',
        category: product.category,
        description: product.description,
        price: product.price,
        unit: product.unit,
        minOrderQty: product.min_order_qty || 1,
        maxOrderQty: product.max_order_qty,
        stock: product.stock_quantity ?? 0,
        lowStockThreshold: product.low_stock_threshold ?? 0,
        isActive: product.is_active,
      }));
    } catch (error) {
      console.error('Error fetching products by category:', error);
      throw error;
    }
  }

  /**
   * Get low stock products
   */
  // No stock tracking in FRESH_START schema; low stock handled via server-side metrics if needed

  /**
   * Update product
   */
  static async updateProduct(
    productId: string,
    updates: Partial<{
      name: string;
      brand: string;
      description: string;
      price: number;
      stock: number;
      lowStockThreshold: number;
      isActive: boolean;
    }>
  ): Promise<void> {
    try {
      const updateData: any = {
        ...updates,
        stock_quantity: updates.stock,
        low_stock_threshold: updates.lowStockThreshold,
        is_active: updates.isActive,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('products')
        .update(updateData)
        .eq('id', productId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating product:', error);
      throw error;
    }
  }

  /**
   * Adjust product stock
   */
  static async adjustStock(
    productId: string,
    adjustment: number
  ): Promise<void> {
    try {
      const { data: product, error: fetchError } = await supabase
        .from('products')
        .select('stock_quantity')
        .eq('id', productId)
        .single();

      if (fetchError) throw fetchError;

      const newStock = product.stock_quantity + adjustment;

      const { error: updateError } = await supabase
        .from('products')
        .update({
          stock_quantity: newStock,
          updated_at: new Date().toISOString(),
        })
        .eq('id', productId);

      if (updateError) throw updateError;
    } catch (error) {
      console.error('Error adjusting stock:', error);
      throw error;
    }
  }

  /**
   * Create new product (Admin only)
   */
  static async createProduct(product: Omit<Product, 'id'>): Promise<string> {
    try {
      const { data, error } = await supabase
        .from('products')
        .insert({
          name: product.name,
          brand: product.brand,
          sku: product.sku,
          category: product.category,
          description: product.description,
          price: product.price,
          unit: product.unit,
          min_order_qty: product.minOrderQty || 1,
          max_order_qty: product.maxOrderQty,
          stock_quantity: product.stock,
          low_stock_threshold: product.lowStockThreshold,
          is_active: product.isActive,
        })
        .select()
        .single();

      if (error) throw error;
      return data.id;
    } catch (error) {
      console.error('Error creating product:', error);
      throw error;
    }
  }

  /**
   * Delete product (Admin only)
   */
  static async deleteProduct(productId: string): Promise<void> {
    try {
      // Check if product is used in any active subscriptions
      const { data: subscriptions, error: checkError } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('product_id', productId)
        .eq('status', 'active');

      if (checkError) throw checkError;

      if (subscriptions && subscriptions.length > 0) {
        throw new Error('Cannot delete product with active subscriptions');
      }

      // Soft delete by deactivating
      const { error } = await supabase
        .from('products')
        .update({ is_active: false })
        .eq('id', productId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting product:', error);
      throw error;
    }
  }
}
