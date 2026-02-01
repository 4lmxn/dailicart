// App Constants
export const APP_NAME = 'DailiCart';
export const APP_TAGLINE = 'Fresh Milk, Every Morning';

// Date Formats
export const DATE_FORMAT = 'dd/MM/yyyy';
export const TIME_FORMAT = 'hh:mm a';
export const DATETIME_FORMAT = 'dd/MM/yyyy hh:mm a';

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
export const DEFAULT_PAGE = 1;

// API Timeout
export const API_TIMEOUT = 30000;

// OTP
export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MINUTES = 5;

// Subscription Frequencies
export const SUBSCRIPTION_FREQUENCIES = {
  daily: 'Daily',
  alternate: 'Alternate Days',
  weekly: 'Weekly',
  custom: 'Custom Days',
};

// Week Days - JavaScript format (0=Sunday, 1=Monday, etc.)
// Use WEEK_DAYS_PICKER for UI starting with Monday
export const WEEK_DAYS = [
  { id: 0, short: 'S', full: 'Sunday', name: 'Sunday' },
  { id: 1, short: 'M', full: 'Monday', name: 'Monday' },
  { id: 2, short: 'T', full: 'Tuesday', name: 'Tuesday' },
  { id: 3, short: 'W', full: 'Wednesday', name: 'Wednesday' },
  { id: 4, short: 'T', full: 'Thursday', name: 'Thursday' },
  { id: 5, short: 'F', full: 'Friday', name: 'Friday' },
  { id: 6, short: 'S', full: 'Saturday', name: 'Saturday' },
];

// Week Days starting from Monday (for picker UIs)
export const WEEK_DAYS_PICKER = [
  { id: 1, short: 'M', full: 'Monday', name: 'Monday' },
  { id: 2, short: 'T', full: 'Tuesday', name: 'Tuesday' },
  { id: 3, short: 'W', full: 'Wednesday', name: 'Wednesday' },
  { id: 4, short: 'T', full: 'Thursday', name: 'Thursday' },
  { id: 5, short: 'F', full: 'Friday', name: 'Friday' },
  { id: 6, short: 'S', full: 'Saturday', name: 'Saturday' },
  { id: 0, short: 'S', full: 'Sunday', name: 'Sunday' },
];

// Order Status
export const ORDER_STATUS = {
  pending: { label: 'Pending', color: '#FF9800' },
  delivered: { label: 'Delivered', color: '#4CAF50' },
  skipped: { label: 'Skipped', color: '#757575' },
  cancelled: { label: 'Cancelled', color: '#F44336' },
};

// Payment Status
export const PAYMENT_STATUS = {
  paid: { label: 'Paid', color: '#4CAF50' },
  pending: { label: 'Pending', color: '#FF9800' },
  failed: { label: 'Failed', color: '#F44336' },
};

// Subscription Status
export const SUBSCRIPTION_STATUS = {
  active: { label: 'Active', color: '#4CAF50' },
  paused: { label: 'Paused', color: '#FF9800' },
  cancelled: { label: 'Cancelled', color: '#F44336' },
};

// Product Categories
export const PRODUCT_CATEGORIES = [
  'Milk',
  'Curd',
  'Buttermilk',
  'Paneer',
  'Ghee',
  'Butter',
  'Cheese',
  'Other',
];

// Units
export const UNITS = ['Liter', 'ML', 'Grams', 'Kg', 'Pieces'];

// Payment Methods
export const PAYMENT_METHODS = [
  { id: 'wallet', name: 'Wallet', icon: 'wallet' },
  { id: 'upi', name: 'UPI', icon: 'qrcode' },
  { id: 'card', name: 'Card', icon: 'credit-card' },
  { id: 'cash', name: 'Cash', icon: 'cash' },
];

// Wallet
export const MINIMUM_BALANCE = 80; // Monthly service charge - subscriptions auto-pause below this
export const MIN_WALLET_BALANCE = MINIMUM_BALANCE; // Alias for backward compatibility
export const LOW_WALLET_THRESHOLD = 200;
export const WALLET_RECHARGE_AMOUNTS = [200, 500, 1000, 2000, 5000];

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Unable to connect. Please check your internet connection.',
  SESSION_EXPIRED: 'Your session has expired. Please login again.',
  GENERIC_ERROR: 'Something went wrong. Please try again.',
  INVALID_OTP: 'Invalid OTP. Please try again.',
  OTP_EXPIRED: 'OTP has expired. Please request a new one.',
  PAYMENT_FAILED: 'Payment failed. Please try again.',
  LOW_WALLET_BALANCE: 'Insufficient wallet balance. Please recharge.',
};

// Success Messages
export const SUCCESS_MESSAGES = {
  LOGIN_SUCCESS: 'Logged in successfully!',
  OTP_SENT: 'OTP sent successfully!',
  SUBSCRIPTION_CREATED: 'Subscription created successfully!',
  SUBSCRIPTION_PAUSED: 'Subscription paused successfully!',
  SUBSCRIPTION_RESUMED: 'Subscription resumed successfully!',
  ORDER_PLACED: 'Order placed successfully!',
  PAYMENT_SUCCESS: 'Payment successful!',
  WALLET_RECHARGED: 'Wallet recharged successfully!',
  DELIVERY_MARKED: 'Delivery marked successfully!',
};

// Storage Keys (AsyncStorage)
export const STORAGE_KEYS = {
  AUTH_TOKEN: '@DailiCart:authToken',
  REFRESH_TOKEN: '@DailiCart:refreshToken',
  USER_DATA: '@DailiCart:userData',
  OFFLINE_QUEUE: '@DailiCart:offlineQueue',
  LAST_SYNC: '@DailiCart:lastSync',
};

// Notification Types
export const NOTIFICATION_TYPES = {
  DELIVERY: 'delivery',
  PAYMENT: 'payment',
  SUBSCRIPTION: 'subscription',
  GENERAL: 'general',
};

// Skip Reasons
export const SKIP_REASONS = [
  'Customer not available',
  'Customer on vacation',
  'Customer requested skip',
  'Gate closed',
  'Other',
];
