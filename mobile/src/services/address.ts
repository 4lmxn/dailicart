import { supabase } from '../services/supabase';

export type AddressInput = {
  user_id: string;
  society_id?: string | null;
  tower_id?: string | null;
  unit_id?: string | null;
  society_name?: string | null;
  apartment_number?: string | null;
  street_address?: string | null;
  area?: string | null;
  city?: string | null;
  pincode?: string | null;
  landmark?: string | null;
  delivery_instructions?: string | null;
  is_default?: boolean;
};

export async function createAddress(input: AddressInput) {
  const userId = input.user_id;
  
  // Validate that unit is not already assigned to another customer
  if (input.unit_id) {
    const { data: existingAddress, error: checkError } = await supabase
      .from('addresses')
      .select('id, user_id')
      .eq('unit_id', input.unit_id)
      .not('user_id', 'eq', userId)
      .limit(1)
      .single();

    if (checkError && checkError.code !== 'PGRST116') throw checkError;
    
    if (existingAddress) {
      throw new Error(`This unit is already assigned to another customer. Please select a different unit or contact support.`);
    }
  }

  const { data, error } = await supabase
    .from('addresses')
    .insert({
      user_id: userId,
      society_id: input.society_id ?? null,
      tower_id: input.tower_id ?? null,
      unit_id: input.unit_id ?? null,
      society_name: input.society_name ?? null,
      apartment_number: input.apartment_number ?? null,
      street_address: input.street_address ?? null,
      area: input.area ?? null,
      city: input.city ?? null,
      pincode: input.pincode ?? null,
      landmark: input.landmark ?? null,
      delivery_instructions: input.delivery_instructions ?? null,
      is_default: input.is_default ?? true,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateAddress(addressId: string, patch: Partial<AddressInput>) {
  // Validate that unit is not already assigned to another customer (if changing unit_id)
  if (patch.unit_id) {
    // Get current address to know the user_id
    const { data: currentAddr, error: getCurrentError } = await supabase
      .from('addresses')
      .select('user_id')
      .eq('id', addressId)
      .single();

    if (getCurrentError) throw getCurrentError;

    // Check if unit is already taken by someone else
    const { data: existingAddress, error: checkError } = await supabase
      .from('addresses')
      .select('id, user_id')
      .eq('unit_id', patch.unit_id)
      .neq('user_id', currentAddr.user_id)
      .limit(1)
      .single();

    if (checkError && checkError.code !== 'PGRST116') throw checkError;
    
    if (existingAddress) {
      throw new Error(`This unit is already assigned to another customer. Please select a different unit or contact support.`);
    }
  }

  const { data, error } = await supabase
    .from('addresses')
    .update({
      society_id: patch.society_id ?? null,
      tower_id: patch.tower_id ?? null,
      unit_id: patch.unit_id ?? null,
      society_name: patch.society_name ?? null,
      apartment_number: patch.apartment_number ?? null,
      street_address: patch.street_address ?? null,
      area: patch.area ?? null,
      city: patch.city ?? null,
      pincode: patch.pincode ?? null,
      landmark: patch.landmark ?? null,
      delivery_instructions: patch.delivery_instructions ?? null,
      is_default: patch.is_default ?? undefined,
    })
    .eq('id', addressId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function listSocieties(query?: string) {
  let req = supabase.from('societies').select('id,name,slug,area,pincode').limit(50);
  if (query) req = req.ilike('name', `%${query}%`);
  const { data, error } = await req;
  if (error) throw error;
  return data;
}

export async function listTowers(societyId: string) {
  const { data, error } = await supabase
    .from('society_towers')
    .select('id,name,floors')
    .eq('society_id', societyId);
  if (error) throw error;
  return data;
}

export async function listUnits(towerId: string) {
  // CLEAN_SCHEMA uses tower_units.number; fallback to unit_number if present
  const { data, error } = await supabase
    .from('tower_units')
    .select('id,number')
    .eq('tower_id', towerId);
  if (error) throw error;
  return data;
}

export async function getDefaultAddress(userId: string) {
  // Query using user_id
  const { data, error } = await supabase
    .from('addresses')
    .select('id, user_id, society_id, tower_id, unit_id, society_name, apartment_number, street_address, area, city, pincode, landmark, delivery_instructions, is_default')
    .eq('user_id', userId)
    .eq('is_default', true)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('getDefaultAddress error:', error);
    return null;
  }
  return data ?? null;
}
