#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Missing Supabase credentials. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}
const supabase = createClient(url, key);

async function main() {
  const distributors = [
    { name: 'Ravi Kumar', phone: '+919876543210', vehicle_number: 'KA-01-AB-1234' },
    { name: 'Sneha Patel', phone: '+919123456789', vehicle_number: 'KA-02-XY-5678' },
    { name: 'Imran Khan', phone: '+918765432109', vehicle_number: 'KA-03-ZZ-9012' },
  ];

  let created = 0;
  for (const d of distributors) {
    // Create user row
    const { data: userRows, error: userErr } = await supabase
      .from('users')
      .insert({ name: d.name, phone: d.phone, role: 'distributor' })
      .select('id')
      .limit(1);
    if (userErr) { console.error('User insert error:', userErr.message); continue; }
    const userId = userRows?.[0]?.id;
    if (!userId) { console.error('No user id returned'); continue; }

    // Create distributor profile
    const { error: distErr } = await supabase
      .from('distributors')
      .insert({ user_id: userId, is_active: true, vehicle_number: d.vehicle_number });
    if (distErr) { console.error('Distributor insert error:', distErr.message); continue; }
    created++;
  }

  console.log(`Inserted ${created} distributors`);
}

main().catch((e) => { console.error(e); process.exit(1); });
