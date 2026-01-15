#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!url || !key) { console.error('Missing Supabase credentials'); process.exit(1); }
const supabase = createClient(url, key);

async function findOrInsert(table, match, values) {
  const { data: existing, error: selErr } = await supabase.from(table).select('*').match(match).limit(1);
  if (selErr) throw selErr;
  if (existing && existing[0]) return existing[0];
  const { data: inserted, error: insErr } = await supabase.from(table).insert(values).select('*').limit(1);
  if (insErr) throw insErr;
  return inserted?.[0];
}

async function main() {
  // 1) Create Prestige society and a building within Koramangala
  const society = await findOrInsert('societies', { name: 'Prestige Lakeside Habitat', area: 'Whitefield' }, {
    name: 'Prestige Lakeside Habitat',
    developer: 'Prestige',
    area: 'Whitefield',
    slug: 'prestige-lakeside-habitat-whitefield',
    is_active: true,
  });

  // 2) Skip towers/units creation due to live DB permission/column differences; use synthetic flat numbers
  const towers = [];
  const units = [];

  // 4) Create a building record for the society (optional mapping)
  const buildingSlug = 'prestige-lakeside-habitat-' + Date.now();
  const building = await findOrInsert('buildings', { name: 'Prestige Lakeside Habitat' }, { name: 'Prestige Lakeside Habitat', slug: buildingSlug, is_active: true });

  // 5) Map existing customers to synthetic flats (create addresses)
  const { data: customers, error: custErr } = await supabase.from('customers').select('id, user_id').limit(20);
  if (custErr) throw custErr;
  const addrIds = [];
  for (const c of customers) {
    const flatNum = `A-${(100 + Math.floor(Math.random()*50)).toString()}`;
    const { data: addr, error: addrErr } = await supabase
      .from('addresses')
      .insert({
        customer_id: c.id,
        building_id: building.id,
        society_id: society.id,
        society_name: 'Prestige Lakeside Habitat',
        apartment_number: flatNum,
        street_address: 'Near Varthur, Whitefield',
        pincode: '560066',
        is_default: true,
      })
      .select('id')
      .limit(1);
    if (addrErr) throw addrErr;
    addrIds.push(addr?.[0]?.id);
  }

  // 6) Assign distributors to the building
  const { data: dists } = await supabase.from('distributors').select('id').limit(3);
  if (dists && dists.length) {
    for (const d of dists) {
      await supabase.from('building_distributor_assignments').upsert({ building_id: building.id, distributor_id: d.id, is_active: true }, { onConflict: 'building_id,distributor_id' });
    }
  }

  // 7) Create subscriptions for mapped customers
  const { data: products } = await supabase.from('products').select('id').limit(3);
  const frequencies = ['daily','alternate'];
  let subCount = 0;
  for (let i = 0; i < customers.length; i++) {
    const c = customers[i];
    const addrId = addrIds[i];
    if (!addrId) continue;
    const product = products?.[i % (products?.length || 1)];
    if (!product) break;
    const { error: subErr } = await supabase.from('subscriptions').insert({
      customer_id: c.id,
      address_id: addrId,
      product_id: product.id,
      quantity: 1,
      frequency: frequencies[i % frequencies.length],
      start_date: new Date().toISOString().slice(0,10),
      status: 'active',
    });
    if (!subErr) subCount++;
  }

  console.log(`Seeded society='${society.name}', towers=${towers.length}, units=${units.length}, addresses=${addrIds.length}, subscriptions=${subCount}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
