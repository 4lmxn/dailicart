import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { AuthNavigator } from './AuthNavigator';
import { CustomerNavigator } from './CustomerNavigator';
import { AdminNavigator } from './AdminNavigator';
import { DistributorNavigator } from './DistributorNavigator';
import { useAuthStore } from '../store/authStore';
import { RoleGate } from './RoleGate';
import OnboardingScreen from '../screens/auth/OnboardingScreen';
import RoleSelectorScreen from '../screens/dev/RoleSelectorScreen';
import UserPickerScreen from '../screens/dev/UserPickerScreen';
import { Platform } from 'react-native';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationRef = createNavigationContainerRef<RootStackParamList>();

const DEV_MODE_ROLE = process.env.EXPO_PUBLIC_DEV_MODE_ROLE || '';

const linking = {
  prefixes: ['idaily://', 'https://idaily.app'],
  config: {
    screens: {
      Auth: {
        screens: {
          Login: 'login',
          OTP: 'otp',
          Signup: 'signup',
          ForgotPassword: 'forgot-password',
        },
      },
      Onboarding: 'onboarding',
      Customer: {
        screens: {
          CustomerHome: 'customer/home',
          ProductCatalog: 'customer/products',
          CreateSubscription: 'customer/subscriptions/create',
          MySubscriptions: 'customer/subscriptions',
          OrderHistory: 'customer/orders',
          Calendar: 'customer/calendar',
          Wallet: 'customer/wallet',
          Profile: 'customer/profile',
        },
      },
      Admin: {
        screens: {
          AdminDashboard: 'admin/dashboard',
          CustomerList: 'admin/customers',
          CustomerDetail: 'admin/customers/:customerId',
          DistributorDetail: 'admin/distributors/:distributorId',
          ProductManagement: 'admin/products',
          SubscriptionDetail: 'admin/subscriptions/:subscriptionId',
          BuildingManagement: 'admin/buildings',
          DistributorAssignment: 'admin/assignments/distributors',
          PayoutManagement: 'admin/payouts',
          OrderAssignment: 'admin/assignments/orders',
          CreateManualOrder: 'admin/orders/create',
          SupplierManagement: 'admin/suppliers',
          PurchaseOrders: 'admin/purchase-orders',
          SupplierPayments: 'admin/supplier-payments',
          InventoryMovements: 'admin/inventory',
        },
      },
      Distributor: {
        screens: {
          DistributorHome: 'distributor/home',
          AssignedBuildings: 'distributor/buildings',
          BuildingDeliveries: 'distributor/buildings/:buildingId',
          Earnings: 'distributor/earnings',
          SalarySlips: 'distributor/salary-slips',
          TodaysDeliveries: 'distributor/today',
        },
      },
    },
  },
};

export const RootNavigator = () => {
  // Skip auth in dev mode - navigate to role selector or specific role
  useEffect(() => {
    if (DEV_MODE_ROLE && navigationRef.isReady()) {
      const roleMap: Record<string, 'Auth' | 'Customer' | 'Admin' | 'Distributor' | 'Onboarding' | 'DevSelector'> = {
        customer: 'Customer',
        admin: 'Admin',
        distributor: 'Distributor',
        onboarding: 'Onboarding',
        auth: 'Auth',
        selector: 'DevSelector',
      };
      const target = roleMap[DEV_MODE_ROLE] || 'DevSelector';
      setTimeout(() => navigationRef.navigate(target as any), 100);
    }
  }, []);

  const handleRoleSelect = (role: string) => {
    if (role === 'impersonate') {
      navigationRef.navigate('UserPicker');
      return;
    }
    if (role === 'selector') {
      navigationRef.navigate('DevSelector');
      return;
    }
    const targetMap: Record<string, keyof RootStackParamList> = {
      customer: 'Customer',
      admin: 'Admin',
      distributor: 'Distributor',
      onboarding: 'Onboarding',
      auth: 'Auth',
    };
    const target = targetMap[role];
    if (target) {
      navigationRef.navigate(target);
    }
  };

  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="DevSelector">
          {() => <RoleSelectorScreen onSelect={handleRoleSelect} />}
        </Stack.Screen>
        <Stack.Screen name="UserPicker">
          {() => <UserPickerScreen onSelect={handleRoleSelect} />}
        </Stack.Screen>
        <Stack.Screen name="Auth" component={AuthNavigator} />
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Customer" component={CustomerNavigator} />
        <Stack.Screen name="Admin" component={AdminNavigator} />
        <Stack.Screen name="Distributor" component={DistributorNavigator} />
      </Stack.Navigator>

      {!DEV_MODE_ROLE && (
        <RoleGate
          onAuth={() => { if (navigationRef.isReady()) navigationRef.navigate('Auth'); }}
          onOnboarding={() => { if (navigationRef.isReady()) navigationRef.navigate('Onboarding'); }}
          onCustomer={() => { if (navigationRef.isReady()) navigationRef.navigate('Customer'); }}
          onAdmin={() => { if (navigationRef.isReady()) navigationRef.navigate('Admin'); }}
          onDistributor={() => { if (navigationRef.isReady()) navigationRef.navigate('Distributor'); }}
        />
      )}
    </NavigationContainer>
  );
};
