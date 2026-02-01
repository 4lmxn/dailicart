import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AdminStackParamList } from './types';
import { AdminDashboardScreen } from '../screens/admin/AdminDashboardScreen';
import { CustomerListScreen } from '../screens/admin/CustomerListScreen';
import { CustomerDetailScreen } from '../screens/admin/CustomerDetailScreen';
import { DistributorDetailScreen } from '../screens/admin/DistributorDetailScreen';
import { ProductManagementScreen } from '../screens/admin/ProductManagementScreen';
import { SubscriptionDetailScreen } from '../screens/admin/SubscriptionDetailScreen';
import { BuildingManagementScreen } from '../screens/admin/BuildingManagementScreen';
import { BuildingAssignmentScreen } from '../screens/admin/BuildingAssignmentScreen';
import { DistributorAssignmentScreen } from '../screens/admin/DistributorAssignmentScreen';
import { PayoutManagementScreen } from '../screens/admin/PayoutManagementScreen';
import { OrderAssignmentScreen } from '../screens/admin/OrderAssignmentScreen';
import { CreateManualOrderScreen } from '../screens/admin/CreateManualOrderScreen';
import { StockManagementScreen } from '../screens/admin/StockManagementScreen';
import { AdminSupportScreen } from '../screens/admin/AdminSupportScreen';
import { RevenueAnalyticsScreen } from '../screens/admin/RevenueAnalyticsScreen';
import { ActivationCodesScreen } from '../screens/admin/ActivationCodesScreen';
import { PendingAddressChangesScreen } from '../screens/admin/PendingAddressChangesScreen';
import { SocietyDetailScreen } from '../screens/admin/SocietyDetailScreen';

const Stack = createNativeStackNavigator<AdminStackParamList>();

export const AdminNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
        gestureDirection: 'horizontal',
      }}
    >
      <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
      <Stack.Screen name="CustomerList" component={CustomerListScreen} />
      <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} />
      <Stack.Screen name="DistributorDetail" component={DistributorDetailScreen} />
      <Stack.Screen name="ProductManagement" component={ProductManagementScreen} />
      <Stack.Screen name="SubscriptionDetail" component={SubscriptionDetailScreen} />
      <Stack.Screen name="BuildingManagement" component={BuildingManagementScreen} />
      <Stack.Screen name="BuildingAssignment" component={BuildingAssignmentScreen} />
      <Stack.Screen name="DistributorAssignment" component={DistributorAssignmentScreen} />
      <Stack.Screen name="PayoutManagement" component={PayoutManagementScreen} />
      <Stack.Screen name="OrderAssignment" component={OrderAssignmentScreen} />
      <Stack.Screen name="CreateManualOrder" component={CreateManualOrderScreen} />
      <Stack.Screen name="StockManagement" component={StockManagementScreen} />
      <Stack.Screen name="RevenueAnalytics" component={RevenueAnalyticsScreen} />
      <Stack.Screen name="ActivationCodes" component={ActivationCodesScreen} />
      <Stack.Screen name="SocietyDetail">
        {({ navigation, route }) => (
          <SocietyDetailScreen 
            societyId={route.params?.societyId || ''} 
            onBack={() => navigation.goBack()} 
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="AdminSupport">
        {({ navigation }) => (
          <AdminSupportScreen onBack={() => navigation.goBack()} />
        )}
      </Stack.Screen>
      <Stack.Screen name="PendingAddressChanges">
        {({ navigation }) => (
          <PendingAddressChangesScreen onBack={() => navigation.goBack()} />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
};
