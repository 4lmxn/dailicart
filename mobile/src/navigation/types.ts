import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SupportPrefill } from '../screens/customer/SupportScreen';

// Auth Stack
export type AuthStackParamList = {
  Login: undefined;
  OTP: { phoneNumber: string };
  Signup: undefined;
  ForgotPassword: undefined;
};

export type AuthScreenProps<T extends keyof AuthStackParamList> = NativeStackScreenProps<
  AuthStackParamList,
  T
>;

// Customer Stack
export type CustomerStackParamList = {
  CustomerHome: undefined;
  ProductCatalog: undefined;
  CreateSubscription: { product: any };
  MySubscriptions: undefined;
  OrderHistory: undefined;
  Calendar: undefined;
  Wallet: undefined;
  Profile: undefined;
  Support: { prefill?: SupportPrefill } | undefined;
};

export type CustomerScreenProps<T extends keyof CustomerStackParamList> = NativeStackScreenProps<
  CustomerStackParamList,
  T
>;

// Admin Stack
export type AdminStackParamList = {
  AdminDashboard: undefined;
  CustomerList: undefined;
  CustomerDetail: { customerId: string };
  DistributorDetail: { distributorId: string };
  ProductManagement: undefined;
  SubscriptionDetail: { subscriptionId: string };
  BuildingManagement: undefined;
  DistributorAssignment: undefined;
  PayoutManagement: undefined;
  OrderAssignment: undefined;
  CreateManualOrder: undefined;
  SupplierManagement: undefined;
  PurchaseOrders: undefined;
  SupplierPayments: undefined;
  InventoryMovements: undefined;
  BuildingAssignment: { distributorId: string; distributorName?: string };
  SocietyDetail: { societyId: string };
  StockManagement: undefined;
  AdminSupport: undefined;
  RevenueAnalytics: undefined;
  ActivationCodes: undefined;
};

export type AdminScreenProps<T extends keyof AdminStackParamList> = NativeStackScreenProps<
  AdminStackParamList,
  T
>;

// Distributor Stack
export type DistributorStackParamList = {
  DistributorHome: undefined;
  AssignedBuildings: undefined;
  BuildingDeliveries: { buildingId: string; buildingName: string; societyName: string };
  Earnings: undefined;
  SalarySlips: undefined;
  TodaysDeliveries: undefined;
  StockCollection: undefined;
};

export type DistributorScreenProps<T extends keyof DistributorStackParamList> = NativeStackScreenProps<
  DistributorStackParamList,
  T
>;

// Root Stack
export type RootStackParamList = {
  Auth: undefined;
  Customer: undefined;
  Admin: undefined;
  Distributor: undefined;
  Onboarding: undefined;
};
