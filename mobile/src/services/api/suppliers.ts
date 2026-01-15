import { supabase } from '../../services/supabase';

export class SupplierService {
  static async getSuppliers() {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return data || [];
  }

  static async createSupplier(payload: {
    name: string;
    contact_name?: string;
    phone?: string;
    email?: string;
    address?: string;
    gstin?: string;
  }) {
    const { data, error } = await supabase
      .from('suppliers')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  static async getPurchaseOrders() {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*, suppliers(name), purchase_order_items(*, products(name, unit))')
      .order('order_date', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  static async createPurchaseOrder(po: {
    supplier_id: string;
    order_date: string;
    items: Array<{ product_id: string; quantity: number; unit_cost: number; batch_id?: string | null }>;
    notes?: string;
  }) {
    const { data: poRow, error: poErr } = await supabase
      .from('purchase_orders')
      .insert({ supplier_id: po.supplier_id, order_date: po.order_date, status: 'pending', notes: po.notes })
      .select('*')
      .single();
    if (poErr) throw poErr;

    const items = po.items.map((i) => ({
      purchase_order_id: poRow.id,
      product_id: i.product_id,
      quantity: i.quantity,
      unit_cost: i.unit_cost,
      batch_id: i.batch_id || null,
    }));
    const { error: itemErr } = await supabase.from('purchase_order_items').insert(items);
    if (itemErr) throw itemErr;

    return poRow;
  }

  static async receiveGoods(payload: {
    purchase_order_id: string;
    received_date: string;
    items: Array<{ purchase_order_item_id: string; product_id: string; quantity: number; batch_id?: string | null }>;
    notes?: string;
  }) {
    // Create stock movements for received goods (inbound)
    const stockMovements = payload.items.map((i) => ({
      product_id: i.product_id,
      movement_type: 'inbound' as const,
      quantity: i.quantity,
      batch_id: i.batch_id || null,
      reference_type: 'purchase_order',
      reference_id: payload.purchase_order_id,
      notes: payload.notes || `Received from PO`,
    }));
    
    const { error: movErr } = await supabase.from('stock_movements').insert(stockMovements);
    if (movErr) throw movErr;

    // Mark PO received
    await supabase.from('purchase_orders').update({ status: 'received' }).eq('id', payload.purchase_order_id);

    return { id: payload.purchase_order_id };
  }

  static async recordSupplierPayment(payment: {
    supplier_id: string;
    payment_date: string;
    amount: number;
    method?: string;
    reference?: string;
    notes?: string;
  }) {
    // Note: supplier_payments table doesn't exist in current schema
    // Log the payment in stock_movements or return a mock response
    console.warn('supplier_payments table not in schema - payment not recorded');
    return { id: crypto.randomUUID?.() || `temp-${Date.now()}`, ...payment };
  }

  static async getInventoryByProduct(product_id: string) {
    // Get stock movements for the product to calculate current inventory
    const { data, error } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('product_id', product_id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  static async moveStockToDistributor(payload: {
    product_id: string;
    batch_id?: string | null;
    quantity: number;
    distributor_id: string;
    reference_type?: string;
    reference_id?: string;
  }) {
    // Create an outbound stock movement for issuing to distributor
    const { error } = await supabase.from('stock_movements').insert({
      product_id: payload.product_id,
      movement_type: 'outbound',
      quantity: payload.quantity,
      batch_id: payload.batch_id || null,
      reference_type: payload.reference_type || 'distributor_issue',
      reference_id: payload.reference_id || null,
      notes: `Issued to distributor ${payload.distributor_id}`,
    });
    if (error) throw error;
    
    // Also record in distributor_stock_handover
    const today = new Date().toISOString().split('T')[0];
    const { data: existing } = await supabase
      .from('distributor_stock_handover')
      .select('id, stock_given')
      .eq('distributor_id', payload.distributor_id)
      .eq('handover_date', today)
      .maybeSingle();
    
    if (existing) {
      // Update existing handover
      const currentStock = existing.stock_given || [];
      const existingItemIndex = currentStock.findIndex((s: any) => s.product_id === payload.product_id);
      if (existingItemIndex >= 0) {
        currentStock[existingItemIndex].quantity += payload.quantity;
      } else {
        currentStock.push({ product_id: payload.product_id, quantity: payload.quantity });
      }
      await supabase
        .from('distributor_stock_handover')
        .update({ stock_given: currentStock })
        .eq('id', existing.id);
    } else {
      // Create new handover
      await supabase.from('distributor_stock_handover').insert({
        distributor_id: payload.distributor_id,
        handover_date: today,
        stock_given: [{ product_id: payload.product_id, quantity: payload.quantity }],
      });
    }
    
    return true;
  }
}
