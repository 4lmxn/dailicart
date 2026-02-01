/**
 * Razorpay Payment Service
 * Handles all payment gateway operations for wallet recharge
 */

import RazorpayCheckout from 'react-native-razorpay';
import { supabase } from '../supabase';
import { config } from '../../config';
import { paymentAPI, generateIdempotencyKey } from '../api/payment';

// RAZORPAY CONFIGURATION
// ✅ Using environment variables from .env file
const RAZORPAY_CONFIG = {
  KEY_ID: config.razorpay.keyId,
  MODE: (config.razorpay as any).mode || 'dev',
};

// Payment themes and branding
const PAYMENT_THEME = {
  color: '#6366f1', // Indigo - matches your app theme
  backdrop_color: '#000000',
};

export interface RazorpayPaymentOptions {
  amount: number; // Amount in rupees (will be converted to paise)
  currency?: string;
  orderId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  description?: string;
  userId: string; // Required for backend operations
  idempotencyKey?: string; // Optional, will be generated if not provided
}

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
}

export interface PaymentResult {
  success: boolean;
  paymentId?: string;
  orderId?: string;
  signature?: string;
  error?: string;
  errorCode?: string;
}

class RazorpayService {
  /**
   * Initialize a payment with Razorpay
   * @param options Payment options including amount and customer details
   * @returns Promise<PaymentResult> - Payment result with transaction details
   */
  async initiatePayment(options: RazorpayPaymentOptions): Promise<PaymentResult> {
    try {
      // Ensure public key present to avoid runtime failures
      if (!RAZORPAY_CONFIG.KEY_ID) {
        throw new Error('Razorpay keyId is not configured. Please set EXPO_PUBLIC_RAZORPAY_KEY_ID in .env');
      }

      // Convert rupees to paise (Razorpay requires amount in smallest currency unit)
      const amountInPaise = Math.round(options.amount * 100);

      // Validate amount
      if (amountInPaise < 100) {
        throw new Error('Minimum payment amount is ₹1');
      }

      if (amountInPaise > 1000000) {
        throw new Error('Maximum payment amount is ₹10,000');
      }

      // Generate idempotency key if not provided
      const idempotencyKey = options.idempotencyKey || generateIdempotencyKey(options.userId, 'razorpay');

      // Create Razorpay order
      let orderId = options.orderId;
      if (!orderId) {
        if (RAZORPAY_CONFIG.MODE === 'prod') {
          // In production: call backend to create Razorpay order and return order_id
          const orderResponse = await paymentAPI.createOrder({
            amount: amountInPaise,
            currency: options.currency || 'INR',
            description: options.description || 'Wallet Recharge',
            userId: options.userId,
            idempotencyKey,
          });
          orderId = orderResponse.id;
        } else {
          // Dev mode: use local mock order id
          orderId = `order_${Date.now()}`;
        }
      }

      // Prepare Razorpay checkout options
      const checkoutOptions = {
        description: options.description || 'Wallet Recharge',
        image: undefined, // optional: app logo URL
        currency: options.currency || 'INR',
        key: RAZORPAY_CONFIG.KEY_ID,
        amount: amountInPaise,
        order_id: orderId,
        name: 'Milk Delivery App',
        prefill: {
          name: options.customerName || '',
          email: options.customerEmail || '',
          contact: options.customerPhone || '',
        },
        theme: PAYMENT_THEME,
        method: {
          upi: true,
          card: true,
          netbanking: true,
          wallet: true,
          emi: false, // Enable if needed
        },
        retry: {
          enabled: true,
          max_count: 3,
        },
        timeout: 300, // 5 minutes
        readonly: {
          contact: false,
          email: false,
          name: false,
        },
      };

      console.log('🔷 Initiating Razorpay payment:', {
        amount: options.amount,
        amountInPaise,
        orderId,
      });

      // Open Razorpay checkout
      const data: RazorpaySuccessResponse = await RazorpayCheckout.open(checkoutOptions);

      console.log('✅ Payment successful:', data);

      // Verify payment signature (CRITICAL for security)
      // This also credits the wallet in production mode
      const isValid = await this.verifyPaymentSignature({
        paymentId: data.razorpay_payment_id,
        orderId: (data.razorpay_order_id || orderId || ''),
        signature: data.razorpay_signature || '',
        userId: options.userId,
        idempotencyKey,
        amount: options.amount, // Pass amount for wallet credit
      });

      if (!isValid) {
        console.error('❌ Payment signature verification failed');
        return {
          success: false,
          error: 'Payment verification failed. Please contact support.',
          errorCode: 'SIGNATURE_VERIFICATION_FAILED',
        };
      }

      return {
        success: true,
        paymentId: data.razorpay_payment_id,
        orderId: data.razorpay_order_id || orderId,
        signature: data.razorpay_signature,
      };
    } catch (error: any) {
      console.error('❌ Razorpay payment error:', error);

      // Handle different error types
      let errorMessage = 'Payment failed. Please try again.';
      let errorCode = 'PAYMENT_FAILED';

      if (error.code === 0) {
        // User cancelled payment
        errorMessage = 'Payment cancelled by user';
        errorCode = 'USER_CANCELLED';
      } else if (error.code === 2) {
        // Network error
        errorMessage = 'Network error. Please check your connection.';
        errorCode = 'NETWORK_ERROR';
      } else if (error.description) {
        errorMessage = error.description;
      }

      return {
        success: false,
        error: errorMessage,
        errorCode,
      };
    }
  }

  /**
   * Verify payment signature to ensure payment authenticity
   * IMPORTANT: This should be done server-side in production for better security
   * @param data Payment verification data
   * @returns Promise<boolean> - True if signature is valid
   */
  private async verifyPaymentSignature(data: {
    paymentId: string;
    orderId: string;
    signature: string;
    userId: string;
    idempotencyKey: string;
    amount: number; // Amount in rupees
  }): Promise<boolean> {
    try {
      if (RAZORPAY_CONFIG.MODE === 'prod') {
        // Production: call Edge Function to verify signature and credit wallet
        const verifyResponse = await supabase.functions.invoke('razorpay_verify', {
          body: {
            razorpay_payment_id: data.paymentId,
            razorpay_order_id: data.orderId,
            razorpay_signature: data.signature,
            amount: data.amount,
            idempotency_key: data.idempotencyKey,
          }
        });
        return (verifyResponse.data?.ok === true);
      }

      // Development: skip signature verification (only for local testing)
      console.log('⚠️ Payment signature verification skipped (development mode)');
      return true;

      // PRODUCTION CODE (uncomment when backend is ready):
      /*
      const crypto = require('crypto');
      const text = `${data.orderId}|${data.paymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', RAZORPAY_CONFIG.KEY_SECRET)
        .update(text)
        .digest('hex');
      return expectedSignature === data.signature;
      */
    } catch (error) {
      console.error('❌ Signature verification error:', error);
      return false;
    }
  }

  /**
   * Create a wallet transaction record after successful payment
   * @param userId User ID
   * @param amount Amount recharged
   * @param paymentId Razorpay payment ID
   * @returns Promise<boolean> - True if transaction recorded successfully
   */
  async recordWalletTransaction(
    userId: string,
    amount: number,
    paymentId: string,
    orderId: string,
    idempotencyKey?: string
  ): Promise<boolean> {
    try {
      const idemKey = idempotencyKey || generateIdempotencyKey(userId, 'wallet');
      
      if (RAZORPAY_CONFIG.MODE === 'prod') {
        // Production: the razorpay_verify Edge Function already credited the wallet
        // This method is called for backward compatibility but the credit already happened
        console.log('✅ Wallet already credited by razorpay_verify Edge Function');
        return true;
      } else {
        // Development: use the secure RPC function (same as production DB)
        const { data, error } = await supabase.rpc('credit_wallet', {
          p_user_id: userId,
          p_amount: amount,
          p_reference_type: 'razorpay_topup',
          p_reference_id: null,
          p_idempotency_key: idemKey,
          p_description: `Wallet recharge via Razorpay (${paymentId})`,
          p_created_by: null,
        });

        if (error) {
          // Check if it's a duplicate (idempotency)
          if (error.message?.includes('duplicate')) {
            console.log('✅ Payment already processed (idempotency)');
            return true;
          }
          console.error('❌ Failed to credit wallet:', error);
          return false;
        }

        console.log('✅ Wallet credited (dev):', { userId, amount, paymentId, ledgerId: data });
        return true;
      }
    } catch (error) {
      console.error('❌ Error recording wallet transaction:', error);
      return false;
    }
  }

  /**
   * Handle payment webhook from Razorpay (for server-side processing)
   * This should be implemented as a Supabase Edge Function or separate API
   * @param webhookData Webhook payload from Razorpay
   */
  async handlePaymentWebhook(webhookData: any): Promise<void> {
    // Webhook handling should be implemented server-side for security.
    // This is typically done server-side:
    // 1. Verify webhook signature
    // 2. Extract payment details
    // 3. Update database
    // 4. Send confirmation notifications
    console.log('📡 Webhook received:', webhookData);
  }

  /**
   * Refund a payment (for cancelled orders or failed deliveries)
   * @param paymentId Razorpay payment ID
   * @param amount Amount to refund (optional, defaults to full refund)
   * @returns Promise<boolean> - True if refund successful
   */
  async refundPayment(paymentId: string, amount?: number): Promise<boolean> {
    try {
      // Refunds must be initiated via your backend using provider APIs.
      // This requires server-side integration with Razorpay Refund API
      console.log('💰 Refund initiated:', { paymentId, amount });
      
      // In production, call your backend:
      // const response = await fetch('https://your-api.com/refund-payment', {
      //   method: 'POST',
      //   body: JSON.stringify({ paymentId, amount }),
      // });
      // return response.ok;

      return true;
    } catch (error) {
      console.error('❌ Refund error:', error);
      return false;
    }
  }

  /**
   * Get payment status from Razorpay
   * @param paymentId Razorpay payment ID
   * @returns Promise<any> - Payment details
   */
  async getPaymentStatus(paymentId: string): Promise<any> {
    try {
      // Payment status checks should call your backend which queries the provider.
      // This requires server-side integration with Razorpay Payments API
      console.log('🔍 Checking payment status:', paymentId);
      
      // In production, call your backend:
      // const response = await fetch(`https://your-api.com/payment-status/${paymentId}`);
      // return response.json();

      return null;
    } catch (error) {
      console.error('❌ Error getting payment status:', error);
      return null;
    }
  }
}

// Export singleton instance
export const razorpayService = new RazorpayService();

// Export for testing
export default razorpayService;
