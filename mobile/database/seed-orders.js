/**
 * Orders Mini-Seed Script
 *
 * Prerequisites:
 * - Set env vars: EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * - Run auth seed first to have users/customers/distributors/products
 *
 * Run: node database/seed-orders.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function fmtDate(d) {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
}

async function seedOrders() {
  console.log('🌱 Seeding sample orders...');

  // Get first few customers (ids from customers table)
  const { data: customers, error: custErr } = await supabase
    .from('customers')
    .select('id, user_id')
    .limit(5);
  if (custErr) throw custErr;
  if (!customers || customers.length === 0) {
    console.log('⚠️ No customers found. Run auth seed first.');
    return;
  }

  // Get one distributor (id from distributors table)
  const { data: distributors, error: distErr } = await supabase
    .from('distributors')
    .select('id')
    .limit(1);
  if (distErr) throw distErr;
  const distributorId = distributors?.[0]?.id || null;

  // Get a few products with prices
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, price')
    .eq('is_active', true)
    .limit(5);
  if (prodErr) throw prodErr;
  if (!products || products.length === 0) {
    console.log('⚠️ No products found. Create some products first.');
    return;
  }

  const today = new Date();
  const days = [0, 1, 2, 3, 4]; // today and past 4 days

  let created = 0;
  for (const c of customers) {
    for (const dOff of days) {
      const dt = new Date(today);
      dt.setDate(today.getDate() - dOff);
      const delivery_date = fmtDate(dt);

      // Build 1-2 items
      const itemsCount = Math.min(2, Math.max(1, Math.floor(Math.random() * 3)));
      const chosen = products.slice(0, itemsCount);
      const quantities = chosen.map(() => Math.max(1, Math.floor(Math.random() * 3)));
      const prices = chosen.map(p => Number(p.price) || 0);
      const total = quantities.reduce((sum, q, idx) => sum + q * prices[idx], 0);

      const status = dOff === 0 ? 'delivered' : (Math.random() < 0.8 ? 'delivered' : 'pending');
      const payment_status = status === 'delivered' ? 'paid' : 'pending';

      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          order_number: null, // trigger will generate
          customer_id: c.id,
          address_id: null,
          subscription_id: null,
          delivery_date,
          assigned_distributor_id: distributorId,
          status,
          total_amount: total,
          payment_status,
          payment_method: 'wallet',
          delivered_at: status === 'delivered' ? new Date().toISOString() : null,
        })
        .select()
        .single();
      if (orderErr) throw orderErr;

      for (let i = 0; i < chosen.length; i++) {
        const p = chosen[i];
        const qty = quantities[i];
        const price = prices[i];
        const line = qty * price;
        const { error: itemErr } = await supabase
          .from('order_items')
          .insert({
            order_id: order.id,
            product_id: p.id,
            quantity: qty,
            unit_price: price,
            total_price: line,
          });
        if (itemErr) throw itemErr;
      }
      created++;
    }
  }

  console.log(`✅ Created ${created} orders across ${customers.length} customers.`);
}

seedOrders().catch((e) => {
  console.error('❌ Seed failed:', e);
  process.exit(1);
});
