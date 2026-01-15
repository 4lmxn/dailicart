/**
 * Daily Order Generation Script (Capacity-Aware)
 * Calls generate_orders_for_date_with_capacity for tomorrow's date.
 * Optionally pass a date (YYYY-MM-DD) as first arg.
 *
 * Usage:
 *  $env:EXPO_PUBLIC_SUPABASE_URL="..."; $env:SUPABASE_SERVICE_ROLE_KEY="..."; npm run schedule:generate
 *  Or with date:
 *  node .\database\seed-schedule.js 2025-11-28
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('❌ Missing env: EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function run() {
  const argDate = process.argv[2];
  let targetDate;
  if (argDate) {
    targetDate = new Date(argDate);
    if (isNaN(targetDate.getTime())) {
      console.error('❌ Invalid date argument. Use YYYY-MM-DD');
      process.exit(1);
    }
  } else {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    targetDate = tomorrow;
  }
  const isoDate = targetDate.toISOString().slice(0, 10);
  console.log(`🚚 Generating orders for ${isoDate} (capacity-aware)...`);

  const { data, error } = await supabase.rpc('generate_orders_for_date_with_capacity', { target_date: isoDate });
  if (error) {
    console.error('❌ Generation failed:', error.message);
    process.exit(1);
  }
  console.log('✅ Generation result:', data);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
