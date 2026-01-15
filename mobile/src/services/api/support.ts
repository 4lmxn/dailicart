import { supabase } from '../supabase';
import { uploadTicketAttachment } from '../../utils/imageUpload';
import { uuidSchema, safeTextSchema, safeValidate, z } from '../../utils/validation';

// Local support validation schemas
const ticketSubjectSchema = safeTextSchema.min(5, 'Subject too short').max(100, 'Subject too long');
const ticketDescriptionSchema = safeTextSchema.min(10, 'Please provide more detail').max(2000, 'Description too long');
const ticketMessageSchema = safeTextSchema.min(1, 'Message cannot be empty').max(1000, 'Message too long');
const ticketCategorySchema = z.enum(['delivery_issue', 'product_quality', 'payment', 'refund', 'subscription', 'other']);

export type TicketCategory = 'delivery_issue' | 'product_quality' | 'payment' | 'refund' | 'subscription' | 'other';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed' | 'escalated';
export type ResolutionType = 'replacement' | 'refund' | 'credit' | 'no_action' | 'other';

export interface ResolutionInput {
  ticketId: string;
  resolutionType: ResolutionType;
  notes: string;
  // For replacement
  replacementDate?: string; // YYYY-MM-DD
  // For refund/credit
  amount?: number;
  // Admin info
  adminId: string;
}

export interface ResolutionResult {
  success: boolean;
  message: string;
  details?: {
    orderId?: string;
    orderNumber?: string;
    creditedAmount?: number;
    newBalance?: number;
  };
}

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  userId: string;
  orderId?: string;
  subscriptionId?: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string;
  description: string;
  assignedAdminId?: string;
  assignedAdminName?: string;
  resolutionNotes?: string;
  resolvedAt?: string;
  refundAmount?: number;
  refundApproved?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderName?: string;
  senderRole: 'customer' | 'admin' | 'superadmin';
  message: string;
  isInternalNote: boolean;
  createdAt: string;
}

export interface TicketAttachment {
  id: string;
  ticketId: string;
  photoProofId: string;
  fileUrl: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  uploadedBy: string;
  uploadedByName?: string;
  createdAt: string;
}

export interface CreateTicketInput {
  orderId?: string;
  subscriptionId?: string;
  category: TicketCategory;
  priority?: TicketPriority;
  subject: string;
  description: string;
  attachments?: Array<{
    uri: string;
    fileName: string;
  }>;
}

export class SupportService {
  /**
   * Get all tickets for a user
   */
  static async getTickets(userId: string): Promise<SupportTicket[]> {
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select(`
          *,
          assigned_admin:assigned_admin_id(name)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(ticket => ({
        id: ticket.id,
        ticketNumber: ticket.ticket_number,
        userId: ticket.user_id,
        orderId: ticket.order_id,
        subscriptionId: ticket.subscription_id,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        subject: ticket.subject,
        description: ticket.description,
        assignedAdminId: ticket.assigned_admin_id,
        assignedAdminName: (ticket.assigned_admin as any)?.name,
        resolutionNotes: ticket.resolution_notes,
        resolvedAt: ticket.resolved_at,
        refundAmount: ticket.refund_amount,
        refundApproved: ticket.refund_approved,
        createdAt: ticket.created_at,
        updatedAt: ticket.updated_at,
      }));
    } catch (error) {
      console.error('Error fetching tickets:', error);
      return [];
    }
  }

  /**
   * Get a single ticket by ID
   */
  static async getTicketById(ticketId: string): Promise<SupportTicket | null> {
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select(`
          *,
          assigned_admin:assigned_admin_id(name)
        `)
        .eq('id', ticketId)
        .single();

      if (error) throw error;

      return {
        id: data.id,
        ticketNumber: data.ticket_number,
        userId: data.user_id,
        orderId: data.order_id,
        subscriptionId: data.subscription_id,
        category: data.category,
        priority: data.priority,
        status: data.status,
        subject: data.subject,
        description: data.description,
        assignedAdminId: data.assigned_admin_id,
        assignedAdminName: (data.assigned_admin as any)?.name,
        resolutionNotes: data.resolution_notes,
        resolvedAt: data.resolved_at,
        refundAmount: data.refund_amount,
        refundApproved: data.refund_approved,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (error) {
      console.error('Error fetching ticket:', error);
      return null;
    }
  }

  /**
   * Create a new support ticket
   */
  static async createTicket(
    userId: string,
    input: CreateTicketInput
  ): Promise<SupportTicket> {
    // Validate all inputs
    const userValidation = safeValidate(uuidSchema, userId);
    if (!userValidation.success) {
      throw new Error(`Invalid user ID: ${userValidation.error}`);
    }
    const subjectValidation = safeValidate(ticketSubjectSchema, input.subject);
    if (!subjectValidation.success) {
      throw new Error(subjectValidation.error);
    }
    const descValidation = safeValidate(ticketDescriptionSchema, input.description);
    if (!descValidation.success) {
      throw new Error(descValidation.error);
    }
    const categoryValidation = safeValidate(ticketCategorySchema, input.category);
    if (!categoryValidation.success) {
      throw new Error(categoryValidation.error);
    }
    if (input.orderId) {
      const orderValidation = safeValidate(uuidSchema, input.orderId);
      if (!orderValidation.success) {
        throw new Error(`Invalid order ID: ${orderValidation.error}`);
      }
    }

    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .insert({
          user_id: userId,
          order_id: input.orderId,
          subscription_id: input.subscriptionId,
          category: input.category,
          priority: input.priority || 'medium',
          subject: input.subject,
          description: input.description,
        })
        .select()
        .single();

      if (error) throw error;

      // Also create the initial message
      await this.addMessage(data.id, userId, 'customer', input.description);

      // Upload attachments if provided
      if (input.attachments && input.attachments.length > 0) {
        await this.addAttachments(data.id, userId, input.attachments);
      }

      return {
        id: data.id,
        ticketNumber: data.ticket_number,
        userId: data.user_id,
        orderId: data.order_id,
        subscriptionId: data.subscription_id,
        category: data.category,
        priority: data.priority,
        status: data.status,
        subject: data.subject,
        description: data.description,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (error) {
      console.error('Error creating ticket:', error);
      throw error;
    }
  }

  /**
   * Get messages for a ticket
   */
  static async getMessages(ticketId: string): Promise<TicketMessage[]> {
    try {
      const { data, error } = await supabase
        .from('ticket_messages')
        .select(`
          *,
          sender:sender_id(name)
        `)
        .eq('ticket_id', ticketId)
        .eq('is_internal_note', false) // Don't show internal notes to customers
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data || []).map(msg => ({
        id: msg.id,
        ticketId: msg.ticket_id,
        senderId: msg.sender_id,
        senderName: (msg.sender as any)?.name,
        senderRole: msg.sender_role,
        message: msg.message,
        isInternalNote: msg.is_internal_note,
        createdAt: msg.created_at,
      }));
    } catch (error) {
      console.error('Error fetching messages:', error);
      return [];
    }
  }

  /**
   * Add a message to a ticket
   */
  static async addMessage(
    ticketId: string,
    senderId: string,
    senderRole: 'customer' | 'admin' | 'superadmin',
    message: string
  ): Promise<TicketMessage> {
    // Validate inputs
    const ticketValidation = safeValidate(uuidSchema, ticketId);
    if (!ticketValidation.success) {
      throw new Error(`Invalid ticket ID: ${ticketValidation.error}`);
    }
    const senderValidation = safeValidate(uuidSchema, senderId);
    if (!senderValidation.success) {
      throw new Error(`Invalid sender ID: ${senderValidation.error}`);
    }
    const messageValidation = safeValidate(ticketMessageSchema, message);
    if (!messageValidation.success) {
      throw new Error(messageValidation.error);
    }

    try {
      const { data, error } = await supabase
        .from('ticket_messages')
        .insert({
          ticket_id: ticketId,
          sender_id: senderId,
          sender_role: senderRole,
          message: message,
          is_internal_note: false,
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        ticketId: data.ticket_id,
        senderId: data.sender_id,
        senderRole: data.sender_role,
        message: data.message,
        isInternalNote: data.is_internal_note,
        createdAt: data.created_at,
      };
    } catch (error) {
      console.error('Error adding message:', error);
      throw error;
    }
  }

  /**
   * Close a ticket (customer marking as resolved)
   */
  static async closeTicket(ticketId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('support_tickets')
        .update({ status: 'closed' })
        .eq('id', ticketId);

      if (error) throw error;
    } catch (error) {
      console.error('Error closing ticket:', error);
      throw error;
    }
  }

  /**
   * Get open tickets count
   */
  static async getOpenTicketsCount(userId: string): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('support_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .not('status', 'in', '("resolved","closed")');

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error counting open tickets:', error);
      return 0;
    }
  }

  /**
   * Get attachments for a ticket
   */
  static async getAttachments(ticketId: string): Promise<TicketAttachment[]> {
    try {
      const { data, error } = await supabase
        .from('ticket_attachments')
        .select(`
          *,
          photo_proof:photo_proof_id(
            file_url,
            file_name,
            file_size_bytes,
            mime_type,
            uploaded_by,
            uploader:uploaded_by(name),
            created_at
          )
        `)
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data || []).map(attachment => {
        const proof = attachment.photo_proof as any;
        return {
          id: attachment.id,
          ticketId: attachment.ticket_id,
          photoProofId: attachment.photo_proof_id,
          fileUrl: proof.file_url,
          fileName: proof.file_name,
          fileSizeBytes: proof.file_size_bytes,
          mimeType: proof.mime_type,
          uploadedBy: proof.uploaded_by,
          uploadedByName: proof.uploader?.name,
          createdAt: proof.created_at,
        };
      });
    } catch (error) {
      console.error('Error fetching attachments:', error);
      return [];
    }
  }

  /**
   * Add attachments to a ticket
   */
  static async addAttachments(
    ticketId: string,
    userId: string,
    attachments: Array<{ uri: string; fileName: string }>
  ): Promise<void> {
    try {
      for (const attachment of attachments) {
        // Upload file to storage
        const uploadResult = await uploadTicketAttachment(
          attachment.uri,
          attachment.fileName,
          ticketId
        );

        // Create photo_proof record
        const { data: photoProof, error: photoError } = await supabase
          .from('photo_proofs')
          .insert({
            uploaded_by: userId,
            proof_type: 'support',
            reference_type: 'ticket',
            reference_id: ticketId,
            file_url: uploadResult.url,
            file_name: attachment.fileName,
            file_size_bytes: uploadResult.size,
            mime_type: 'image/jpeg',
          })
          .select()
          .single();

        if (photoError) throw photoError;

        // Link to ticket
        const { error: linkError } = await supabase
          .from('ticket_attachments')
          .insert({
            ticket_id: ticketId,
            photo_proof_id: photoProof.id,
          });

        if (linkError) throw linkError;
      }
    } catch (error) {
      console.error('Error adding attachments:', error);
      throw error;
    }
  }

  /**
   * Add a single attachment to an existing ticket
   */
  static async addAttachment(
    ticketId: string,
    userId: string,
    uri: string,
    fileName: string
  ): Promise<TicketAttachment> {
    try {
      // Upload file to storage
      const uploadResult = await uploadTicketAttachment(uri, fileName, ticketId);

      // Create photo_proof record
      const { data: photoProof, error: photoError } = await supabase
        .from('photo_proofs')
        .insert({
          uploaded_by: userId,
          proof_type: 'support',
          reference_type: 'ticket',
          reference_id: ticketId,
          file_url: uploadResult.url,
          file_name: fileName,
          file_size_bytes: uploadResult.size,
          mime_type: 'image/jpeg',
        })
        .select()
        .single();

      if (photoError) throw photoError;

      // Link to ticket
      const { data: attachment, error: linkError } = await supabase
        .from('ticket_attachments')
        .insert({
          ticket_id: ticketId,
          photo_proof_id: photoProof.id,
        })
        .select()
        .single();

      if (linkError) throw linkError;

      return {
        id: attachment.id,
        ticketId: attachment.ticket_id,
        photoProofId: photoProof.id,
        fileUrl: uploadResult.url,
        fileName: fileName,
        fileSizeBytes: uploadResult.size,
        mimeType: 'image/jpeg',
        uploadedBy: userId,
        createdAt: attachment.created_at,
      };
    } catch (error) {
      console.error('Error adding attachment:', error);
      throw error;
    }
  }

  // ============================================================
  // ADMIN RESOLUTION METHODS
  // ============================================================

  /**
   * Get the cutoff hour for same-day replacement (e.g., 4 AM = orders before 4 AM can be replaced same day)
   */
  static getReplacementCutoffHour(): number {
    return 9; // 4 AM - adjust as needed
  }

  /**
   * Check if same-day replacement is possible
   */
  static canReplaceSameDay(): boolean {
    const now = new Date();
    const hour = now.getHours();
    return hour < this.getReplacementCutoffHour();
  }

  /**
   * Get the next available replacement date
   */
  static getNextReplacementDate(): string {
    const now = new Date();
    if (this.canReplaceSameDay()) {
      return now.toISOString().split('T')[0];
    }
    // Next day
    now.setDate(now.getDate() + 1);
    return now.toISOString().split('T')[0];
  }

  /**
   * Get ticket details with related order/subscription info for resolution
   */
  static async getTicketForResolution(ticketId: string): Promise<{
    ticket: SupportTicket | null;
    order: any | null;
    subscription: any | null;
    customer: any | null;
  }> {
    try {
      // Get ticket
      const { data: ticketData, error: ticketError } = await supabase
        .from('support_tickets')
        .select(`
          *,
          assigned_admin:assigned_admin_id(name)
        `)
        .eq('id', ticketId)
        .single();

      if (ticketError) throw ticketError;

      const ticket: SupportTicket = {
        id: ticketData.id,
        ticketNumber: ticketData.ticket_number,
        userId: ticketData.user_id,
        orderId: ticketData.order_id,
        subscriptionId: ticketData.subscription_id,
        category: ticketData.category,
        priority: ticketData.priority,
        status: ticketData.status,
        subject: ticketData.subject,
        description: ticketData.description,
        assignedAdminId: ticketData.assigned_admin_id,
        assignedAdminName: (ticketData.assigned_admin as any)?.name,
        resolutionNotes: ticketData.resolution_notes,
        resolvedAt: ticketData.resolved_at,
        refundAmount: ticketData.refund_amount,
        refundApproved: ticketData.refund_approved,
        createdAt: ticketData.created_at,
        updatedAt: ticketData.updated_at,
      };

      // Get related order if exists
      let order = null;
      if (ticket.orderId) {
        const { data: orderData } = await supabase
          .from('orders')
          .select(`
            *,
            product:products(id, name, price, unit),
            address:addresses(
              id,
              unit:tower_units(number),
              tower:society_towers(name),
              society:societies(name)
            )
          `)
          .eq('id', ticket.orderId)
          .single();
        order = orderData;
      }

      // Get related subscription if exists
      let subscription = null;
      if (ticket.subscriptionId) {
        const { data: subData } = await supabase
          .from('subscriptions')
          .select(`
            *,
            product:products(id, name, price, unit),
            address:addresses(
              id,
              unit:tower_units(number),
              tower:society_towers(name),
              society:societies(name)
            )
          `)
          .eq('id', ticket.subscriptionId)
          .single();
        subscription = subData;
      }

      // Get customer info
      const { data: customerData } = await supabase
        .from('customers')
        .select('*, user:users(name, phone)')
        .eq('user_id', ticket.userId)
        .single();

      return { ticket, order, subscription, customer: customerData };
    } catch (error) {
      console.error('Error getting ticket for resolution:', error);
      return { ticket: null, order: null, subscription: null, customer: null };
    }
  }

  /**
   * Process a replacement delivery resolution
   */
  static async processReplacement(
    ticketId: string,
    adminId: string,
    replacementDate: string,
    notes: string
  ): Promise<ResolutionResult> {
    try {
      const { ticket, order, subscription, customer } = await this.getTicketForResolution(ticketId);
      
      if (!ticket) {
        return { success: false, message: 'Ticket not found' };
      }

      // Determine product, quantity, address from order or subscription
      let productId: string | null = null;
      let quantity = 1;
      let unitPrice = 0;
      let addressId: string | null = null;

      if (order) {
        productId = order.product_id;
        quantity = order.quantity || 1;
        unitPrice = order.unit_price || order.product?.price || 0;
        addressId = order.address_id;
      } else if (subscription) {
        productId = subscription.product_id;
        quantity = subscription.quantity || 1;
        unitPrice = subscription.unit_price || subscription.product?.price || 0;
        addressId = subscription.address_id;
      }

      if (!productId || !addressId) {
        return { 
          success: false, 
          message: 'Cannot determine product or address for replacement. Please create manual order.' 
        };
      }

      // Create replacement order (FREE - amount = 0)
      const orderNumber = `RPL-${ticket.ticketNumber}-${Date.now().toString(36).toUpperCase()}`;
      
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: ticket.userId,
          address_id: addressId,
          product_id: productId,
          quantity: quantity,
          unit_price: 0, // FREE replacement
          total_amount: 0, // FREE replacement
          delivery_date: replacementDate,
          status: 'scheduled',
          payment_status: 'completed', // Already paid via original
          order_number: orderNumber,
          notes: `Replacement for ticket #${ticket.ticketNumber}`,
        })
        .select('id, order_number')
        .single();

      if (orderError) {
        console.error('Error creating replacement order:', orderError);
        return { success: false, message: 'Failed to create replacement order: ' + orderError.message };
      }

      // Update ticket as resolved
      await supabase
        .from('support_tickets')
        .update({
          status: 'resolved',
          resolution_notes: `REPLACEMENT: ${notes}\nReplacement Order: #${newOrder.order_number} for ${replacementDate}`,
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', ticketId);

      // Add resolution message
      await this.addMessage(
        ticketId,
        adminId,
        'admin',
        `✅ Resolution: Replacement delivery scheduled for ${replacementDate}.\nOrder #${newOrder.order_number}`
      );

      return {
        success: true,
        message: `Replacement order created for ${replacementDate}`,
        details: {
          orderId: newOrder.id,
          orderNumber: newOrder.order_number,
        },
      };
    } catch (error: any) {
      console.error('Error processing replacement:', error);
      return { success: false, message: error.message || 'Failed to process replacement' };
    }
  }

  /**
   * Process a refund/credit resolution
   */
  static async processRefundOrCredit(
    ticketId: string,
    adminId: string,
    amount: number,
    isRefund: boolean, // true = refund (from order), false = goodwill credit
    notes: string
  ): Promise<ResolutionResult> {
    try {
      const { ticket, order, customer } = await this.getTicketForResolution(ticketId);

      if (!ticket) {
        return { success: false, message: 'Ticket not found' };
      }

      if (!customer) {
        return { success: false, message: 'Customer not found' };
      }

      if (amount <= 0) {
        return { success: false, message: 'Amount must be greater than 0' };
      }

      // For refunds, validate against order amount
      if (isRefund && order) {
        const maxRefund = order.total_amount || 0;
        if (amount > maxRefund) {
          return {
            success: false,
            message: `Refund amount (₹${amount}) cannot exceed order amount (₹${maxRefund})`,
          };
        }
      }

      // Idempotency key for this operation
      const idempotencyKey = `support-${isRefund ? 'refund' : 'credit'}-${ticketId}`;

      // Check if already processed (idempotency check via wallet_ledger)
      const { data: existingLedger } = await supabase
        .from('wallet_ledger')
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existingLedger) {
        return {
          success: true,
          message: 'This resolution was already processed',
          details: { creditedAmount: amount },
        };
      }

      // Get current balance
      const currentBalance = customer.wallet_balance || 0;
      const newBalance = currentBalance + amount;

      // Update customer wallet balance
      const { error: updateError } = await supabase
        .from('customers')
        .update({
          wallet_balance: newBalance,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', ticket.userId);

      if (updateError) {
        console.error('Error updating wallet balance:', updateError);
        return { success: false, message: 'Failed to update wallet balance' };
      }

      // Record in wallet_ledger (transaction history)
      const { error: ledgerError } = await supabase.from('wallet_ledger').insert({
        user_id: ticket.userId,
        entry_type: 'credit',
        amount: amount,
        balance_before: currentBalance,
        balance_after: newBalance,
        reference_type: isRefund ? 'refund' : 'support_credit',
        reference_id: ticketId,
        idempotency_key: idempotencyKey,
        description: isRefund
          ? `Refund for ticket #${ticket.ticketNumber}`
          : `Support credit for ticket #${ticket.ticketNumber}`,
      });

      if (ledgerError) {
        console.error('Error recording wallet ledger:', ledgerError);
        // Rollback balance update
        await supabase
          .from('customers')
          .update({ wallet_balance: currentBalance })
          .eq('user_id', ticket.userId);
        return { success: false, message: 'Failed to record transaction' };
      }

      // Update ticket as resolved
      const resolutionType = isRefund ? 'REFUND' : 'CREDIT';
      await supabase
        .from('support_tickets')
        .update({
          status: 'resolved',
          resolution_notes: `${resolutionType}: ₹${amount}\n${notes}`,
          refund_amount: amount,
          refund_approved: true,
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', ticketId);

      // Add resolution message
      await this.addMessage(
        ticketId,
        adminId,
        'admin',
        `✅ Resolution: ${resolutionType} of ₹${amount} has been credited to your wallet. New balance: ₹${newBalance}`
      );

      return {
        success: true,
        message: `₹${amount} ${isRefund ? 'refunded' : 'credited'} to customer wallet`,
        details: {
          creditedAmount: amount,
          newBalance: newBalance,
        },
      };
    } catch (error: any) {
      console.error('Error processing refund/credit:', error);
      return { success: false, message: error.message || 'Failed to process' };
    }
  }

  /**
   * Process a no-action resolution (close without action)
   */
  static async processNoAction(
    ticketId: string,
    adminId: string,
    notes: string
  ): Promise<ResolutionResult> {
    try {
      // Update ticket as resolved
      await supabase
        .from('support_tickets')
        .update({
          status: 'resolved',
          resolution_notes: `NO ACTION REQUIRED: ${notes}`,
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', ticketId);

      // Add resolution message
      await this.addMessage(
        ticketId,
        adminId,
        'admin',
        `✅ This ticket has been resolved. ${notes}`
      );

      return {
        success: true,
        message: 'Ticket resolved without action',
      };
    } catch (error: any) {
      console.error('Error processing no-action resolution:', error);
      return { success: false, message: error.message || 'Failed to resolve' };
    }
  }

  /**
   * Main resolution handler
   */
  static async resolveTicket(input: ResolutionInput): Promise<ResolutionResult> {
    switch (input.resolutionType) {
      case 'replacement':
        if (!input.replacementDate) {
          return { success: false, message: 'Replacement date is required' };
        }
        return this.processReplacement(
          input.ticketId,
          input.adminId,
          input.replacementDate,
          input.notes
        );

      case 'refund':
        if (!input.amount || input.amount <= 0) {
          return { success: false, message: 'Refund amount is required' };
        }
        return this.processRefundOrCredit(
          input.ticketId,
          input.adminId,
          input.amount,
          true,
          input.notes
        );

      case 'credit':
        if (!input.amount || input.amount <= 0) {
          return { success: false, message: 'Credit amount is required' };
        }
        return this.processRefundOrCredit(
          input.ticketId,
          input.adminId,
          input.amount,
          false,
          input.notes
        );

      case 'no_action':
        return this.processNoAction(input.ticketId, input.adminId, input.notes);

      case 'other':
        return this.processNoAction(input.ticketId, input.adminId, input.notes);

      default:
        return { success: false, message: 'Unknown resolution type' };
    }
  }
}
