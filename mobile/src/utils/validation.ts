/**
 * Zod Validation Schemas
 * Centralized input validation for security and data integrity
 * Prevents injection attacks and ensures data format compliance
 */

import { z } from 'zod';

// =============================================================================
// COMMON VALIDATORS
// =============================================================================

/** UUID v4 format */
export const uuidSchema = z.string().uuid('Invalid ID format');

/** Indian phone number (10 digits) */
export const phoneSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, 'Must be a valid 10-digit Indian phone number');

/** Phone with country code */
export const phoneWithCodeSchema = z
  .string()
  .regex(/^\+91[6-9]\d{9}$/, 'Must be a valid Indian phone number with +91');

/** Email address */
export const emailSchema = z.string().email('Invalid email address');

/** Positive amount (for money) */
export const amountSchema = z
  .number()
  .positive('Amount must be positive')
  .max(1000000, 'Amount exceeds maximum limit');

/** Date string (YYYY-MM-DD) */
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

/** Safe text (no script injection) */
export const safeTextSchema = z
  .string()
  .max(500)
  .refine(
    (val) => !/<script|javascript:|on\w+=/i.test(val),
    'Invalid characters detected'
  );

/** Name field */
export const nameSchema = z
  .string()
  .min(2, 'Name too short')
  .max(100, 'Name too long')
  .regex(/^[a-zA-Z\s\-'.]+$/, 'Name contains invalid characters');

// =============================================================================
// AUTH SCHEMAS
// =============================================================================

export const sendOtpSchema = z.object({
  phone: phoneSchema,
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  otp: z
    .string()
    .length(6, 'OTP must be 6 digits')
    .regex(/^\d{6}$/, 'OTP must contain only numbers'),
});

// =============================================================================
// WALLET SCHEMAS
// =============================================================================

export const walletTopupSchema = z.object({
  amount: amountSchema.min(10, 'Minimum top-up is ₹10').max(50000, 'Maximum top-up is ₹50,000'),
  idempotencyKey: z.string().min(10, 'Invalid idempotency key').optional(),
});

export const walletDebitSchema = z.object({
  userId: uuidSchema,
  amount: amountSchema,
  referenceType: z.enum(['order_payment', 'subscription_payment', 'manual_deduction', 'refund']),
  referenceId: uuidSchema.optional(),
  description: safeTextSchema.optional(),
});

export const walletCreditSchema = z.object({
  userId: uuidSchema,
  amount: amountSchema,
  referenceType: z.enum(['razorpay_topup', 'manual_credit', 'refund', 'cashback', 'adjustment']),
  referenceId: uuidSchema.optional(),
  idempotencyKey: z.string().optional(),
  description: safeTextSchema.optional(),
});

// =============================================================================
// PAYMENT SCHEMAS
// =============================================================================

export const razorpayVerifySchema = z.object({
  razorpay_order_id: z.string().min(10, 'Invalid Razorpay order ID'),
  razorpay_payment_id: z.string().min(10, 'Invalid Razorpay payment ID'),
  razorpay_signature: z.string().length(64, 'Invalid signature format'),
  amount: amountSchema,
  idempotency_key: z.string().optional(),
});

// =============================================================================
// SUBSCRIPTION SCHEMAS
// =============================================================================

export const createSubscriptionSchema = z.object({
  productId: uuidSchema,
  quantity: z.number().int().min(1, 'Minimum quantity is 1').max(10, 'Maximum quantity is 10'),
  schedule: z.record(
    z.string().regex(/^[0-6]$/), // Day of week 0-6
    z.number().min(0).max(10)   // Quantity for that day
  ),
  startDate: dateSchema,
  endDate: dateSchema.optional(),
});

export const updateSubscriptionSchema = z.object({
  subscriptionId: uuidSchema,
  schedule: z.record(z.string(), z.number()).optional(),
  quantity: z.number().int().min(1).max(10).optional(),
  status: z.enum(['active', 'paused', 'cancelled']).optional(),
});

export const skipDeliverySchema = z.object({
  subscriptionId: uuidSchema,
  date: dateSchema,
});

// =============================================================================
// ORDER SCHEMAS
// =============================================================================

export const createOrderSchema = z.object({
  userId: uuidSchema,
  productId: uuidSchema,
  addressId: uuidSchema,
  quantity: z.number().int().min(1).max(10),
  deliveryDate: dateSchema,
  notes: safeTextSchema.optional(),
});

export const updateOrderStatusSchema = z.object({
  orderId: uuidSchema,
  status: z.enum([
    'scheduled',
    'pending',
    'assigned',
    'in_transit',
    'delivered',
    'skipped',
    'missed',
    'cancelled',
    'failed',
  ]),
  notes: safeTextSchema.optional(),
});

// =============================================================================
// ADDRESS SCHEMAS
// =============================================================================

export const addressSchema = z.object({
  societyId: uuidSchema,
  towerId: uuidSchema,
  unitId: uuidSchema,
  deliveryInstructions: safeTextSchema.max(200).optional(),
});

// =============================================================================
// SUPPORT SCHEMAS
// =============================================================================

export const createTicketSchema = z.object({
  subject: safeTextSchema.min(5, 'Subject too short').max(100),
  description: safeTextSchema.min(10, 'Description too short').max(1000),
  category: z.enum(['delivery', 'payment', 'product', 'subscription', 'other']).optional(),
  orderId: uuidSchema.optional(),
});

export const ticketMessageSchema = z.object({
  ticketId: uuidSchema,
  message: safeTextSchema.min(1).max(1000),
});

// =============================================================================
// ADMIN SCHEMAS
// =============================================================================

export const adjustWalletSchema = z.object({
  customerId: uuidSchema,
  amount: z.number().min(-100000).max(100000), // Can be negative for deductions
  reason: safeTextSchema.min(5, 'Please provide a reason'),
});

export const assignDistributorSchema = z.object({
  distributorId: uuidSchema,
  towerId: uuidSchema,
  societyId: uuidSchema,
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Validate input and return typed result or throw
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Safe validation that returns success/error object
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  // Return first error message
  const firstError = result.error.issues[0];
  return {
    success: false,
    error: firstError?.message || 'Validation failed',
  };
}

/**
 * Get all validation errors as array
 */
export function getValidationErrors<T>(schema: z.ZodSchema<T>, data: unknown): string[] {
  const result = schema.safeParse(data);
  if (result.success) return [];
  return result.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`);
}

// =============================================================================
// EXPORTS
// =============================================================================

export { z };
