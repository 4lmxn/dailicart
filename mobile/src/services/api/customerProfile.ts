import { supabase } from '../supabase';

/**
 * Customer profile operations (used by customer themselves)
 * For admin customer management, see customers.ts
 */
export const CustomerProfileService = {
  /**
   * Update or create a customer's address
   * Uses the addresses table with proper society/tower/unit references
   */
  async updateAddress(userId: string, address: {
    societyId?: string;
    towerId?: string;
    unitId?: string;
    streetAddress?: string;
    area?: string;
    city?: string;
    pincode?: string;
    landmark?: string;
    deliveryInstructions?: string;
    isDefault?: boolean;
  }) {
    // First check if user has a default address
    const { data: existingAddress } = await supabase
      .from('addresses')
      .select('id')
      .eq('user_id', userId)
      .eq('is_default', true)
      .maybeSingle();

    if (existingAddress) {
      // Update existing default address
      const { error } = await supabase
        .from('addresses')
        .update({
          society_id: address.societyId,
          tower_id: address.towerId,
          unit_id: address.unitId,
          street_address: address.streetAddress,
          area: address.area,
          city: address.city,
          pincode: address.pincode,
          landmark: address.landmark,
          delivery_instructions: address.deliveryInstructions,
        })
        .eq('id', existingAddress.id);
      if (error) throw error;
    } else {
      // Create new address
      const { error } = await supabase
        .from('addresses')
        .insert({
          user_id: userId,
          society_id: address.societyId,
          tower_id: address.towerId,
          unit_id: address.unitId,
          street_address: address.streetAddress,
          area: address.area,
          city: address.city || 'Mumbai',
          pincode: address.pincode,
          landmark: address.landmark,
          delivery_instructions: address.deliveryInstructions,
          is_default: true,
        });
      if (error) throw error;
    }
  },

  /**
   * Ensure customer records exist for a user
   * Creates customers table entry with proper wallet initialization
   */
  async ensureUserRecords(userId: string) {
    // Ensure a customers row exists for the user
    const { data, error } = await supabase
      .from('customers')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const { error: insertErr } = await supabase
        .from('customers')
        .insert({ 
          user_id: userId, 
          wallet_balance: 0,
          wallet_version: 1,
          auto_deduct: true,
        });
      if (insertErr) throw insertErr;
    }
  },

  /**
   * Get customer's wallet balance from the ledger
   * Uses the immutable wallet_ledger for accurate balance
   */
  async getWalletBalance(userId: string): Promise<number> {
    const { data, error } = await supabase
      .from('wallet_ledger')
      .select('credit, debit')
      .eq('user_id', userId);

    if (error) throw error;

    // Calculate balance from ledger entries
    return (data || []).reduce((balance, entry) => {
      return balance + (entry.credit || 0) - (entry.debit || 0);
    }, 0);
  },

  /**
   * Get customer's addresses
   */
  async getAddresses(userId: string) {
    const { data, error } = await supabase
      .from('addresses')
      .select(`
        id,
        society_id,
        tower_id,
        unit_id,
        street_address,
        area,
        city,
        pincode,
        landmark,
        delivery_instructions,
        is_default,
        is_verified,
        societies:society_id(name),
        towers:tower_id(name),
        units:unit_id(number, floor)
      `)
      .eq('user_id', userId)
      .order('is_default', { ascending: false });

    if (error) throw error;
    return data || [];
  },
};
