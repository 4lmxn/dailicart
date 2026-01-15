import { supabase } from '../supabase';
import { WalletTransaction } from './types';
import { 
  uuidSchema, 
  amountSchema, 
  walletTopupSchema,
  safeValidate 
} from '../../utils/validation';

// Generate a unique idempotency key
function generateIdempotencyKey(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${prefix}-${timestamp}-${random}`;
}

export interface WalletBalance {
  availableBalance: number;
  heldAmount: number;
  totalBalance: number;
  isLocked: boolean;
}

export interface LedgerEntry {
  id: string;
  userId: string;
  entryType: 'credit' | 'debit';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: string;
  referenceId: string | null;
  description: string;
  createdAt: string;
}

export class WalletService {
  /**
   * Validate UUID format
   */
  private static validateUserId(userId: string): string | null {
    const result = safeValidate(uuidSchema, userId);
    return result.success ? null : result.error;
  }

  /**
   * Get customer wallet balance - simple direct query
   */
  static async getBalance(userId: string): Promise<number> {
    const validationError = this.validateUserId(userId);
    if (validationError) return 0;

    try {
      const { data, error } = await supabase
        .from('customers')
        .select('wallet_balance')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching wallet balance:', error);
        return 0;
      }

      if (!data) {
        await this.ensureCustomerExists(userId);
        return 0;
      }

      return data.wallet_balance || 0;
    } catch (error) {
      console.error('Error fetching wallet balance:', error);
      return 0;
    }
  }

  /**
   * Get detailed wallet balance including holds
   */
  static async getDetailedBalance(userId: string): Promise<WalletBalance> {
    const validationError = this.validateUserId(userId);
    if (validationError) {
      return { availableBalance: 0, heldAmount: 0, totalBalance: 0, isLocked: false };
    }

    try {
      const { data, error } = await supabase
        .from('customers')
        .select('wallet_balance, held_amount, is_locked')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching detailed balance:', error);
        return { availableBalance: 0, heldAmount: 0, totalBalance: 0, isLocked: false };
      }

      if (!data) {
        await this.ensureCustomerExists(userId);
        return { availableBalance: 0, heldAmount: 0, totalBalance: 0, isLocked: false };
      }

      const balance = data.wallet_balance || 0;
      const held = data.held_amount || 0;
      return {
        availableBalance: balance - held,
        heldAmount: held,
        totalBalance: balance,
        isLocked: data.is_locked || false,
      };
    } catch (error) {
      console.error('Error fetching detailed balance:', error);
      return { availableBalance: 0, heldAmount: 0, totalBalance: 0, isLocked: false };
    }
  }

  /**
   * Ensure customer record exists
   */
  private static async ensureCustomerExists(userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('customers')
        .insert({
          user_id: userId,
          wallet_balance: 0,
          auto_deduct: false,
        });

      if (error && error.code !== '23505') {
        console.error('Error creating customer record:', error);
      }
    } catch (error) {
      console.error('Error ensuring customer exists:', error);
    }
  }

  /**
   * Get wallet ledger entries (immutable transaction history)
   */
  static async getLedgerEntries(
    userId: string,
    limit: number = 50
  ): Promise<LedgerEntry[]> {
    try {
      const { data, error } = await supabase
        .from('wallet_ledger')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return (data || []).map(entry => ({
        id: entry.id,
        userId: entry.user_id,
        entryType: entry.entry_type,
        amount: entry.amount,
        balanceBefore: entry.balance_before,
        balanceAfter: entry.balance_after,
        referenceType: entry.reference_type,
        referenceId: entry.reference_id,
        description: entry.description,
        createdAt: entry.created_at,
      }));
    } catch (error) {
      console.error('Error fetching ledger entries:', error);
      return [];
    }
  }

  /**
   * Get legacy wallet transactions (for backward compatibility)
   */
  static async getTransactions(
    userId: string,
    limit: number = 50
  ): Promise<WalletTransaction[]> {
    try {
      // First try to get from wallet_ledger (preferred)
      const ledgerEntries = await this.getLedgerEntries(userId, limit);
      
      if (ledgerEntries.length > 0) {
        return ledgerEntries.map(entry => ({
          id: entry.id,
          customerId: entry.userId,
          transaction_type: entry.entryType,
          type: entry.entryType, // For WalletScreen compatibility
          amount: entry.amount,
          balanceAfter: entry.balanceAfter,
          description: entry.description || 'Wallet transaction',
          status: 'completed' as const,
          createdAt: entry.createdAt,
          date: new Date(entry.createdAt).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
        }));
      }

      // Fallback to wallet_transactions table
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return (data || []).map(txn => ({
        id: txn.id,
        customerId: txn.user_id,
        transaction_type: txn.transaction_type === 'credit' ? 'credit' : 'debit',
        type: txn.transaction_type === 'credit' ? 'credit' : 'debit', // For WalletScreen compatibility
        amount: txn.amount,
        balanceAfter: txn.balance_after || 0,
        description: txn.description || 'Wallet transaction',
        paymentMethod: txn.payment_method,
        paymentId: txn.payment_id,
        status: txn.status,
        createdAt: txn.created_at,
        date: new Date(txn.created_at).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      }));
    } catch (error) {
      console.error('Error fetching transactions:', error);
      return [];
    }
  }

  /**
   * Credit wallet using secure RPC function
   * This function uses idempotency keys to prevent double-credits
   */
  static async creditWallet(
    userId: string,
    amount: number,
    referenceType: string,
    referenceId: string | null,
    description: string,
    idempotencyKey?: string
  ): Promise<string> {
    // Validate inputs
    const userValidation = safeValidate(uuidSchema, userId);
    if (!userValidation.success) {
      throw new Error(`Invalid user ID: ${userValidation.error}`);
    }
    const amountValidation = safeValidate(amountSchema, amount);
    if (!amountValidation.success) {
      throw new Error(`Invalid amount: ${amountValidation.error}`);
    }

    try {
      const key = idempotencyKey || generateIdempotencyKey('CREDIT');

      const { data, error } = await supabase
        .rpc('credit_wallet', {
          p_user_id: userId,
          p_amount: amount,
          p_reference_type: referenceType,
          p_reference_id: referenceId,
          p_idempotency_key: key,
          p_description: description,
          p_created_by: null,
        });

      if (error) {
        console.error('Error crediting wallet:', error);
        throw new Error(error.message || 'Failed to credit wallet');
      }

      return data; // Returns ledger entry ID
    } catch (error) {
      console.error('Credit wallet error:', error);
      throw error;
    }
  }

  /**
   * Debit wallet using secure RPC function
   * This function uses idempotency keys to prevent double-debits
   */
  static async debitWallet(
    userId: string,
    amount: number,
    referenceType: string,
    referenceId: string | null,
    description: string,
    idempotencyKey?: string
  ): Promise<string> {
    // Validate inputs
    const userValidation = safeValidate(uuidSchema, userId);
    if (!userValidation.success) {
      throw new Error(`Invalid user ID: ${userValidation.error}`);
    }
    const amountValidation = safeValidate(amountSchema, amount);
    if (!amountValidation.success) {
      throw new Error(`Invalid amount: ${amountValidation.error}`);
    }

    try {
      const key = idempotencyKey || generateIdempotencyKey('DEBIT');

      const { data, error } = await supabase
        .rpc('debit_wallet', {
          p_user_id: userId,
          p_amount: amount,
          p_reference_type: referenceType,
          p_reference_id: referenceId,
          p_idempotency_key: key,
          p_description: description,
          p_created_by: null,
        });

      if (error) {
        console.error('Error debiting wallet:', error);
        // Parse common errors
        if (error.message?.includes('Insufficient')) {
          throw new Error('Insufficient wallet balance');
        }
        if (error.message?.includes('locked')) {
          throw new Error('Wallet is locked. Please contact support.');
        }
        throw new Error(error.message || 'Failed to debit wallet');
      }

      return data; // Returns ledger entry ID
    } catch (error) {
      console.error('Debit wallet error:', error);
      throw error;
    }
  }

  /**
   * Add money to wallet (wrapper for payment flow)
   */
  static async addMoney(
    userId: string,
    amount: number,
    paymentMethod: string,
    paymentId: string
  ): Promise<WalletTransaction> {
    // Validate topup amount (includes min/max limits)
    const validation = safeValidate(walletTopupSchema, { amount });
    if (!validation.success) {
      throw new Error(validation.error);
    }

    try {
      // Create idempotency key based on payment ID to prevent duplicates
      const idempotencyKey = `PAY-${paymentId}`;
      
      // Credit the wallet
      const ledgerId = await this.creditWallet(
        userId,
        amount,
        'payment',
        null, // We'll link this later if needed
        `Wallet recharge via ${paymentMethod}`,
        idempotencyKey
      );

      // Get the new balance
      const balance = await this.getBalance(userId);

      return {
        id: ledgerId,
        customerId: userId,
        transaction_type: 'credit',
        amount: amount,
        balanceAfter: balance,
        description: `Wallet recharge via ${paymentMethod}`,
        paymentMethod: paymentMethod,
        paymentId: paymentId,
        status: 'completed',
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error adding money:', error);
      throw error;
    }
  }

  /**
   * Deduct money from wallet (for order payments)
   */
  static async deductMoney(
    userId: string,
    amount: number,
    orderId: string,
    description: string
  ): Promise<WalletTransaction> {
    try {
      // Create idempotency key based on order ID to prevent double-charging
      const idempotencyKey = `ORDER-${orderId}`;
      
      // Debit the wallet
      const ledgerId = await this.debitWallet(
        userId,
        amount,
        'order',
        orderId,
        description,
        idempotencyKey
      );

      // Get the new balance
      const balance = await this.getBalance(userId);

      return {
        id: ledgerId,
        customerId: userId,
        transaction_type: 'debit',
        amount: amount,
        balanceAfter: balance,
        description: description,
        status: 'completed',
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error deducting money:', error);
      throw error;
    }
  }

  /**
   * Get wallet settings
   */
  static async getSettings(userId: string): Promise<{
    autoDeduct: boolean;
    minBalanceAlert: number;
    isLocked: boolean;
  }> {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('auto_deduct, min_balance_alert, is_wallet_locked')
        .eq('user_id', userId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching wallet settings:', error);
      }

      if (!data) {
        await this.ensureCustomerExists(userId);
        return {
          autoDeduct: false,
          minBalanceAlert: 100,
          isLocked: false,
        };
      }

      return {
        autoDeduct: data.auto_deduct ?? false,
        minBalanceAlert: data.min_balance_alert ?? 100,
        isLocked: data.is_wallet_locked ?? false,
      };
    } catch (error) {
      console.error('Error fetching wallet settings:', error);
      return {
        autoDeduct: false,
        minBalanceAlert: 100,
        isLocked: false,
      };
    }
  }

  /**
   * Update auto-deduct setting
   */
  static async updateAutoDeduct(
    userId: string,
    enabled: boolean
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('customers')
        .update({ auto_deduct: enabled })
        .eq('user_id', userId);

      if (error) {
        throw new Error('Failed to update auto-deduct setting');
      }
    } catch (error) {
      console.error('Error updating auto-deduct:', error);
      throw error;
    }
  }

  /**
   * Update minimum balance alert threshold
   */
  static async updateMinBalanceAlert(
    userId: string,
    threshold: number
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('customers')
        .update({ min_balance_alert: threshold })
        .eq('user_id', userId);

      if (error) {
        throw new Error('Failed to update balance alert setting');
      }
    } catch (error) {
      console.error('Error updating min balance alert:', error);
      throw error;
    }
  }
}
