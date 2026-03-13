import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { AuthNavigator } from './AuthNavigator';
import { CustomerNavigator } from './CustomerNavigator';
import { AdminNavigator } from './AdminNavigator';
import { DistributorNavigator } from './DistributorNavigator';
import { RoleGate } from './RoleGate';
import OnboardingScreen from '../screens/auth/OnboardingScreen';
import { DevRoleSelectorScreen } from '../screens/dev/DevRoleSelectorScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const linking = {
  prefixes: ['dailicart://', 'https://dailicart.in'],
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
          StockManagement: 'admin/stock',
          AdminSupport: 'admin/support',
          PendingAddressChanges: 'admin/address-changes',
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
  return (
    <>
      <NavigationContainer ref={navigationRef} linking={linking}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Auth" component={AuthNavigator} />
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          <Stack.Screen name="Customer" component={CustomerNavigator} />
          <Stack.Screen name="Admin" component={AdminNavigator} />
          <Stack.Screen name="Distributor" component={DistributorNavigator} />
          <Stack.Screen name="DevRoleSelector" component={DevRoleSelectorScreen} />
        </Stack.Navigator>
      </NavigationContainer>

      <RoleGate
        onAuth={() => { if (navigationRef.isReady()) navigationRef.navigate('Auth'); }}
        onOnboarding={() => { if (navigationRef.isReady()) navigationRef.navigate('Onboarding'); }}
        onCustomer={() => { if (navigationRef.isReady()) navigationRef.navigate('Customer'); }}
        onAdmin={() => { if (navigationRef.isReady()) navigationRef.navigate('Admin'); }}
        onDistributor={() => { if (navigationRef.isReady()) navigationRef.navigate('Distributor'); }}
        onDevRoleSelector={() => { if (navigationRef.isReady()) navigationRef.navigate('DevRoleSelector'); }}
      />
    </>
  );
};
