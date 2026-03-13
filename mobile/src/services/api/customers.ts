import { supabase } from '../supabase';
import { Customer } from './types';

/**
 * Admin-side customer management operations
 * For customer self-service, see customerProfile.ts
 */
export class CustomerAdminService {
  /**
   * Paged customers with optional search.
   * NOTE: Active / inactive & low wallet filters are applied client-side for now.
   */
  static async getCustomersPaged(params: {
    limit?: number;
    offset?: number;
    searchQuery?: string;
    filter?: 'all' | 'low' | 'active' | 'inactive';
    lowWalletThreshold?: number;
  }): Promise<{ rows: Customer[]; total: number }> {
    const { limit = 25, offset = 0, searchQuery, filter = 'all', lowWalletThreshold = 100 } = params || {};
    try {
      let data: any[] = [];
      let count = 0;

      // Sanitize search query to prevent SQL injection via wildcards
      const sanitizeSearchQuery = (query: string): string => {
        // Escape SQL LIKE special characters and trim
        return query.replace(/[%_\\]/g, '\\$&').trim();
      };

      // Helper to search users and get their IDs
      const searchUserIds = async (query: string): Promise<string[]> => {
        const sanitizedQuery = sanitizeSearchQuery(query);
        if (!sanitizedQuery) return [];
        
        const { data: matchingUsers } = await supabase
          .from('users')
          .select('id')
          .eq('role', 'customer')
          .or(`name.ilike.%${sanitizedQuery}%,phone.ilike.%${sanitizedQuery}%,email.ilike.%${sanitizedQuery}%`);
        return (matchingUsers || []).map(u => u.id);
      };

      if (filter === 'low') {
        // Server-side low wallet filter via customers table
        let lowQ = supabase
          .from('customers')
          .select(`
            user_id,
            wallet_balance,
            users!inner (*),
            addresses:users(addresses(*))
          `, { count: 'exact' })
          .lt('wallet_balance', lowWalletThreshold)
          .range(offset, offset + limit - 1);
        
        if (searchQuery) {
          const matchingUserIds = await searchUserIds(searchQuery);
          if (matchingUserIds.length === 0) {
            return { rows: [], total: 0 };
          }
          lowQ = lowQ.in('user_id', matchingUserIds);
        }
        
        const { data: lowData, error: lowErr, count: lowCount } = await lowQ;
        if (lowErr) throw lowErr;
        data = (lowData || []).map((row: any) => ({ ...row.users, customers: [{ wallet_balance: row.wallet_balance }], addresses: row.addresses?.addresses || [] }));
        count = lowCount || 0;
      } else if (filter === 'active' || filter === 'inactive') {
        // Determine active customer profile IDs using user_id (after migration)
        const { data: activeSubs, error: subsErr } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('status', 'active');
        if (subsErr) throw subsErr;
        const activeUserIds = Array.from(new Set((activeSubs || []).map(s => s.user_id).filter(Boolean)));

        let base = supabase
          .from('customers')
          .select(`
            id,
            user_id,
            wallet_balance,
            users!inner (*)
          `, { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (searchQuery) {
          const matchingUserIds = await searchUserIds(searchQuery);
          if (matchingUserIds.length === 0) {
            return { rows: [], total: 0 };
          }
          base = base.in('user_id', matchingUserIds);
        }

        if (filter === 'active' && activeUserIds.length) {
          base = base.in('user_id', activeUserIds);
        }
        if (filter === 'inactive' && activeUserIds.length) {
          base = base.not('user_id', 'in', `(${activeUserIds.join(',')})`);
        }

        const { data: rowsData, error: rowsErr, count: rowsCount } = await base;
        if (rowsErr) throw rowsErr;
        data = rowsData || [];
        count = rowsCount || 0;
      } else {
        // Default: select from customers with joined user and addresses
        if (searchQuery) {
          // First, search users by name/phone/email
          const { data: matchingUsers, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('role', 'customer')
            .or(`name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`);
          
          if (userError) throw userError;
          
          const userIds = (matchingUsers || []).map(u => u.id);
          
          if (userIds.length === 0) {
            // No matching users, return empty
            data = [];
            count = 0;
          } else {
            // Get customers for matching users
            const { data: rowsData, error, count: rowsCount } = await supabase
              .from('customers')
              .select(`
                id,
                wallet_balance,
                user_id,
                users!inner (*)
              `, { count: 'exact' })
              .in('user_id', userIds)
              .order('created_at', { ascending: false })
              .range(offset, offset + limit - 1);
            
            if (error) throw error;
            data = rowsData || [];
            count = rowsCount || 0;
          }
        } else {
          // No search - get all customers
          const { data: rowsData, error, count: rowsCount } = await supabase
            .from('customers')
            .select(`
              id,
              wallet_balance,
              user_id,
              users!inner (*)
            `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
          
          if (error) throw error;
          data = rowsData || [];
          count = rowsCount || 0;
        }
      }

      // Fetch subscriptions using user_id
      const userIds = (data || []).map((r: any) => r.users?.id || r.user_id);
      let subCounts: Map<string, number> = new Map();
      if (userIds.length) {
        const { data: subs, error: subErr } = await supabase
          .from('subscriptions')
          .select('user_id, status')
          .in('user_id', userIds);
        if (!subErr) {
          subs?.forEach(sub => {
            if (sub.status === 'active') {
              subCounts.set(sub.user_id, (subCounts.get(sub.user_id) || 0) + 1);
            }
          });
        } else {
          console.warn('Subscription counts error (paged):', subErr);
        }
      }

      const rows: Customer[] = (data || []).map((row: any) => {
        const userId = row.users?.id || row.user_id;
        const addressDisplay = row.address || '';
        const society = '';
        const tower = '';
        const unit = '';
        const floor = '';

        return {
          id: userId,
          name: row.users.name,
          email: row.users.email,
          phone: row.users.phone,
          address: addressDisplay || row.address || '',
          society,
          tower,
          unit,
          floor,
          wallet: row.wallet_balance || 0,
          autoDeduct: false,
          subscriptions: subCounts.get(userId) || 0,
          status: (subCounts.get(userId) || 0) > 0 ? 'active' : 'inactive',
          isActive: row.users.is_active !== false,
          createdAt: row.users.created_at,
        };
      });

      return { rows, total: count || 0 };
    } catch (e) {
      console.error('Error fetching paged customers:', e);
      throw e;
    }
  }
  /**
   * Get all customers (Admin only)
   */
  static async getAllCustomers(searchQuery?: string): Promise<Customer[]> {
    try {
      let query = supabase
        .from('customers')
        .select(`
          id,
          wallet_balance,
          users:users!inner (*)
        `)
        .order('created_at', { ascending: false });

      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Get subscription counts using user_id
      const { data: subscriptions, error: subError } = await supabase
        .from('subscriptions')
        .select('user_id, status');

      if (subError) console.warn('Error fetching subscription counts:', subError);

      const subCounts = new Map();
      subscriptions?.forEach(sub => {
        if (sub.status === 'active') {
          subCounts.set(sub.user_id, (subCounts.get(sub.user_id) || 0) + 1);
        }
      });

      return (data || []).map((row: any) => {
        const society = '';
        const tower = '';
        const unit = '';
        const floor = '';
        const addressDisplay = row.address || '';

        return {
          id: row.users.id,
          name: row.users.name,
          email: row.users.email,
          phone: row.users.phone,
          address: addressDisplay || row.address || '',
          society,
          tower,
          unit,
          floor,
          wallet: row.wallet_balance || 0,
          autoDeduct: false,
          subscriptions: subCounts.get(row.users.id) || 0,
          status: (subCounts.get(row.users.id) || 0) > 0 ? 'active' : 'inactive',
          isActive: row.users.is_active !== false,
          createdAt: row.users.created_at,
        };
      });
    } catch (error) {
      console.error('Error fetching customers:', error);
      throw error;
    }
  }

  /**
   * Get customer by ID (user_id)
   */
  static async getCustomerById(userId: string): Promise<Customer | null> {
    try {
      // Primary: fetch from users with joined customers
      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          customers (id, wallet_balance, auto_deduct)
        `)
        .eq('id', userId)
        .eq('role', 'customer')
        .maybeSingle();

      if (error) throw error;

      // Fallback: fetch from customers by user_id if users row is missing
      let userRow: any = data;
      if (!userRow) {
        const { data: custJoin, error: custErr } = await supabase
          .from('customers')
          .select(`
            id,
            user_id,
            wallet_balance,
            auto_deduct,
            users:users!inner (*)
          `)
          .eq('user_id', userId)
          .maybeSingle();

        if (custErr) throw custErr;
        if (!custJoin) return null;
        // Normalize to shape similar to users + customers[]
        userRow = {
          ...custJoin.users,
          customers: [{ id: custJoin.id, wallet_balance: custJoin.wallet_balance, auto_deduct: custJoin.auto_deduct }],
        };
      }

      // Get subscription count using user_id
      const { count } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'active');
      const subscriptionCount = count || 0;

      // Fetch primary address using user_id
      let addressDisplay = '';
      let society = '';
      let tower = '';
      let unit = '';
      let floor = '';

      const { data: addrData } = await supabase
        .from('addresses')
        .select(`
          id,
          is_default,
          societies:society_id (name),
          towers:tower_id (name),
          units:unit_id (number, floor)
        `)
        .eq('user_id', userId)
        .order('is_default', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (addrData) {
        society = (addrData.societies as any)?.name || '';
        tower = (addrData.towers as any)?.name || '';
        unit = (addrData.units as any)?.number || '';
        floor = (addrData.units as any)?.floor?.toString() || '';
        addressDisplay = [society, tower, unit ? `Unit ${unit}` : '', floor ? `Floor ${floor}` : '']
          .filter(Boolean)
          .join(', ');
      }

      return {
        id: userRow.id,
        name: userRow.name,
        email: userRow.email,
        phone: userRow.phone,
        address: addressDisplay,
        society,
        tower,
        unit,
        floor,
        wallet: userRow.customers?.[0]?.wallet_balance || 0,
        autoDeduct: userRow.customers?.[0]?.auto_deduct || false,
        subscriptions: subscriptionCount,
        status: subscriptionCount > 0 ? 'active' : 'inactive',
        isActive: userRow.is_active !== false, // Default to true if not set
        createdAt: userRow.created_at,
      };
    } catch (error) {
      console.error('Error fetching customer:', error);
      throw error;
    }
  }

  /**
   * Update customer profile
   */
  static async updateCustomer(
    customerId: string,
    updates: Partial<{
      name: string;
      phone: string;
      address: string;
      area: string;
      city: string;
      pincode: string;
    }>
  ): Promise<void> {
    try {
      // Update user table
      if (updates.name || updates.phone) {
        const { error: userError } = await supabase
          .from('users')
          .update({
            name: updates.name,
            phone: updates.phone,
            updated_at: new Date().toISOString(),
          })
          .eq('id', customerId);

        if (userError) throw userError;
      }

      // Addresses are managed in the addresses table in FRESH_START schema.
      // Updating address fields would require selecting default address and updating it.
      // Skipping address updates here to avoid unintended schema writes.
    } catch (error) {
      console.error('Error updating customer:', error);
      throw error;
    }
  }

  /**
   * Get customers with low wallet balance
   */
  static async getLowWalletCustomers(threshold: number = 200): Promise<Customer[]> {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select(`
          *,
          users!inner (*)
        `)
        .lt('wallet_balance', threshold)
        .eq('users.role', 'customer');

      if (error) throw error;

      return (data || []).map(profile => ({
        id: profile.user_id,
        name: profile.users.name,
        email: profile.users.email,
        phone: profile.users.phone,
        address: '',
        area: '',
        city: '',
        pincode: '',
        wallet: profile.wallet_balance,
        autoDeduct: false,
        subscriptions: 0, // Will be populated separately if needed
        status: 'inactive' as const,
        isActive: (profile.users as any).is_active !== false,
        createdAt: profile.users.created_at,
      }));
    } catch (error) {
      console.error('Error fetching low wallet customers:', error);
      throw error;
    }
  }

  /**
   * Adjust customer wallet (Admin only)
   * Uses RPC functions for proper double-entry ledger accounting
   */
  static async adjustWallet(
    customerId: string,
    amount: number,
    reason: string
  ): Promise<void> {
    try {
      // Generate idempotency key for this admin adjustment
      const idempotencyKey = `admin_adjust_${customerId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      if (amount > 0) {
        // Credit operation — must go through Edge Function (credit_wallet is service_role only)
        const { data, error } = await supabase.functions.invoke('wallet_admin', {
          body: {
            action: 'credit',
            user_id: customerId,
            amount,
            reference_type: 'admin_adjustment',
            reference_id: null,
            idempotency_key: idempotencyKey,
            description: reason || 'Admin wallet credit',
          },
        });

        if (error) throw error;
        if (!data?.ok) throw new Error(data?.message || 'Failed to credit wallet');
      } else if (amount < 0) {
        // Debit operation — also route through Edge Function for consistency
        const { data, error } = await supabase.functions.invoke('wallet_admin', {
          body: {
            action: 'debit',
            user_id: customerId,
            amount: Math.abs(amount),
            reference_type: 'admin_adjustment',
            reference_id: null,
            idempotency_key: idempotencyKey,
            description: reason || 'Admin wallet debit',
          },
        });

        if (error) throw error;
        if (!data?.ok) throw new Error(data?.message || 'Failed to debit wallet');
      }
      // amount === 0 is a no-op
    } catch (error) {
      console.error('Error adjusting wallet:', error);
      throw error;
    }
  }

  /**
   * Block a customer (set is_active = false on users table)
   */
  static async blockCustomer(userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('users')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) throw error;
    } catch (error) {
      console.error('Error blocking customer:', error);
      throw error;
    }
  }

  /**
   * Unblock a customer (set is_active = true on users table)
   */
  static async unblockCustomer(userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('users')
        .update({
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) throw error;
    } catch (error) {
      console.error('Error unblocking customer:', error);
      throw error;
    }
  }
}
