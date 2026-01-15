import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DistributorStackParamList } from './types';
import { AssignedBuildingsScreen } from '../screens/distributor/AssignedBuildingsScreen';
import { BuildingDeliveriesScreen } from '../screens/distributor/BuildingDeliveriesScreen';
import { EarningsScreen } from '../screens/distributor/EarningsScreen';
import { SalarySlipsScreen } from '../screens/distributor/SalarySlipsScreen';
import { DistributorHomeScreen } from '../screens/distributor/DistributorHomeScreen';
import { TodaysDeliveriesScreen } from '../screens/distributor/TodaysDeliveriesScreen';
import { StockCollectionScreen } from '../screens/distributor/StockCollectionScreen';

const Stack = createNativeStackNavigator<DistributorStackParamList>();

export const DistributorNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DistributorHome" component={DistributorHomeScreen} />
      <Stack.Screen name="AssignedBuildings" component={AssignedBuildingsScreen} />
      <Stack.Screen name="BuildingDeliveries" component={BuildingDeliveriesScreen} />
      <Stack.Screen name="Earnings" component={EarningsScreen} />
      <Stack.Screen name="SalarySlips" component={SalarySlipsScreen} />
      <Stack.Screen name="TodaysDeliveries" component={TodaysDeliveriesScreen} />
      <Stack.Screen name="StockCollection" component={StockCollectionScreen} />
    </Stack.Navigator>
  );
};
