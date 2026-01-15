# iDaily Project — Interview Documentation (Part 3: Code Implementation Examples)

**Part 3 of 5**: Deep dive into actual code patterns, components, and implementation details

---

## Table of Contents - Part 3
1. [Authentication Implementation](#authentication-implementation)
2. [Navigation & Role-Based Routing](#navigation--role-based-routing)
3. [State Management Patterns](#state-management-patterns)
4. [Component Architecture](#component-architecture)
5. [API Service Layer](#api-service-layer)
6. [Form Handling & Validation](#form-handling--validation)

---

## Authentication Implementation

### Supabase Client Setup

**File**: `mobile/src/services/supabase.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

export const supabase = createClient(
  config.supabase.url,
  config.supabase.anonKey,
  {
    auth: {
      autoRefreshToken: true,        // Auto-refresh JWT tokens
      persistSession: true,           // Persist across app restarts
      detectSessionInUrl: typeof window !== 'undefined',  // OAuth callback
    },
  }
);

// Helper to check configuration
export const isSupabaseConfigured = (): boolean => {
  return !!(config.supabase.url && config.supabase.anonKey);
};
```

**Key Features**:
- Auto-refresh JWT before expiration
- Session persistence using AsyncStorage
- OAuth redirect detection for web builds

### Auth Store Implementation

**File**: `mobile/src/store/authStore.ts` (Simplified)

```typescript
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import { User } from '../types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  initializing: boolean;
  accountLocked: boolean;
  lockExpiresAt: string | null;
  
  // Actions
  setUser: (user: User) => void;
  loginWithSupabase: (authUser: AuthUser, session: any) => Promise<void>;
  logout: () => Promise<void>;
  loadUserFromStorage: () => Promise<void>;
  checkAccountStatus: (userId: string) => Promise<{
    isDeleted: boolean;
    isLocked: boolean;
    lockedUntil: string | null;
  }>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  initializing: true,
  accountLocked: false,
  lockExpiresAt: null,

  setUser: (user) => {
    set({ user, isAuthenticated: true });
  },

  checkAccountStatus: async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('is_deleted, locked_until')
        .eq('id', userId)
        .single();

      if (error) throw error;

      const isDeleted = data?.is_deleted || false;
      const lockedUntil = data?.locked_until;
      const isLocked = lockedUntil && new Date(lockedUntil) > new Date();

      if (isLocked) {
        set({ accountLocked: true, lockExpiresAt: lockedUntil });
      } else {
        set({ accountLocked: false, lockExpiresAt: null });
      }

      return { 
        isDeleted, 
        isLocked: !!isLocked, 
        lockedUntil: lockedUntil || null 
      };
    } catch (error) {
      console.error('[checkAccountStatus Error]', error);
      return { isDeleted: false, isLocked: false, lockedUntil: null };
    }
  },

  loginWithSupabase: async (authUser: AuthUser, session: any) => {
    try {
      // Check if account is deleted or locked
      const accountStatus = await get().checkAccountStatus(authUser.id);
      
      if (accountStatus.isDeleted) {
        throw new Error('This account has been deleted. Contact support.');
      }
      
      if (accountStatus.isLocked) {
        const lockTime = new Date(accountStatus.lockedUntil!).toLocaleString();
        throw new Error(`Account locked until ${lockTime}. Try again later.`);
      }

      // Map AuthUser to User type
      const user: User = {
        id: authUser.id,
        phone: authUser.phone || '',
        name: authUser.user_metadata?.name || 'User',
        email: authUser.email,
        role: authUser.user_metadata?.role || 'customer',
      };

      // Store session tokens
      await AsyncStorage.multiSet([
        ['@auth_token', session.access_token],
        ['@refresh_token', session.refresh_token],
        ['@user', JSON.stringify(user)],
      ]);

      // Update last login
      await supabase
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', user.id);

      set({
        user,
        accessToken: session.access_token,
        isAuthenticated: true,
        initializing: false,
      });
    } catch (error) {
      console.error('[loginWithSupabase Error]', error);
      throw error;
    }
  },

  logout: async () => {
    try {
      // Sign out from Supabase
      await supabase.auth.signOut();
      
      // Clear local storage
      await AsyncStorage.multiRemove(['@auth_token', '@refresh_token', '@user']);
      
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        accountLocked: false,
        lockExpiresAt: null,
      });
    } catch (error) {
      console.error('[logout Error]', error);
    }
  },

  loadUserFromStorage: async () => {
    try {
      set({ initializing: true });
      
      // Check Supabase session
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        set({ initializing: false, isAuthenticated: false });
        return;
      }

      // Load user from local storage
      const userJson = await AsyncStorage.getItem('@user');
      if (userJson) {
        const user = JSON.parse(userJson);
        
        // Verify account status
        const status = await get().checkAccountStatus(user.id);
        if (status.isDeleted || status.isLocked) {
          await get().logout();
          return;
        }

        set({
          user,
          accessToken: session.access_token,
          isAuthenticated: true,
          initializing: false,
        });
      } else {
        set({ initializing: false });
      }
    } catch (error) {
      console.error('[loadUserFromStorage Error]', error);
      set({ initializing: false });
    }
  },
}));
```

**Key Patterns**:
1. **Zustand Store**: Minimal boilerplate state management
2. **AsyncStorage**: Persist user session across app restarts
3. **Account Status Checks**: Verify user not deleted/locked before login
4. **Error Handling**: Graceful error messages with logging

### App Entry Point with OAuth

**File**: `mobile/App.tsx`

```typescript
import React, { useEffect, useRef } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuthStore } from './src/store/authStore';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { ToastProvider } from './src/components/Toast';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { AuthService } from './src/services/auth/authService';

export default function App() {
  const { isLoading, loadUserFromStorage } = useAuthStore();
  const handledOnceRef = useRef(false);  // Prevent 429 from multiple exchanges

  useEffect(() => {
    loadUserFromStorage();
  }, []);

  // Handle OAuth redirect URLs (milk://auth/callback?...)
  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url || !url.includes('auth/callback')) return;
      
      // Prevent multiple exchanges causing 429 from Supabase
      if (handledOnceRef.current) return;
      handledOnceRef.current = true;
      
      const result = await AuthService.handleOAuthRedirect(url);
      
      if (result.success && result.user && result.session) {
        await useAuthStore.getState().loginWithSupabase(
          result.user, 
          result.session
        );
        await useAuthStore.getState().loadUserFromStorage();
      } else {
        handledOnceRef.current = false;  // Allow retry
      }
    };

    // Initial URL when app opened via deep-link
    if (Platform.OS !== 'web') {
      Linking.getInitialURL().then(handleUrl);
    }

    // Listen for in-app URL events
    const sub = Linking.addEventListener('url', (event) => {
      if (Platform.OS !== 'web') handleUrl(event.url);
    });
    
    return () => sub.remove();
  }, []);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <ErrorBoundary>
          <RootNavigator />
        </ErrorBoundary>
      </ToastProvider>
    </SafeAreaProvider>
  );
}
```

**Key Concepts**:
- **Deep Linking**: Handle OAuth redirect URLs
- **Rate Limit Protection**: `handledOnceRef` prevents duplicate token exchanges
- **Error Boundary**: Catch React errors gracefully
- **Toast Provider**: Global notification system

---

## Navigation & Role-Based Routing

### RoleGate Component

**File**: `mobile/src/navigation/RoleGate.tsx`

```typescript
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../services/supabase';
import { theme } from '../theme';

interface RoleGateProps {
  onCustomer: () => void;
  onAdmin: () => void;
  onDistributor: () => void;
  onOnboarding: () => void;
  onAuth: () => void;
}

/**
 * Central role-based router. Decides which stack to show.
 * Supports dev override via EXPO_PUBLIC_FORCE_ROLE env var.
 */
export const RoleGate: React.FC<RoleGateProps> = ({
  onCustomer,
  onAdmin,
  onDistributor,
  onOnboarding,
  onAuth,
}) => {
  const { isAuthenticated, user, initializing } = useAuthStore();
  const forceRole = (process.env.EXPO_PUBLIC_FORCE_ROLE || '').toLowerCase();
  const [checkingAddress, setCheckingAddress] = useState(false);

  useEffect(() => {
    let cancelled = false;
    
    const run = async () => {
      if (initializing) return;

      // Not authenticated -> show auth screens
      if (!isAuthenticated) {
        onAuth();
        return;
      }

      // Dev mode: force specific role
      if (forceRole === 'customer') { onCustomer(); return; }
      if (forceRole === 'admin') { onAdmin(); return; }
      if (forceRole === 'distributor') { onDistributor(); return; }

      const role = user?.role;
      if (!role) { onOnboarding(); return; }

      // Customer-specific: Ensure at least one address exists
      if (role === 'customer') {
        setCheckingAddress(true);
        const { data, error } = await supabase
          .from('addresses')
          .select('id')
          .eq('customer_id', user.customer_id)
          .limit(1);
        
        if (!cancelled) {
          setCheckingAddress(false);
          
          if (error) {
            onCustomer();  // Still allow; show inline error
            return;
          }
          
          if (!data || data.length === 0) {
            onOnboarding();  // No address -> complete profile
            return;
          }
          
          onCustomer();
          return;
        }
      }

      // Route based on role
      switch (role) {
        case 'admin': 
        case 'superadmin':
          onAdmin(); 
          break;
        case 'distributor': 
          onDistributor(); 
          break;
        default: 
          onOnboarding(); 
          break;
      }
    };
    
    run();
    return () => { cancelled = true; };
  }, [isAuthenticated, user, initializing, forceRole]);

  // Show loading indicator during checks
  if (initializing || checkingAddress) {
    return (
      <View style={{ 
        flex: 1, 
        alignItems: 'center', 
        justifyContent: 'center', 
        backgroundColor: theme.colors.background 
      }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return null;
};
```

**Key Features**:
1. **Role Detection**: Routes to appropriate navigator based on `user.role`
2. **Dev Override**: `EXPO_PUBLIC_FORCE_ROLE` for testing specific roles
3. **Address Validation**: Customers must have delivery address before accessing app
4. **Async Checks**: Non-blocking address validation with loading state

### Root Navigator

**File**: `mobile/src/navigation/RootNavigator.tsx` (Simplified)

```typescript
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RoleGate } from './RoleGate';
import { AuthNavigator } from './AuthNavigator';
import { CustomerNavigator } from './CustomerNavigator';
import { AdminNavigator } from './AdminNavigator';
import { DistributorNavigator } from './DistributorNavigator';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { linking } from './linking';

const Stack = createNativeStackNavigator();

export function RootNavigator() {
  return (
    <NavigationContainer linking={linking}>
      <RoleGate
        onAuth={() => (
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Auth" component={AuthNavigator} />
          </Stack.Navigator>
        )}
        onCustomer={() => (
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Customer" component={CustomerNavigator} />
          </Stack.Navigator>
        )}
        onAdmin={() => (
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Admin" component={AdminNavigator} />
          </Stack.Navigator>
        )}
        onDistributor={() => (
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Distributor" component={DistributorNavigator} />
          </Stack.Navigator>
        )}
        onOnboarding={() => (
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          </Stack.Navigator>
        )}
      />
    </NavigationContainer>
  );
}
```

**Navigation Architecture**:
```
NavigationContainer
  └── RoleGate (decides which stack)
      ├── AuthNavigator (Login, Signup, ForgotPassword)
      ├── CustomerNavigator (Products, Orders, Wallet, Profile)
      ├── DistributorNavigator (Deliveries, Earnings, Schedule)
      ├── AdminNavigator (Dashboard, Customers, Orders, Inventory)
      └── OnboardingScreen (Complete profile/address)
```

---

## State Management Patterns

### Admin Dashboard Store

**File**: `mobile/src/store/adminDashboardStore.ts` (Simplified)

```typescript
import { create } from 'zustand';
import { supabase } from '../services/supabase';

interface DashboardData {
  date: string;
  orders_today: {
    pending: number;
    delivered: number;
    revenue: number;
  };
  subscriptions: {
    active: number;
    paused: number;
    cancelled: number;
  };
  // ... more metrics
}

interface AdminDashboardState {
  loading: boolean;
  error: string | null;
  dashboard: DashboardData | null;
  lastUpdated: number | null;
  
  fetchDashboard: (date?: string) => Promise<void>;
  subscribeRealtime: () => void;
}

export const useAdminDashboardStore = create<AdminDashboardState>((set, get) => ({
  loading: false,
  error: null,
  dashboard: null,
  lastUpdated: null,

  fetchDashboard: async (date?: string) => {
    try {
      set({ loading: true, error: null });
      const targetDate = date || new Date().toISOString().slice(0, 10);

      // Parallel queries for performance
      const [ordersRes, subsRes, custRes] = await Promise.all([
        supabase
          .from('orders')
          .select('status,total_amount')
          .eq('delivery_date', targetDate),
        
        supabase
          .from('subscriptions')
          .select('status'),
        
        supabase
          .from('customers')
          .select('id', { count: 'exact' }),
      ]);

      // Aggregate data
      const orders = ordersRes.data || [];
      const revenue = orders
        .filter(o => o.status === 'delivered')
        .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
      
      const pending = orders.filter(o => 
        ['pending', 'assigned', 'in_transit'].includes(o.status)
      ).length;
      
      const delivered = orders.filter(o => o.status === 'delivered').length;

      const subs = subsRes.data || [];
      const subsActive = subs.filter(s => s.status === 'active').length;
      const subsPaused = subs.filter(s => s.status === 'paused').length;
      const subsCancelled = subs.filter(s => s.status === 'cancelled').length;

      set({
        dashboard: {
          date: targetDate,
          orders_today: { pending, delivered, revenue },
          subscriptions: { 
            active: subsActive, 
            paused: subsPaused, 
            cancelled: subsCancelled 
          },
        },
        loading: false,
        lastUpdated: Date.now(),
      });
    } catch (error: any) {
      set({ 
        error: error.message || 'Failed to fetch dashboard', 
        loading: false 
      });
    }
  },

  subscribeRealtime: () => {
    // Subscribe to realtime changes on orders table
    const subscription = supabase
      .channel('dashboard-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          console.log('[Realtime] Order changed:', payload);
          // Refresh dashboard data
          get().fetchDashboard();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  },
}));
```

**Key Patterns**:
1. **Parallel Queries**: `Promise.all()` for faster data fetching
2. **Computed Values**: Aggregate metrics calculated client-side
3. **Realtime Subscriptions**: Auto-refresh on database changes
4. **Error Handling**: Graceful error states with messages

---

## Component Architecture

### Reusable AppBar Component

**File**: `mobile/src/components/AppBar.tsx`

```typescript
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';

interface AppBarProps {
  title: string;
  showBack?: boolean;
  rightAction?: {
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  };
  subtitle?: string;
}

export function AppBar({ 
  title, 
  showBack = true, 
  rightAction, 
  subtitle 
}: AppBarProps) {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <View style={styles.leftSection}>
        {showBack && (
          <TouchableOpacity 
            onPress={() => navigation.goBack()}
            style={styles.iconButton}
          >
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.centerSection}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      <View style={styles.rightSection}>
        {rightAction && (
          <TouchableOpacity 
            onPress={rightAction.onPress}
            style={styles.iconButton}
          >
            <Ionicons 
              name={rightAction.icon} 
              size={24} 
              color={theme.colors.primary} 
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 8,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  leftSection: {
    width: 48,
    justifyContent: 'center',
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
  },
  rightSection: {
    width: 48,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  iconButton: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
});
```

**Usage**:
```typescript
<AppBar 
  title="Order Details" 
  rightAction={{ icon: 'share-outline', onPress: handleShare }}
/>
```

### Error Boundary Component

**File**: `mobile/src/components/ErrorBoundary.tsx`

```typescript
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../theme';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    // TODO: Send to error tracking service (Sentry, etc.)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {this.state.error?.message || 'Unknown error'}
          </Text>
          <TouchableOpacity 
            style={styles.button} 
            onPress={this.handleReset}
          >
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    color: theme.colors.error,
  },
  message: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
```

---

## API Service Layer

### Typed API Wrapper Example

**File**: `mobile/src/services/api/orders.ts` (Simplified)

```typescript
import { supabase } from '../supabase';
import { Order, CreateOrderInput, OrderStatus } from '../../types';

export class OrderService {
  /**
   * Fetch customer's orders with pagination
   */
  static async getCustomerOrders(
    customerId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ orders: Order[]; hasMore: boolean }> {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from('orders')
      .select('*, addresses(*), products(*)', { count: 'exact' })
      .eq('customer_id', customerId)
      .order('delivery_date', { ascending: false })
      .range(from, to);

    if (error) throw error;

    return {
      orders: data as Order[],
      hasMore: !!count && count > to + 1,
    };
  }

  /**
   * Create a new order
   */
  static async createOrder(input: CreateOrderInput): Promise<Order> {
    // Validate stock availability
    const { data: product } = await supabase
      .from('products')
      .select('stock_quantity, base_price')
      .eq('id', input.product_id)
      .single();

    if (!product || product.stock_quantity < input.quantity) {
      throw new Error('Insufficient stock');
    }

    // Calculate totals
    const subtotal = product.base_price * input.quantity;
    const deliveryCharge = input.delivery_charge || 0;
    const discount = input.discount || 0;
    const total = subtotal + deliveryCharge - discount;

    // Create order
    const { data, error } = await supabase
      .from('orders')
      .insert({
        customer_id: input.customer_id,
        address_id: input.address_id,
        delivery_date: input.delivery_date,
        subtotal,
        delivery_charge: deliveryCharge,
        discount,
        total_amount: total,
        status: 'pending' as OrderStatus,
      })
      .select()
      .single();

    if (error) throw error;

    // Create order items
    await supabase.from('order_items').insert({
      order_id: data.id,
      product_id: input.product_id,
      quantity: input.quantity,
      unit_price: product.base_price,
      line_total: subtotal,
    });

    return data as Order;
  }

  /**
   * Update order status (distributor action)
   */
  static async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    notes?: string
  ): Promise<void> {
    const updates: any = { status, updated_at: new Date().toISOString() };

    if (status === 'delivered') {
      updates.delivered_at = new Date().toISOString();
    }

    if (notes) {
      updates.notes = notes;
    }

    const { error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', orderId);

    if (error) throw error;
  }

  /**
   * Mark order as delivered (calls DB function for wallet deduction)
   */
  static async markDelivered(
    orderId: string,
    distributorId: string,
    idempotencyKey: string
  ): Promise<{ success: boolean; message?: string }> {
    const { data, error } = await supabase.rpc('mark_order_delivered', {
      p_order_id: orderId,
      p_distributor_id: distributorId,
      p_idempotency_key: idempotencyKey,
    });

    if (error) throw error;

    return data;
  }
}
```

**Key Features**:
1. **TypeScript Types**: Fully typed inputs and outputs
2. **Error Handling**: Throws descriptive errors
3. **Business Logic**: Validates stock, calculates totals
4. **DB Functions**: Calls Postgres functions for complex operations
5. **Pagination**: Built-in pagination support

---

**End of Part 3**

**Next**: Part 4 - Features & User Flows
