import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CustomerStackParamList } from './types';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { CustomerHomeScreen } from '../screens/customer/CustomerHomeScreen';
import { ProductCatalogScreen } from '../screens/customer/ProductCatalogScreen';
import { CreateSubscriptionScreen } from '../screens/customer/CreateSubscriptionScreen';
import { MySubscriptionsScreen } from '../screens/customer/MySubscriptionsScreen';
import { OrderHistoryScreen } from '../screens/customer/OrderHistoryScreen';
import { CalendarScreen } from '../screens/customer/CalendarScreen';
import { WalletScreen } from '../screens/customer/WalletScreen';
import { ProfileScreen } from '../screens/customer/ProfileScreen';
import { SupportScreen } from '../screens/customer/SupportScreen';

const Stack = createNativeStackNavigator<CustomerStackParamList>();

export const CustomerNavigator = () => {
  return (
    <ErrorBoundary>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          gestureEnabled: true,
          gestureDirection: 'horizontal',
          fullScreenGestureEnabled: true,
        }}
      >
      <Stack.Screen name="CustomerHome">
        {({ navigation }) => (
          <CustomerHomeScreen
            onNavigateToProducts={() => navigation.navigate('ProductCatalog')}
            onNavigateToSubscriptions={() => navigation.navigate('MySubscriptions')}
            onNavigateToOrders={() => navigation.navigate('OrderHistory')}
            onNavigateToCalendar={() => navigation.navigate('Calendar')}
            onNavigateToWallet={() => navigation.navigate('Wallet')}
            onNavigateToProfile={() => navigation.navigate('Profile')}
            onNavigateToSupport={() => navigation.navigate('Support')}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="ProductCatalog">
        {({ navigation }) => (
          <ProductCatalogScreen
            onBack={() => navigation.goBack()}
            onProductSelect={(product) => navigation.navigate('CreateSubscription', { product })}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="CreateSubscription">
        {({ navigation, route }) => (
          <CreateSubscriptionScreen
            product={route.params?.product}
            onBack={() => navigation.goBack()}
            onComplete={() => {
              // Reset navigation stack to remove CreateSubscription from history
              navigation.reset({
                index: 1,
                routes: [
                  { name: 'CustomerHome' },
                  { name: 'MySubscriptions' },
                ],
              });
            }}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="MySubscriptions">
        {({ navigation }) => (
          <MySubscriptionsScreen onBack={() => navigation.goBack()} />
        )}
      </Stack.Screen>
      <Stack.Screen name="OrderHistory">
        {({ navigation }) => (
          <OrderHistoryScreen onBack={() => navigation.goBack()} />
        )}
      </Stack.Screen>
      <Stack.Screen name="Calendar">
        {({ navigation }) => (
          <CalendarScreen onBack={() => navigation.goBack()} />
        )}
      </Stack.Screen>
      <Stack.Screen name="Wallet">
        {({ navigation }) => (
          <WalletScreen onBack={() => navigation.goBack()} />
        )}
      </Stack.Screen>
      <Stack.Screen name="Profile">
        {({ navigation }) => (
          <ProfileScreen onBack={() => navigation.goBack()} />
        )}
      </Stack.Screen>
      <Stack.Screen name="Support">
        {({ navigation }) => (
          <SupportScreen onBack={() => navigation.goBack()} />
        )}
      </Stack.Screen>
    </Stack.Navigator>
    </ErrorBoundary>
  );
};
