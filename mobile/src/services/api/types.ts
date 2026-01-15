// Database Types matching Supabase PRODUCTION SCHEMA V2

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string | null;
          name: string;
          phone: string;
          role: 'customer' | 'distributor' | 'admin' | 'superadmin';
          is_active: boolean;
          is_deleted: boolean;
          deleted_at: string | null;
          last_login_at: string | null;
          failed_login_attempts: number;
          locked_until: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      customers: {
        Row: {
          id: string;
          user_id: string;
          wallet_balance: number;
          wallet_version: number;
          auto_deduct: boolean;
          min_balance_alert: number;
          is_wallet_locked: boolean;
          wallet_locked_reason: string | null;
          wallet_locked_at: string | null;
          lifetime_spent: number;
          total_orders: number;
          created_at: string;
          updated_at: string;
        };
      };
      products: {
        Row: {
          id: string;
          brand_id: string | null;
          name: string;
          sku: string | null;
          category: string;
          unit: string;
          price: number;
          mrp: number | null;
          cost_price: number | null;
          stock_quantity: number;
          min_stock_alert: number;
          max_order_quantity: number;
          image_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          address_id: string;
          product_id: string;
          quantity: number;
          unit_price_locked: number;
          frequency: 'daily' | 'alternate' | 'custom';
          custom_days: number[] | null;
          start_date: string;
          end_date: string | null;
          status: 'active' | 'paused' | 'cancelled' | 'completed';
          pause_start_date: string | null;
          pause_end_date: string | null;
          pause_reason: string | null;
          assigned_distributor_id: string | null;
          next_delivery_date: string | null;
          total_delivered: number;
          total_skipped: number;
          created_at: string;
          updated_at: string;
        };
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          user_id: string;
          address_id: string;
          subscription_id: string | null;
          delivery_date: string;
          product_id: string;
          quantity: number;
          unit_price: number;
          total_amount: number;
          payment_status: 'created' | 'authorized' | 'captured' | 'failed' | 'refunded';
          status: 'scheduled' | 'pending' | 'assigned' | 'in_transit' | 'delivered' | 'skipped' | 'missed' | 'cancelled' | 'failed';
          assigned_distributor_id: string | null;
          delivered_at: string | null;
          delivery_notes: string | null;
          skip_reason: string | null;
          wallet_transaction_id: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      wallet_ledger: {
        Row: {
          id: string;
          user_id: string;
          entry_type: 'credit' | 'debit';
          amount: number;
          balance_before: number;
          balance_after: number;
          reference_type: string;
          reference_id: string | null;
          idempotency_key: string;
          description: string;
          created_by: string | null;
          created_at: string;
        };
      };
      wallet_transactions: {
        Row: {
          id: string;
          user_id: string;
          ledger_entry_id: string | null;
          order_id: string | null;
          payment_id: string | null;
          transaction_type: 'credit' | 'debit' | 'hold' | 'release';
          amount: number;
          balance_after: number | null;
          description: string | null;
          status: 'pending' | 'completed' | 'failed' | 'reversed';
          payment_method: string | null;
          meta: Record<string, any> | null;
          created_at: string;
          updated_at: string;
        };
      };
      payments: {
        Row: {
          id: string;
          user_id: string;
          payment_provider: string;
          provider_order_id: string | null;
          provider_payment_id: string | null;
          idempotency_key: string;
          status: 'created' | 'authorized' | 'captured' | 'failed' | 'refunded';
          amount: number;
          currency: string;
          error_code: string | null;
          error_description: string | null;
          meta: Record<string, any> | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      support_tickets: {
        Row: {
          id: string;
          ticket_number: string;
          user_id: string;
          order_id: string | null;
          subscription_id: string | null;
          category: 'delivery_issue' | 'product_quality' | 'payment' | 'refund' | 'subscription' | 'other';
          priority: 'low' | 'medium' | 'high' | 'urgent';
          status: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed' | 'escalated';
          subject: string;
          description: string;
          assigned_admin_id: string | null;
          resolution_notes: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          refund_amount: number | null;
          refund_approved: boolean | null;
          refund_processed_at: string | null;
          escalated_at: string | null;
          escalation_reason: string | null;
          first_response_at: string | null;
          sla_breached: boolean;
          created_at: string;
          updated_at: string;
        };
      };
      distributors: {
        Row: {
          id: string;
          user_id: string;
          vehicle_number: string | null;
          license_number: string | null;
          assigned_areas: Record<string, any> | null;
          is_active: boolean;
          rating: number;
          total_deliveries: number;
          joined_at: string;
          created_at: string;
          updated_at: string;
        };
      };
    };
  };
}

// Application Types
export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string; // Formatted display address
  society?: string;
  tower?: string;
  unit?: string;
  floor?: string;
  area?: string;
  city?: string;
  pincode?: string;
  wallet: number;
  autoDeduct: boolean;
  subscriptions: number;
  status: 'active' | 'inactive';
  isActive: boolean; // Whether user account is blocked
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  sku?: string;
  category: string;
  description: string;
  price: number;
  unit: string;
  minOrderQty?: number;
  maxOrderQty?: number;
  stock: number;
  lowStockThreshold: number;
  isActive: boolean;
  sales?: number;
}

export interface Subscription {
  id: string;
  customerId: string;
  productId: string;
  productName?: string;
  brand?: string;
  quantity: number;
  unit?: string;
  frequency: 'daily' | 'alternate' | 'custom';
  customDays?: number[];
  deliveryTime: 'morning' | 'evening';
  status: 'active' | 'paused' | 'cancelled';
  startDate: string;
  pausedUntil?: string | null;
  nextDeliveryDate?: string; // fallback mapped from startDate when future date logic absent
  price?: number;
  totalDeliveries: number;
  successfulDeliveries: number;
  skippedDeliveries: number;
  missedDeliveries: number;
}

export interface Delivery {
  id: string;
  subscriptionId: string;
  customerId: string;
  distributorId?: string;
  productId: string;
  productName?: string;
  quantity: number;
  scheduledDate: string;
  deliveryTime: 'morning' | 'evening';
  status: 'pending' | 'assigned' | 'in_transit' | 'delivered' | 'skipped' | 'missed';
  deliveredAt?: string;
  notes?: string;
}

export interface WalletTransaction {
  id: string;
  customerId: string;
  transaction_type: 'credit' | 'debit';
  amount: number;
  balanceAfter: number;
  description: string;
  paymentMethod?: string;
  paymentId?: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
}

export interface Distributor {
  id: string;
  name: string;
  full_name?: string; // Alias for name from some queries
  phone: string;
  email: string;
  zone: string;
  vehicleNumber: string;
  deliveries: number;
  onTime: number;
  rating: number;
  collection: number;
  isActive: boolean;
}

export interface DashboardStats {
  totalCustomers: number;
  activeSubscriptions: number;
  totalDistributors: number;
  todayDeliveries: number;
  pendingDeliveries: number;
  completedDeliveries: number;
  todayRevenue: number;
  monthlyRevenue: number;
  lowWalletCustomers: number;
  pausedSubscriptions: number;
}
