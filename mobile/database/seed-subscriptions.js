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

async function pickSome(table, columns, limit = 10, where = null) {
  const { data, error } = await supabase.from(table).select(columns).limit(limit);
  if (error) throw error;
  return data || [];
}

async function main() {
  // Fetch some customers and products
  const customers = await pickSome('customers', 'id, user_id');
  const products = await pickSome('products', 'id, name, unit');
  // Use existing addresses only to respect stricter DB constraints
  const addressesByCustomer = {};
  for (const c of customers) {
    const { data: addrs, error: addrErr } = await supabase
      .from('addresses')
      .select('id')
      .eq('customer_id', c.id)
      .limit(1);
    if (addrErr) throw addrErr;
    const addrId = addrs?.[0]?.id;
    if (addrId) addressesByCustomer[c.id] = addrId;
  }

  // Optionally assign a distributor to subscriptions
  const distributors = await pickSome('distributors', 'id');
  if (!customers.length || !products.length) {
    console.error('Need existing customers and products. Seed those first.');
    process.exit(1);
  }

  const frequencies = ['daily', 'alternate', 'weekly'];
  const qtys = [1, 2, 3];
  const status = ['active', 'paused'];

  const items = [];
  for (let i = 0; i < Math.min(12, customers.length); i++) {
    const c = customers[i % customers.length];
    const p = products[i % products.length];
    const addrId = addressesByCustomer[c.id];
    if (!addrId) continue; // skip customers without addresses
    items.push({
      customer_id: c.id,
      address_id: addrId,
      product_id: p.id,
      quantity: qtys[i % qtys.length],
      frequency: frequencies[i % frequencies.length],
      status: status[i % status.length],
      start_date: new Date().toISOString().slice(0, 10),
      assigned_distributor_id: distributors.length ? distributors[i % distributors.length].id : null,
    });
  }

  const { data, error } = await supabase.from('subscriptions').insert(items).select('id');
  if (error) {
    console.error('Subscriptions insert error:', error.message);
    process.exit(1);
  }
  console.log(`Inserted ${data?.length || 0} subscriptions`);
}

main().catch((e) => { console.error(e); process.exit(1); });
