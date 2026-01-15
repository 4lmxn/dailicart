import { supabase } from '../supabase';
import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Gated Society Address Structure
 * 
 * For gated communities, the hierarchy is:
 * Society → Tower/Block → Unit (Floor + Flat Number)
 * 
 * Example: "Prestige Lakeside Habitat" → "Tower A" → "Unit A-402" (Floor 4)
 */

export interface Society { 
  id: string; 
  name: string; 
  developer?: string; // e.g., Prestige, Sattva, Brigade
  area?: string; // locality/neighborhood
  pincode?: string; 
}

export interface SocietyTower { 
  id: string; 
  name: string; // e.g., "A", "Magnolia", "Block 1"
  society_id: string; 
  floors?: number;
}

export interface TowerUnit { 
  id: string; 
  number: string; // e.g., "A-402", "1204"
  tower_id: string; 
  floor?: number; // e.g., 4, 12
}

// Get all active societies
export async function getSocieties() {
  return supabase
    .from('societies')
    .select('id,name,developer,area,pincode')
    .eq('is_active', true)
    .order('name');
}

// Get towers/blocks in a society
export async function getTowersBySociety(societyId: string) {
  return supabase
    .from('society_towers')
    .select('id,name,society_id,floors')
    .eq('society_id', societyId)
    .eq('is_active', true)
    .order('name');
}

// Get units in a tower
export async function getUnitsByTower(towerId: string) {
  return supabase
    .from('tower_units')
    .select('id,number,tower_id,floor')
    .eq('tower_id', towerId)
    .eq('is_active', true)
    .order('number');
}

// Save customer address (gated society)
// Uses user_id as the primary identifier
export async function saveCustomerAddress(params: {
  user_id: string;
  society_id: string;
  tower_id: string;
  unit_id: string;
  landmark?: string;
  delivery_instructions?: string;
  is_default?: boolean;
}) {
  const { data, error } = await supabase.from('addresses').insert({
    user_id: params.user_id,
    society_id: params.society_id,
    tower_id: params.tower_id,
    unit_id: params.unit_id,
    landmark: params.landmark ?? null,
    delivery_instructions: params.delivery_instructions ?? null,
    is_default: params.is_default ?? true,
  }).select('id').single();
  return { data, error } as { data: { id: string } | null, error: PostgrestError | null };
}
