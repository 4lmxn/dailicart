/**
 * Payment API Service
 * Handles communication with backend payment endpoints
 */

import { config } from '../../config';

// ==================== TYPES ====================

export interface CreateOrderRequest {
  amount: number; // Amount in paise
  currency: string;
  description: string;
  userId: string;
  idempotencyKey: string; // Unique key to prevent duplicate orders
}

export interface CreateOrderResponse {
  id: string; // Razorpay order_id
  orderId?: string; // Alternative naming
  amount: number;
  currency: string;
  status: string;
}

export interface VerifyPaymentRequest {
  paymentId: string;
  orderId: string;
  signature: string;
  userId: string;
  idempotencyKey: string;
}

export interface VerifyPaymentResponse {
  verified: boolean;
  message?: string;
}

export interface CreditWalletRequest {
  userId: string;
  amount: number; // Amount in rupees
  paymentId: string;
  orderId: string;
  method: string;
  idempotencyKey: string;
}

export interface CreditWalletResponse {
  success: boolean;
  newBalance: number;
  transactionId: string;
}

export interface RetryConfig {
  maxRetries: number;
  delayMs: number;
  backoffMultiplier: number;
}

// ==================== HELPERS ====================

/**
 * Generate a unique idempotency key for payment operations
 * Format: userId_timestamp_random
 */
export function generateIdempotencyKey(userId: string, prefix: string = 'pay'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${userId}_${timestamp}_${random}`;
}

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {
    maxRetries: 3,
    delayMs: 1000,
    backoffMultiplier: 2,
  }
): Promise<T> {
  let lastError: Error | null = null;
  let delay = config.delayMs;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on client errors (4xx) except 429 (rate limit)
      if (error.status && error.status >= 400 && error.status < 500 && error.status !== 429) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === config.maxRetries) {
        break;
      }

      console.log(`⏳ Retry attempt ${attempt + 1}/${config.maxRetries} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= config.backoffMultiplier;
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Fetch wrapper with timeout and error handling
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

// ==================== API SERVICE ====================

class PaymentAPIService {
  private baseURL: string;

  constructor() {
    this.baseURL = config.api.baseURL;
  }

  /**
   * Create a Razorpay order on the backend
   * Includes retry logic and idempotency
   */
  async createOrder(request: CreateOrderRequest): Promise<CreateOrderResponse> {
    return retryWithBackoff(async () => {
      const response = await fetchWithTimeout(
        `${this.baseURL}/payments/order`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Idempotency-Key': request.idempotencyKey,
          },
          body: JSON.stringify({
            amount: request.amount,
            currency: request.currency,
            description: request.description,
            userId: request.userId,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error: any = new Error(errorData.message || 'Failed to create order');
        error.status = response.status;
        throw error;
      }

      const data = await response.json();
      return {
        id: data.id || data.orderId,
        orderId: data.orderId || data.id,
        amount: data.amount,
        currency: data.currency,
        status: data.status,
      };
    });
  }

  /**
   * Verify payment signature on the backend
   * This is the critical security check - MUST be done server-side
   */
  async verifyPayment(request: VerifyPaymentRequest): Promise<VerifyPaymentResponse> {
    return retryWithBackoff(async () => {
      const response = await fetchWithTimeout(
        `${this.baseURL}/payments/verify`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Idempotency-Key': request.idempotencyKey,
          },
          body: JSON.stringify({
            paymentId: request.paymentId,
            orderId: request.orderId,
            signature: request.signature,
            userId: request.userId,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error: any = new Error(errorData.message || 'Payment verification failed');
        error.status = response.status;
        throw error;
      }

      const data = await response.json();
      return {
        verified: data.verified !== false, // Default to true if not specified
        message: data.message,
      };
    }, {
      maxRetries: 5, // More retries for verification as it's critical
      delayMs: 2000,
      backoffMultiplier: 1.5,
    });
  }

  /**
   * Credit wallet after successful payment verification
   * Includes idempotency to prevent double credits
   */
  async creditWallet(request: CreditWalletRequest): Promise<CreditWalletResponse> {
    return retryWithBackoff(async () => {
      const response = await fetchWithTimeout(
        `${this.baseURL}/wallet/credit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Idempotency-Key': request.idempotencyKey,
          },
          body: JSON.stringify({
            userId: request.userId,
            amount: request.amount,
            paymentId: request.paymentId,
            orderId: request.orderId,
            method: request.method,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error: any = new Error(errorData.message || 'Failed to credit wallet');
        error.status = response.status;
        throw error;
      }

      const data = await response.json();
      return {
        success: data.success !== false,
        newBalance: data.newBalance || data.balance || 0,
        transactionId: data.transactionId || data.id,
      };
    }, {
      maxRetries: 5, // More retries for wallet credit as it's critical
      delayMs: 2000,
      backoffMultiplier: 1.5,
    });
  }

  /**
   * Get payment status from backend
   * Useful for reconciliation and manual verification
   */
  async getPaymentStatus(paymentId: string): Promise<any> {
    try {
      const response = await fetchWithTimeout(
        `${this.baseURL}/payments/status/${paymentId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to get payment status');
      }

      return await response.json();
    } catch (error) {
      console.error('❌ Error getting payment status:', error);
      return null;
    }
  }
}

// Export singleton instance
export const paymentAPI = new PaymentAPIService();

// Export for testing
export default paymentAPI;
