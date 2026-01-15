# Payment Backend API Specification

This document describes the required backend endpoints for secure Razorpay payment processing.

## Overview

The mobile app delegates all sensitive payment operations to the backend to ensure security. The backend must:
- Create Razorpay orders using the secret key
- Verify payment signatures using HMAC SHA256
- Update wallet balances atomically with transaction recording
- Handle idempotency to prevent duplicate operations

---

## Endpoints

### 1. Create Razorpay Order

**Endpoint:** `POST /api/payments/order`

**Purpose:** Create a Razorpay order on the server before opening checkout.

**Headers:**
```
Content-Type: application/json
X-Idempotency-Key: <unique-key>
Authorization: Bearer <user-token> (optional)
```

**Request Body:**
```json
{
  "amount": 200000,
  "currency": "INR",
  "description": "Wallet Recharge",
  "userId": "user-uuid-here"
}
```

**Response (200 OK):**
```json
{
  "id": "order_MfK8vZp9qJ7K3P",
  "orderId": "order_MfK8vZp9qJ7K3P",
  "amount": 200000,
  "currency": "INR",
  "status": "created"
}
```

**Implementation Notes:**
- Use Razorpay Orders API: `POST https://api.razorpay.com/v1/orders`
- Basic auth with `RAZORPAY_KEY_ID:RAZORPAY_KEY_SECRET` (base64 encoded)
- Store order in database with `userId`, `amount`, `status: 'created'`, `idempotencyKey`
- If `X-Idempotency-Key` matches existing order, return that order (prevent duplicate creation)
- Generate receipt ID: `receipt_${userId}_${timestamp}`

**Example Razorpay Request:**
```bash
curl -X POST https://api.razorpay.com/v1/orders \
  -u rzp_test_xxx:secret_key_xxx \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 200000,
    "currency": "INR",
    "receipt": "receipt_user123_1701234567"
  }'
```

---

### 2. Verify Payment Signature

**Endpoint:** `POST /api/payments/verify`

**Purpose:** Verify Razorpay payment signature using HMAC SHA256 (CRITICAL security check).

**Headers:**
```
Content-Type: application/json
X-Idempotency-Key: <unique-key>
Authorization: Bearer <user-token>
```

**Request Body:**
```json
{
  "paymentId": "pay_MfK8vZp9qJ7K3P",
  "orderId": "order_MfK8vZp9qJ7K3P",
  "signature": "a1b2c3d4e5f6g7h8i9j0...",
  "userId": "user-uuid-here"
}
```

**Response (200 OK):**
```json
{
  "verified": true,
  "message": "Payment signature verified successfully"
}
```

**Response (400 Bad Request):**
```json
{
  "verified": false,
  "message": "Invalid signature"
}
```

**Implementation Notes:**
- Construct message: `orderId + "|" + paymentId`
- Generate expected signature: `HMAC_SHA256(message, RAZORPAY_KEY_SECRET)`
- Compare with provided signature (use constant-time comparison)
- Update order status to `verified` in database
- Store payment details: `paymentId`, `signature`, `verifiedAt`
- If idempotency key exists and status is already `verified`, return success without re-verifying

**Example Verification (Node.js):**
```javascript
const crypto = require('crypto');

function verifySignature(orderId, paymentId, signature, secret) {
  const text = `${orderId}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(text)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signature)
  );
}
```

---

### 3. Credit Wallet

**Endpoint:** `POST /api/wallet/credit`

**Purpose:** Atomically credit user wallet and record transaction after verified payment.

**Headers:**
```
Content-Type: application/json
X-Idempotency-Key: <unique-key>
Authorization: Bearer <user-token>
```

**Request Body:**
```json
{
  "userId": "user-uuid-here",
  "amount": 2000,
  "paymentId": "pay_MfK8vZp9qJ7K3P",
  "orderId": "order_MfK8vZp9qJ7K3P",
  "method": "razorpay"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "newBalance": 3500,
  "transactionId": "txn_abc123def456"
}
```

**Response (409 Conflict - already processed):**
```json
{
  "success": true,
  "newBalance": 3500,
  "transactionId": "txn_abc123def456",
  "message": "Transaction already processed (idempotent)"
}
```

**Implementation Notes:**
- Use database transaction (BEGIN/COMMIT/ROLLBACK)
- Check if `idempotencyKey` already exists in `wallet_transactions` table
  - If exists with status `completed`, return existing transaction (idempotent response)
  - If exists with status `pending`, continue processing
  - If not exists, create new transaction with status `pending`
- Verify payment was verified (check orders table)
- Update `customers.wallet_balance` atomically: `wallet_balance = wallet_balance + amount`
- Insert `wallet_transactions` record with status `completed`
- Return new balance and transaction ID
- On any error, rollback transaction

**Example SQL (Postgres):**
```sql
BEGIN;

-- Check idempotency
SELECT id, status FROM wallet_transactions 
WHERE metadata->>'idempotencyKey' = $idempotencyKey 
FOR UPDATE;

-- If exists with status='completed', return it
-- If exists with status='pending', proceed
-- Otherwise insert pending transaction

-- Verify payment
SELECT status FROM orders 
WHERE id = $orderId AND status = 'verified';

-- Update wallet
UPDATE customers 
SET wallet_balance = wallet_balance + $amount 
WHERE user_id = $userId 
RETURNING wallet_balance;

-- Mark transaction completed
UPDATE wallet_transactions 
SET status = 'completed', completed_at = NOW() 
WHERE id = $transactionId;

COMMIT;
```

---

### 4. Get Payment Status (Optional)

**Endpoint:** `GET /api/payments/status/:paymentId`

**Purpose:** Fetch payment details from Razorpay for reconciliation.

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response (200 OK):**
```json
{
  "id": "pay_MfK8vZp9qJ7K3P",
  "orderId": "order_MfK8vZp9qJ7K3P",
  "amount": 200000,
  "currency": "INR",
  "status": "captured",
  "method": "upi",
  "email": "user@example.com",
  "contact": "+919876543210",
  "createdAt": "2025-11-30T10:30:00Z"
}
```

**Implementation Notes:**
- Call Razorpay Payments API: `GET https://api.razorpay.com/v1/payments/:paymentId`
- Return normalized payment details
- Only accessible by admin users

---

## Security Considerations

1. **Never expose `RAZORPAY_KEY_SECRET` to mobile app**
   - Store only on backend server
   - Use environment variables
   - Rotate keys periodically

2. **Use HTTPS only**
   - All endpoints must use TLS 1.2+
   - Validate SSL certificates

3. **Implement rate limiting**
   - Max 10 requests per minute per user for order creation
   - Max 20 requests per minute for verification

4. **Validate user authorization**
   - Verify JWT token on all requests
   - Ensure `userId` in request matches authenticated user
   - Admin endpoints require admin role

5. **Idempotency is critical**
   - Always check `X-Idempotency-Key` header
   - Store keys with expiration (24 hours)
   - Return same response for duplicate keys

6. **Audit logging**
   - Log all payment operations with timestamps
   - Store IP addresses and user agents
   - Alert on suspicious patterns

---

## Database Schema Additions

### orders table (if not exists)
```sql
CREATE TABLE orders (
  id TEXT PRIMARY KEY,  -- Razorpay order_id
  user_id UUID NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'INR',
  receipt TEXT,
  status TEXT DEFAULT 'created',  -- created, verified, failed
  payment_id TEXT,
  signature TEXT,
  verified_at TIMESTAMPTZ,
  metadata JSONB,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_idempotency_key ON orders(idempotency_key);
```

### wallet_transactions enhancements
```sql
ALTER TABLE wallet_transactions 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed',
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_idempotency 
ON wallet_transactions(metadata->>'idempotencyKey');
```

---

## Testing

### Test Mode Setup
1. Use Razorpay test keys: `rzp_test_xxx`
2. Use test payment methods:
   - UPI: `success@razorpay`
   - Card: `4111 1111 1111 1111`, CVV: `123`, Expiry: any future date
3. All test payments auto-succeed

### Integration Tests
```bash
# 1. Create order
curl -X POST http://localhost:3000/api/payments/order \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: test-$(date +%s)" \
  -d '{"amount": 100000, "currency": "INR", "userId": "test-user"}'

# 2. Verify payment (after Razorpay success)
curl -X POST http://localhost:3000/api/payments/verify \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: test-$(date +%s)" \
  -d '{
    "paymentId": "pay_xxx",
    "orderId": "order_xxx",
    "signature": "xxx",
    "userId": "test-user"
  }'

# 3. Credit wallet
curl -X POST http://localhost:3000/api/wallet/credit \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: test-$(date +%s)" \
  -d '{
    "userId": "test-user",
    "amount": 1000,
    "paymentId": "pay_xxx",
    "orderId": "order_xxx",
    "method": "razorpay"
  }'
```

---

## Webhook Setup (Optional but Recommended)

**Endpoint:** `POST /api/webhooks/razorpay`

**Purpose:** Receive real-time payment status updates from Razorpay.

**Setup:**
1. Add webhook URL in Razorpay dashboard
2. Select events: `payment.captured`, `payment.failed`
3. Copy webhook secret

**Implementation:**
```javascript
const crypto = require('crypto');

function verifyWebhook(body, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(body))
    .digest('hex');
  
  return signature === expectedSignature;
}

app.post('/api/webhooks/razorpay', (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  
  if (!verifyWebhook(req.body, signature, WEBHOOK_SECRET)) {
    return res.status(400).send('Invalid signature');
  }
  
  const { event, payload } = req.body;
  
  if (event === 'payment.captured') {
    // Update order status, credit wallet if not already done
  }
  
  res.json({ status: 'ok' });
});
```

---

## Production Checklist

- [ ] Environment variables configured (keys, secrets)
- [ ] HTTPS enabled with valid certificate
- [ ] Rate limiting implemented
- [ ] Idempotency checks in place
- [ ] Database transactions for atomic operations
- [ ] Audit logging enabled
- [ ] Error monitoring (Sentry/similar)
- [ ] Webhook endpoint secured
- [ ] Test payments validated
- [ ] Production keys configured in Razorpay dashboard
- [ ] Backup and recovery procedures documented

---

## Support

For Razorpay API documentation: https://razorpay.com/docs/api/

For integration support: support@razorpay.com

## Related Analytics Endpoints

See `ANALYTICS_API.md` for revenue & performance endpoints consumed by the mobile dashboard. These can complement payment data for richer insights (e.g., reconciling delivered revenue vs. captured payments).
