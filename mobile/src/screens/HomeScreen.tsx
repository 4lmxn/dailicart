import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { CustomerHomeScreen } from './customer/CustomerHomeScreen';
import { AdminDashboardScreen } from './admin/AdminDashboardScreen';
import { ProductCatalogScreen } from './customer/ProductCatalogScreen';
import { CreateSubscriptionScreen } from './customer/CreateSubscriptionScreen';
import { WalletScreen } from './customer/WalletScreen';
import { CalendarScreen } from './customer/CalendarScreen';
import { MySubscriptionsScreen } from './customer/MySubscriptionsScreen';
import { OrderHistoryScreen } from './customer/OrderHistoryScreen';
import { ProfileScreen } from './customer/ProfileScreen';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

type CustomerScreen = 'home' | 'products' | 'subscription' | 'wallet' | 'orders' | 'calendar' | 'subscriptions' | 'profile';

export const HomeScreen: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const [currentScreen, setCurrentScreen] = useState<CustomerScreen>('home');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  // Distributor View - Should use DistributorNavigator instead
  if (user?.role === 'distributor') {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Please use Distributor navigation</Text>
      </View>
    );
  }

  // Admin View (has access to both customer and distributor views)
  if (user?.role === 'admin') {
    return <AdminDashboardScreen />;
  }

  // Customer View
  if (user?.role === 'customer') {
    if (currentScreen === 'subscription' && selectedProduct) {
      return (
        <CreateSubscriptionScreen
          product={selectedProduct}
          onBack={() => setCurrentScreen('products')}
          onComplete={() => {
            setSelectedProduct(null);
            setCurrentScreen('home');
          }}
        />
      );
    }

    if (currentScreen === 'products') {
      return (
        <ProductCatalogScreen
          onBack={() => setCurrentScreen('home')}
          onProductSelect={(product) => {
            setSelectedProduct(product);
            setCurrentScreen('subscription');
          }}
        />
      );
    }

    if (currentScreen === 'wallet') {
      return (
        <WalletScreen
          onBack={() => setCurrentScreen('home')}
        />
      );
    }

    if (currentScreen === 'calendar') {
      return (
        <CalendarScreen
          onBack={() => setCurrentScreen('home')}
        />
      );
    }

    if (currentScreen === 'subscriptions') {
      return (
        <MySubscriptionsScreen
          onBack={() => setCurrentScreen('home')}
        />
      );
    }

    if (currentScreen === 'orders') {
      return (
        <OrderHistoryScreen
          onBack={() => setCurrentScreen('home')}
        />
      );
    }

    if (currentScreen === 'profile') {
      return (
        <ProfileScreen
          onBack={() => setCurrentScreen('home')}
        />
      );
    }

    return (
      <CustomerHomeScreen
        onNavigateToProducts={() => setCurrentScreen('products')}
        onNavigateToWallet={() => setCurrentScreen('wallet')}
        onNavigateToOrders={() => setCurrentScreen('orders')}
        onNavigateToCalendar={() => setCurrentScreen('calendar')}
        onNavigateToSubscriptions={() => setCurrentScreen('subscriptions')}
        onNavigateToProfile={() => setCurrentScreen('profile')}
      />
    );
  }

  // Fallback
  return (
    <CustomerHomeScreen
      onNavigateToProducts={() => setCurrentScreen('products')}
    />
  );
};

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  fallbackText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
});