# iDaily Project — Interview Documentation (Part 4: Features & User Flows)

**Part 4 of 5**: Complete feature documentation with step-by-step flows

---

## Table of Contents - Part 4
1. [Customer User Journey](#customer-user-journey)
2. [Distributor User Journey](#distributor-user-journey)
3. [Admin User Journey](#admin-user-journey)
4. [Feature Deep Dives](#feature-deep-dives)
5. [Edge Cases & Error Handling](#edge-cases--error-handling)

---

## Customer User Journey

### 1. Registration & Onboarding

**Flow Steps**:
```
1. User opens app
2. Clicks "Sign Up"
3. Enters phone number (+919876543210)
4. Receives OTP via Supabase Auth
5. Enters OTP to verify
6. Completes profile:
   - Name
   - Email (optional)
   - Role auto-set to 'customer'
7. Add delivery address:
   - Search and select society
   - Select tower (if multi-tower society)
   - Enter unit number
   - Add delivery instructions
8. Account created → Redirect to Customer Home
```

**Database Operations**:
```sql
-- 1. User record created (via Supabase Auth + trigger)
INSERT INTO users (phone, name, email, role)
VALUES ('+919876543210', 'John Doe', 'john@example.com', 'customer');

-- 2. Customer record created automatically (trigger)
INSERT INTO customers (user_id, wallet_balance)
VALUES (user_id, 0);

-- 3. Address added
INSERT INTO addresses (
  customer_id, society_id, tower_id, unit_id,
  address_line, delivery_instructions, is_default
) VALUES (...);
```

**Technical Implementation**:
- **Screen**: `mobile/src/screens/auth/SignupScreen.tsx`
- **Validation**: React Hook Form + Zod schema
- **Phone Format**: E.164 format enforced (`+[country code][number]`)
- **OTP**: Supabase Auth handles SMS delivery
- **Address Picker**: Autocomplete with society search

### 2. Browse Products & Add to Cart

**Flow Steps**:
```
1. Customer lands on "Products" screen
2. Views product list (grouped by category)
   - Product name, brand, unit size
   - Price per unit
   - Current stock status
   - Product image
3. Taps product to view details
4. Selects quantity
5. Taps "Add to Cart" (or "Order Now")
6. Cart updated with line item
```

**Technical Details**:
- **Query**: 
  ```typescript
  const { data: products } = await supabase
    .from('products')
    .select('*, brands(*)')
    .eq('is_active', true)
    .gt('stock_quantity', 0)
    .order('category, name');
  ```
- **Local State**: Cart stored in Zustand store or AsyncStorage
- **Stock Check**: Real-time stock validation before checkout

### 3. Place One-Time Order

**Flow Steps**:
```
1. Customer reviews cart
2. Selects delivery date (today or future)
3. Selects delivery address
4. Reviews order summary:
   - Subtotal
   - Delivery charge
   - Discounts (if any)
   - Total amount
5. Chooses payment method:
   - Wallet (auto-deduct if enabled and sufficient balance)
   - Razorpay (card/UPI/netbanking)
6. Confirms order
7. If wallet: Order placed immediately
8. If Razorpay: 
   - Razorpay SDK opens
   - User completes payment
   - App verifies payment
   - Order confirmed
```

**Backend Flow**:
```sql
-- 1. Create order
INSERT INTO orders (
  customer_id, address_id, delivery_date,
  subtotal, delivery_charge, discount, total_amount,
  status, payment_status
) VALUES (...) RETURNING id;

-- 2. Create order items
INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
VALUES ...;

-- 3. If wallet payment:
SELECT debit_wallet(
  customer_id, total_amount, 'Order payment', order_id, 'order', order_id, idempotency_key
);

-- 4. Assign distributor (admin or auto-assignment logic)
UPDATE orders SET assigned_distributor_id = ... WHERE id = order_id;
```

**Error Handling**:
- Insufficient wallet balance → Show "Add Money" button
- Out of stock → Remove from cart, notify user
- Payment failure → Retry or cancel order
- Network error → Queue for retry with exponential backoff

### 4. Create Subscription

**Flow Steps**:
```
1. Customer selects product
2. Taps "Subscribe" instead of one-time order
3. Configures subscription:
   - Frequency: Daily / Alternate Days / Custom
   - Start date
   - End date (optional, for fixed-term subscriptions)
   - Quantity per delivery
   - Delivery address
4. Reviews subscription cost estimate
5. Confirms subscription
6. Subscription created with status='active'
7. System auto-generates orders based on schedule
```

**Subscription Types**:
- **Daily**: Every day
- **Alternate**: Every 2 days
- **Custom**: Selected days of week (Mon, Wed, Fri, etc.)

**Database Record**:
```sql
INSERT INTO subscriptions (
  customer_id, product_id, address_id,
  frequency, start_date, end_date, quantity,
  custom_days, status
) VALUES (
  customer_id, product_id, address_id,
  'custom', '2025-01-15', NULL, 2,
  '[1, 3, 5]'::JSONB,  -- Monday, Wednesday, Friday
  'active'
);
```

**Order Generation**:
```sql
-- Called by cron job or edge function
SELECT generate_subscription_orders(
  p_start := CURRENT_DATE,
  p_end := CURRENT_DATE + INTERVAL '7 days',
  p_user_id := NULL  -- Generate for all active subscriptions
);
```

**Function Logic** (Simplified):
```sql
CREATE FUNCTION generate_subscription_orders(
  p_start DATE, p_end DATE, p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_sub subscriptions;
  v_current_date DATE;
  v_order_exists BOOLEAN;
BEGIN
  FOR v_sub IN 
    SELECT * FROM subscriptions 
    WHERE status = 'active' 
    AND (p_user_id IS NULL OR customer_id = p_user_id)
  LOOP
    FOR v_current_date IN 
      SELECT generate_series(p_start, p_end, '1 day'::interval)::DATE
    LOOP
      -- Check if subscription should generate order for this date
      IF should_generate_order(v_sub, v_current_date) THEN
        -- Check idempotency: order already exists?
        SELECT EXISTS(
          SELECT 1 FROM orders 
          WHERE subscription_id = v_sub.id 
          AND delivery_date = v_current_date
        ) INTO v_order_exists;
        
        IF NOT v_order_exists THEN
          -- Create order
          INSERT INTO orders (
            customer_id, subscription_id, address_id,
            delivery_date, subtotal, total_amount, status
          ) VALUES (
            v_sub.customer_id, v_sub.id, v_sub.address_id,
            v_current_date, ..., ..., 'scheduled'
          );
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  
  RETURN jsonb_build_object('success', TRUE);
END;
$$ LANGUAGE plpgsql;
```

### 5. Manage Wallet

**Add Money Flow**:
```
1. Customer taps "Add Money" in wallet screen
2. Enters amount (₹100 - ₹10,000)
3. Taps "Add via Razorpay"
4. Razorpay SDK opens
5. Customer completes payment
6. App receives payment confirmation
7. Calls `razorpay_verify` function with signature
8. Function verifies HMAC signature
9. If valid: Credits wallet via `credit_wallet()` function
10. Wallet balance updated
11. Transaction history updated
```

**Razorpay Payment Verification**:
```typescript
// Client-side (after Razorpay success)
const { data, error } = await supabase.rpc('razorpay_verify', {
  p_payment_id: paymentId,
  p_order_id: razorpayOrderId,
  p_signature: signature,
  p_idempotency_key: `pay_${Date.now()}_${customerId}`,
});

if (data.success && data.verified) {
  // Wallet credited successfully
  showToast('Money added successfully');
  refreshWalletBalance();
}
```

**Server-side Verification** (Supabase Function):
```typescript
// supabase/functions/razorpay_verify/index.ts
import { createHmac } from 'crypto';

serve(async (req) => {
  const { payment_id, order_id, signature, idempotency_key } = await req.json();
  
  // Check idempotency
  const existing = await checkIdempotency(idempotency_key);
  if (existing) {
    return json({ already_processed: true });
  }
  
  // Verify HMAC signature
  const expectedSignature = createHmac('sha256', RAZORPAY_SECRET)
    .update(`${order_id}|${payment_id}`)
    .digest('hex');
  
  if (expectedSignature !== signature) {
    return json({ success: false, error: 'Invalid signature' }, { status: 400 });
  }
  
  // Credit wallet
  await supabase.rpc('credit_wallet', {
    p_customer_id: customerId,
    p_amount: amount,
    p_description: 'Payment received',
    p_reference_type: 'payment',
    p_reference_id: payment_id,
    p_idempotency_key: idempotency_key,
  });
  
  return json({ success: true, verified: true });
});
```

### 6. Track Orders

**Order Tracking States**:
```
scheduled   → Order auto-generated from subscription
pending     → Order confirmed, awaiting assignment
assigned    → Assigned to distributor
in_transit  → Distributor marked as out for delivery
delivered   → Delivered successfully
skipped     → Customer requested skip
missed      → Distributor couldn't deliver
cancelled   → Order cancelled
```

**Real-time Updates**:
```typescript
// Subscribe to order updates
const subscription = supabase
  .channel('customer-orders')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'orders',
      filter: `customer_id=eq.${customerId}`,
    },
    (payload) => {
      // Update local state with new order status
      updateOrderInState(payload.new);
      
      // Show notification
      if (payload.new.status === 'delivered') {
        showNotification('Order delivered!');
      }
    }
  )
  .subscribe();
```

---

## Distributor User Journey

### 1. View Today's Deliveries

**Flow**:
```
1. Distributor logs in
2. Lands on "Today's Deliveries" screen
3. Sees list of assigned orders for today:
   - Customer name, address
   - Product details, quantity
   - Order amount
   - Status (pending/in_transit/delivered)
4. Orders grouped by:
   - Society/Building (for route optimization)
   - Delivery slot (morning/evening)
```

**Query**:
```typescript
const { data: deliveries } = await supabase
  .from('orders')
  .select(`
    *,
    customers(user:users(*)),
    addresses(*, societies(*), towers(*), units(*)),
    order_items(*, products(*))
  `)
  .eq('assigned_distributor_id', distributorId)
  .eq('delivery_date', todayDate)
  .in('status', ['pending', 'assigned', 'in_transit'])
  .order('addresses(societies(name)), addresses(towers(name))');
```

**UI Features**:
- **Map View**: Show delivery locations on map (if lat/lng available)
- **Route Optimization**: Sort by proximity
- **Call Customer**: Direct call button
- **Navigation**: Google Maps/Apple Maps integration

### 2. Mark Order as Delivered

**Flow**:
```
1. Distributor reaches customer location
2. Hands over product
3. Taps "Mark as Delivered" button
4. (Optional) Upload delivery photo proof
5. Confirms delivery
6. App calls `mark_order_delivered()` function
7. Function:
   - Updates order status to 'delivered'
   - Sets delivered_at timestamp
   - Debits customer wallet (if auto_deduct enabled)
   - Credits distributor payout balance
   - Creates immutable ledger entries
8. Order moves to "Completed" section
```

**Idempotent Delivery Function**:
```sql
CREATE FUNCTION mark_order_delivered(
  p_order_id UUID,
  p_distributor_id UUID,
  p_idempotency_key TEXT
) RETURNS JSONB AS $$
DECLARE
  v_order orders;
  v_customer customers;
BEGIN
  -- Idempotency check
  PERFORM 1 FROM idempotency_keys WHERE key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('already_processed', TRUE);
  END IF;
  
  -- Lock order
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  
  IF v_order.status != 'in_transit' AND v_order.status != 'assigned' THEN
    RAISE EXCEPTION 'Order not in deliverable state';
  END IF;
  
  -- Get customer
  SELECT * INTO v_customer FROM customers WHERE id = v_order.customer_id FOR UPDATE;
  
  -- Debit customer wallet (if auto_deduct and sufficient balance)
  IF v_customer.auto_deduct AND v_customer.wallet_balance >= v_order.total_amount THEN
    PERFORM debit_wallet(
      v_customer.id, v_order.total_amount, 
      'Order ' || v_order.order_number, 
      v_order.id, 'order', v_order.id::TEXT,
      (p_idempotency_key || '_debit')::UUID
    );
  END IF;
  
  -- Update order
  UPDATE orders
  SET status = 'delivered',
      delivered_at = now(),
      updated_at = now()
  WHERE id = p_order_id;
  
  -- Increment distributor stats
  UPDATE distributors
  SET total_deliveries = total_deliveries + 1
  WHERE id = p_distributor_id;
  
  -- Record idempotency
  INSERT INTO idempotency_keys (key, operation_type, user_id, result)
  VALUES (p_idempotency_key, 'delivery', p_distributor_id, 
          jsonb_build_object('order_id', p_order_id, 'delivered_at', now()));
  
  RETURN jsonb_build_object('success', TRUE);
END;
$$ LANGUAGE plpgsql;
```

### 3. Handle Missed Delivery

**Flow**:
```
1. Distributor attempts delivery but customer unavailable
2. Taps "Mark as Missed"
3. Selects reason:
   - Customer not home
   - Address not found
   - Access denied
   - Other (free text)
4. (Optional) Upload photo proof
5. Confirms missed delivery
6. Order status → 'missed'
7. Admin gets notification
8. System may reschedule or contact customer
```

**Database Update**:
```sql
UPDATE orders
SET status = 'missed',
    skip_reason = reason,
    updated_at = now()
WHERE id = order_id;

-- Log in audit trail
INSERT INTO audit_log (entity_type, entity_id, action, actor_id, details)
VALUES ('order', order_id, 'marked_missed', distributor_id, jsonb_build_object('reason', reason));
```

### 4. View Earnings

**Earnings Dashboard**:
- **Today's Earnings**: Sum of delivered orders today
- **This Week**: Weekly earnings
- **This Month**: Monthly earnings
- **Pending Payout**: Amount awaiting disbursement
- **Payout History**: Past payments received

**Query**:
```typescript
const { data: earnings } = await supabase
  .from('orders')
  .select('total_amount, delivery_date, delivered_at')
  .eq('assigned_distributor_id', distributorId)
  .eq('status', 'delivered')
  .gte('delivery_date', startDate)
  .lte('delivery_date', endDate);

const totalEarnings = earnings.reduce((sum, o) => 
  sum + (Number(o.total_amount) * DISTRIBUTOR_COMMISSION_RATE), 0
);
```

---

## Admin User Journey

### 1. Dashboard Overview

**Metrics Displayed**:
- **Today's Orders**: Pending, Delivered, Skipped, Cancelled counts
- **Today's Revenue**: Sum of delivered orders
- **Monthly Revenue**: Current month total
- **Active Subscriptions**: Count by status
- **Total Customers**: Active customer count
- **Active Distributors**: Distributors currently active
- **Low Wallet Alerts**: Customers below minimum balance

**Data Fetching** (Parallel):
```typescript
const [
  ordersToday,
  subscriptions,
  customers,
  distributors,
  lowWalletCustomers,
] = await Promise.all([
  supabase.from('orders').select('*').eq('delivery_date', today),
  supabase.from('subscriptions').select('status'),
  supabase.from('customers').select('id', { count: 'exact' }),
  supabase.from('distributors').select('*').eq('is_active', true),
  supabase.from('customers').select('id', { count: 'exact' }).lt('wallet_balance', 200),
]);
```

**Real-time Updates**:
```typescript
useEffect(() => {
  const channel = supabase
    .channel('admin-dashboard')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, refreshDashboard)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions' }, refreshDashboard)
    .subscribe();
  
  return () => channel.unsubscribe();
}, []);
```

### 2. Manage Distributors

**Assign Distributor to Building**:
```
1. Admin navigates to "Distributor Management"
2. Selects a distributor
3. Taps "Assign Buildings"
4. Selects society/building(s)
5. Confirms assignment
6. Future orders for that building auto-assigned to distributor
```

**Database**:
```sql
INSERT INTO distributor_building_assignments (
  distributor_id, society_id, tower_id, assigned_by
) VALUES (distributor_id, society_id, tower_id, admin_id);
```

**Activate Distributor** (with activation code):
```sql
-- Generate activation code
INSERT INTO activation_codes (code, role, expires_at, created_by)
VALUES ('ABC12345', 'distributor', now() + INTERVAL '7 days', admin_id)
RETURNING code;

-- Distributor uses code during signup
UPDATE users
SET role = 'distributor',
    is_active = TRUE
WHERE id = user_id
AND EXISTS (
  SELECT 1 FROM activation_codes
  WHERE code = 'ABC12345'
  AND role = 'distributor'
  AND expires_at > now()
  AND used_at IS NULL
);
```

### 3. Create Manual Order

**Use Cases**:
- Phone order from customer
- Bulk order for events
- Test order for development
- Compensation/free product

**Flow**:
```
1. Admin taps "Create Order"
2. Searches and selects customer
3. Selects products and quantities
4. Sets delivery date
5. Assigns distributor (optional)
6. Adds discount/notes if needed
7. Confirms order
8. Order created with status='pending'
```

**Validation**:
- Customer must have valid address
- Products must be in stock
- Delivery date must be future or today

### 4. Analytics & Reports

**Available Reports**:
- **Revenue Analytics**: Daily/weekly/monthly revenue trends
- **Delivery Performance**: On-time delivery rate, missed deliveries
- **Product Analytics**: Top-selling products, category breakdown
- **Customer Growth**: New signups, churn rate, active customers
- **Distributor Performance**: Deliveries per distributor, ratings

**Sample Analytics Function** (Revenue):
```sql
CREATE FUNCTION analytics_revenue(
  p_start_date DATE,
  p_end_date DATE,
  p_group_by TEXT DEFAULT 'day'  -- day, week, month
) RETURNS TABLE(period TEXT, revenue NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE p_group_by
      WHEN 'day' THEN delivery_date::TEXT
      WHEN 'week' THEN date_trunc('week', delivery_date)::DATE::TEXT
      WHEN 'month' THEN to_char(delivery_date, 'YYYY-MM')
    END AS period,
    SUM(total_amount) AS revenue
  FROM orders
  WHERE delivery_date BETWEEN p_start_date AND p_end_date
    AND status = 'delivered'
  GROUP BY period
  ORDER BY period;
END;
$$ LANGUAGE plpgsql;
```

**Supabase Edge Function** (called from mobile):
```typescript
// supabase/functions/analytics-revenue/index.ts
serve(async (req) => {
  const { start_date, end_date, group_by } = await req.json();
  
  const { data, error } = await supabase.rpc('analytics_revenue', {
    p_start_date: start_date,
    p_end_date: end_date,
    p_group_by: group_by || 'day',
  });
  
  if (error) {
    return json({ error: error.message }, { status: 400 });
  }
  
  return json({ data });
});
```

---

## Feature Deep Dives

### Auto-Pause Subscriptions (Low Wallet Balance)

**Logic**:
```sql
CREATE FUNCTION auto_pause_low_balance_subscriptions() RETURNS void AS $$
BEGIN
  UPDATE subscriptions
  SET status = 'paused',
      pause_start_date = CURRENT_DATE,
      updated_at = now()
  WHERE status = 'active'
  AND customer_id IN (
    SELECT id FROM customers
    WHERE wallet_balance < min_balance_alert
    AND auto_deduct = TRUE
  );
END;
$$ LANGUAGE plpgsql;
```

**Scheduled Execution**: Cron job runs daily at midnight

**Customer Notification**:
- Email/SMS sent when subscription paused
- Prompt to add money to resume

### Photo Proof System

**Use Cases**:
- Distributor delivery proof
- Stock received/returned photos
- Product damage/quality issues
- Customer complaint evidence

**Implementation**:
```typescript
// Upload photo to Supabase Storage
const uploadProof = async (file: File, proofType: ProofType, referenceId: string) => {
  const fileName = `${proofType}_${referenceId}_${Date.now()}.jpg`;
  const filePath = `proofs/${proofType}/${fileName}`;
  
  const { data, error } = await supabase.storage
    .from('support-attachments')
    .upload(filePath, file);
  
  if (error) throw error;
  
  // Create record
  await supabase.from('photo_proofs').insert({
    proof_type: proofType,
    reference_type: 'order',
    reference_id: referenceId,
    file_path: filePath,
    uploaded_by: userId,
  });
  
  return data.path;
};
```

**Bucket Policies** (RLS):
```sql
-- Distributors can upload delivery proofs
CREATE POLICY "Distributors upload proofs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'support-attachments'
  AND auth.uid() IN (SELECT user_id FROM distributors)
);

-- Admins can view all proofs
CREATE POLICY "Admins view proofs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND auth.uid() IN (SELECT user_id FROM users WHERE role IN ('admin', 'superadmin'))
);
```

### Support Ticket System

**Ticket Creation**:
```typescript
const createTicket = async (data: CreateTicketInput) => {
  const { data: ticket, error } = await supabase
    .from('support_tickets')
    .insert({
      customer_id: customerId,
      category: data.category,  // delivery_issue, product_quality, etc.
      priority: data.priority,  // low, medium, high, urgent
      subject: data.subject,
      description: data.description,
      status: 'open',
    })
    .select()
    .single();
  
  if (error) throw error;
  
  // Upload attachments if any
  if (data.attachments) {
    for (const file of data.attachments) {
      await uploadTicketAttachment(ticket.id, file);
    }
  }
  
  return ticket;
};
```

**Ticket Auto-Assignment**:
```sql
-- Trigger assigns tickets to admins based on category/workload
CREATE FUNCTION assign_ticket_to_admin() RETURNS TRIGGER AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  -- Find admin with least open tickets
  SELECT id INTO v_admin_id
  FROM users
  WHERE role = 'admin'
  ORDER BY (
    SELECT COUNT(*) FROM support_tickets
    WHERE assigned_to = users.id
    AND status NOT IN ('resolved', 'closed')
  ) ASC
  LIMIT 1;
  
  NEW.assigned_to := v_admin_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_assign_ticket
  BEFORE INSERT ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION assign_ticket_to_admin();
```

---

## Edge Cases & Error Handling

### Race Conditions

**Problem**: Two distributors marking same order as delivered simultaneously

**Solution**: Row-level locking
```sql
SELECT * FROM orders WHERE id = order_id FOR UPDATE;  -- Locks row
-- Perform status check and update
UPDATE orders SET status = 'delivered' WHERE id = order_id;
COMMIT;  -- Releases lock
```

### Idempotency Failures

**Problem**: Network retry causes duplicate wallet credit

**Solution**: Idempotency keys with expiration
```sql
CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  result JSONB,
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours')
);

-- Check before operation
IF EXISTS(SELECT 1 FROM idempotency_keys WHERE key = p_key) THEN
  RETURN (SELECT result FROM idempotency_keys WHERE key = p_key);
END IF;

-- Perform operation
-- ...

-- Store result
INSERT INTO idempotency_keys (key, result) VALUES (p_key, result_json);
```

### Offline Handling

**Mobile Strategy**:
```typescript
// Queue failed requests
const queueManager = {
  async addToQueue(request: QueuedRequest) {
    const queue = await AsyncStorage.getItem('@request_queue');
    const requests = queue ? JSON.parse(queue) : [];
    requests.push(request);
    await AsyncStorage.setItem('@request_queue', JSON.stringify(requests));
  },
  
  async processQueue() {
    const queue = await AsyncStorage.getItem('@request_queue');
    if (!queue) return;
    
    const requests: QueuedRequest[] = JSON.parse(queue);
    const failed: QueuedRequest[] = [];
    
    for (const req of requests) {
      try {
        await retryRequest(req);
      } catch (error) {
        failed.push(req);
      }
    }
    
    await AsyncStorage.setItem('@request_queue', JSON.stringify(failed));
  },
};

// Retry on app foreground or network reconnect
NetInfo.addEventListener(state => {
  if (state.isConnected) {
    queueManager.processQueue();
  }
});
```

### Data Validation Errors

**Example**: Customer tries to order more than stock available

**Handling**:
```typescript
try {
  await OrderService.createOrder(orderData);
} catch (error) {
  if (error.message.includes('Insufficient stock')) {
    showToast('Product out of stock. Please reduce quantity.', 'error');
    // Remove item from cart or reduce quantity
  } else if (error.message.includes('Insufficient balance')) {
    showToast('Insufficient wallet balance', 'error');
    // Show "Add Money" button
  } else {
    showToast('Failed to create order. Please try again.', 'error');
    // Log error for debugging
    console.error('[CreateOrder Error]', error);
  }
}
```

---

**End of Part 4**

**Next**: Part 5 - Interview Talking Points & Demo Script
