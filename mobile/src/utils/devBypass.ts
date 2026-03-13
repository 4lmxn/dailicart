import AsyncStorage from '@react-native-async-storage/async-storage';
import { config, type DevBypassRole } from '../config';
import type { User } from '../types';

export const DEV_BYPASS_SELECTED_ROLE_KEY = 'DEV_BYPASS_SELECTED_ROLE';

type TestableRole = Exclude<DevBypassRole, 'selector'>;

const DEV_BYPASS_USERS: Record<TestableRole, Pick<User, 'id' | 'name' | 'email' | 'phone' | 'role'>> = {
  customer: {
    id: config.dev.customerUserId || 'dev-customer-user',
    name: 'Dev Customer',
    email: 'dev.customer@dailicart.local',
    phone: '',
    role: 'customer',
  },
  admin: {
    id: config.dev.adminUserId || 'dev-admin-user',
    name: 'Dev Admin',
    email: 'dev.admin@dailicart.local',
    phone: '',
    role: 'admin',
  },
  distributor: {
    id: config.dev.distributorUserId || 'dev-distributor-user',
    name: 'Dev Distributor',
    email: 'dev.distributor@dailicart.local',
    phone: '',
    role: 'distributor',
  },
};

export function isDevBypassSelectorMode(): boolean {
  return config.dev.bypassRole === 'selector';
}

export async function getEffectiveDevBypassRole(): Promise<TestableRole | null> {
  if (!config.dev.bypassRole) return null;

  if (config.dev.bypassRole === 'selector') {
    const selectedRole = await AsyncStorage.getItem(DEV_BYPASS_SELECTED_ROLE_KEY);
    if (selectedRole === 'customer' || selectedRole === 'admin' || selectedRole === 'distributor') {
      return selectedRole;
    }
    return null;
  }

  return config.dev.bypassRole;
}

export async function setSelectedDevBypassRole(role: TestableRole): Promise<void> {
  await AsyncStorage.setItem(DEV_BYPASS_SELECTED_ROLE_KEY, role);
}

export async function clearSelectedDevBypassRole(): Promise<void> {
  await AsyncStorage.removeItem(DEV_BYPASS_SELECTED_ROLE_KEY);
}

export function getDevBypassUser(role: TestableRole): User {
  const user = DEV_BYPASS_USERS[role];
  const now = new Date().toISOString();

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: true,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  };
}