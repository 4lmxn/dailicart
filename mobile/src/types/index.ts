// User Types - Production Schema V2
export interface User {
  id: string;
  phone: string;
  name: string;
  email?: string;
  role: 'customer' | 'distributor' | 'admin' | 'superadmin';
  isActive: boolean;
  isDeleted?: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Customer extends User {
  walletBalance: number;
  autoDeduct: boolean;
  minBalanceAlert: number;
  isWalletLocked: boolean;
  lifetimeSpent: number;
  totalOrders: number;
}

export interface Distributor extends User {
  vehicleNumber?: string;
  licenseNumber?: string;
  assignedAreas?: string[];
  rating: number;
  totalDeliveries: number;
  joinedAt: string;
}

// Address Types - with society/tower/unit references
export interface Address {
  id: string;
  userId: string;
  societyId?: string;
  towerId?: string;
  unitId?: string;
  societyName?: string;
  towerName?: string;
  apartmentNumber?: string;
  streetAddress?: string;
  area?: string;
  city: string;
  pincode?: string;
  landmark?: string;
  deliveryInstructions?: string;
  isDefault: boolean;
  isVerified: boolean;
  createdAt: string;
}

// Product Types
export interface Brand {
  id: string;
  name: string;
  logoUrl?: string;
  description?: string;
  isActive: boolean;
}

export interface Product {
  id: string;
  brandId?: string;
  brand?: Brand | string;
  name: string;
  sku?: string;
  category: string;
  unit: string;
  price: number;
  mrp?: number;
  costPrice?: number;
  minOrderQty?: number;
  maxOrderQty?: number;
  stockQuantity?: number;
  minStockAlert?: number;
  description?: string;
  imageUrl?: string;
  isActive: boolean;
  createdAt?: string;
  // Legacy fields for backwards compatibility
  stock?: number;
  lowStockThreshold?: number;
  defaultQuantity?: number;
}

// Subscription Types
export type SubscriptionFrequency = 'daily' | 'alternate' | 'weekly' | 'custom';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled';

export interface Subscription {
  id: string;
  customerId: string;
  addressId: string;
  address?: Address;
  productId: string;
  product?: Product;
  quantity: number;
  frequency: SubscriptionFrequency;
  customDays?: number[]; // [1,3,5] for Mon, Wed, Fri
  startDate: string;
  endDate?: string;
  status: SubscriptionStatus;
  pauseStartDate?: string;
  pauseEndDate?: string;
  assignedDistributorId?: string;
  createdAt: string;
  updatedAt: string;
}

// Order Types - matches database order_status enum
export type OrderStatus = 'scheduled' | 'pending' | 'assigned' | 'in_transit' | 'delivered' | 'skipped' | 'missed' | 'cancelled' | 'failed';
export type PaymentStatus = 'paid' | 'pending' | 'failed';

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  customer?: Customer;
  addressId: string;
  address?: Address;
  subscriptionId?: string;
  subscription?: Subscription;
  deliveryDate: string;
  assignedDistributorId?: string;
  distributor?: Distributor;
  status: OrderStatus;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  paymentMethod?: string;
  deliveredAt?: string;
  skipReason?: string;
  items: OrderItem[];
  createdAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  product?: Product;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

// Transaction Types
export type TransactionType = 'payment' | 'refund' | 'wallet_credit' | 'wallet_debit';
export type TransactionStatus = 'success' | 'failed' | 'pending';

export interface Transaction {
  id: string;
  transactionNumber: string;
  customerId: string;
  orderId?: string;
  transactionType: TransactionType;
  amount: number;
  paymentMethod?: string;
  paymentGateway?: string;
  gatewayTransactionId?: string;
  status: TransactionStatus;
  metadata?: Record<string, any>;
  createdAt: string;
}

// Notification Types
export type NotificationType = 'delivery' | 'payment' | 'subscription' | 'general';

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  metadata?: Record<string, any>;
  createdAt: string;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Auth Types
export interface LoginRequest {
  phone: string;
}

export interface VerifyOTPRequest {
  phone: string;
  otp: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

// Filter & Query Types
export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface OrderFilters {
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  dateRange?: DateRange;
  customerId?: string;
  distributorId?: string;
}

export interface SubscriptionFilters {
  status?: SubscriptionStatus;
  customerId?: string;
  productId?: string;
}
