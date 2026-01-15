/**
 * Secure Storage Adapter for Supabase Auth
 * Uses expo-secure-store for encrypted storage of auth tokens
 * Falls back to memory storage on web/unsupported platforms
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// SecureStore has a 2048 byte limit per key, so we need to handle large tokens
const SECURE_STORE_KEY = 'supabase-auth-token';

// Check if SecureStore is available (not available on web)
const isSecureStoreAvailable = Platform.OS !== 'web';

// In-memory fallback for web or when SecureStore fails
let memoryStorage: Record<string, string> = {};

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (isSecureStoreAvailable) {
        const value = await SecureStore.getItemAsync(key);
        return value;
      }
      // Fallback to memory storage for web
      return memoryStorage[key] || null;
    } catch (error) {
      console.error('[SecureStorage] getItem error:', error);
      // Fallback to memory
      return memoryStorage[key] || null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (isSecureStoreAvailable) {
        await SecureStore.setItemAsync(key, value);
      } else {
        // Fallback to memory storage for web
        memoryStorage[key] = value;
      }
    } catch (error) {
      console.error('[SecureStorage] setItem error:', error);
      // Fallback to memory
      memoryStorage[key] = value;
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      if (isSecureStoreAvailable) {
        await SecureStore.deleteItemAsync(key);
      }
      // Also clear from memory
      delete memoryStorage[key];
    } catch (error) {
      console.error('[SecureStorage] removeItem error:', error);
      delete memoryStorage[key];
    }
  },
};

// Storage adapter compatible with Supabase auth storage interface
export const supabaseSecureStorage = {
  getItem: (key: string) => secureStorage.getItem(key),
  setItem: (key: string, value: string) => secureStorage.setItem(key, value),
  removeItem: (key: string) => secureStorage.removeItem(key),
};

export default secureStorage;
