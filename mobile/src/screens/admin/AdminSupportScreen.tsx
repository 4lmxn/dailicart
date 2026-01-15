import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Linking,
} from 'react-native';
import { AppLayout } from '../../components/AppLayout';
import { AppBar } from '../../components/AppBar';
import { EmptyState } from '../../components/EmptyState';
import { useAuthStore } from '../../store/authStore';
import { useToast } from '../../components/Toast';
import { supabase } from '../../services/supabase';
import {
  SupportService,
  SupportTicket,
  TicketMessage,
  TicketAttachment,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  ResolutionType,
} from '../../services/api/support';

interface AdminSupportScreenProps {
  onBack: () => void;
}

const CATEGORIES: { value: TicketCategory; label: string; icon: string }[] = [
  { value: 'delivery_issue', label: 'Delivery', icon: '🚚' },
  { value: 'product_quality', label: 'Quality', icon: '🥛' },
  { value: 'payment', label: 'Payment', icon: '💳' },
  { value: 'refund', label: 'Refund', icon: '💰' },
  { value: 'subscription', label: 'Subscription', icon: '📋' },
  { value: 'other', label: 'Other', icon: '❓' },
];

const STATUSES: { value: TicketStatus | 'all'; label: string; color: string }[] = [
  { value: 'all', label: 'All', color: '#64748B' },
  { value: 'open', label: 'Open', color: '#3B82F6' },
  { value: 'in_progress', label: 'In Progress', color: '#F59E0B' },
  { value: 'waiting_customer', label: 'Waiting', color: '#8B5CF6' },
  { value: 'escalated', label: 'Escalated', color: '#EF4444' },
  { value: 'resolved', label: 'Resolved', color: '#10B981' },
  { value: 'closed', label: 'Closed', color: '#94A3B8' },
];

const PRIORITIES: { value: TicketPriority; label: string; color: string }[] = [
  { value: 'urgent', label: 'Urgent', color: '#DC2626' },
  { value: 'high', label: 'High', color: '#EF4444' },
  { value: 'medium', label: 'Medium', color: '#F59E0B' },
  { value: 'low', label: 'Low', color: '#64748B' },
];

export const AdminSupportScreen: React.FC<AdminSupportScreenProps> = ({ onBack }) => {
  const { user } = useAuthStore();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [filteredTickets, setFilteredTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<TicketCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Reply
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  
  // Actions
  const [showActionsModal, setShowActionsModal] = useState(false);
  const [showResolutionModal, setShowResolutionModal] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  
  // Resolution
  const [resolutionType, setResolutionType] = useState<ResolutionType>('no_action');
  const [resolutionAmount, setResolutionAmount] = useState('');
  const [replacementDate, setReplacementDate] = useState('');
  const [ticketDetails, setTicketDetails] = useState<{
    order: any;
    subscription: any;
    customer: any;
  } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const loadTickets = useCallback(async () => {
    try {
      // Fetch all tickets (admin view)
      const { data, error } = await supabase
        .from('support_tickets')
        .select(`
          *,
          user:user_id(name, phone),
          assigned_admin:assigned_admin_id(name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped: SupportTicket[] = (data || []).map((ticket: any) => ({
        id: ticket.id,
        ticketNumber: ticket.ticket_number,
        userId: ticket.user_id,
        userName: ticket.user?.name || 'Unknown',
        userPhone: ticket.user?.phone || '',
        orderId: ticket.order_id,
        subscriptionId: ticket.subscription_id,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        subject: ticket.subject,
        description: ticket.description,
        assignedAdminId: ticket.assigned_admin_id,
        assignedAdminName: ticket.assigned_admin?.name,
        resolutionNotes: ticket.resolution_notes,
        resolvedAt: ticket.resolved_at,
        refundAmount: ticket.refund_amount,
        refundApproved: ticket.refund_approved,
        createdAt: ticket.created_at,
        updatedAt: ticket.updated_at,
      }));

      setTickets(mapped);
    } catch (error) {
      console.error('Error loading tickets:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // Apply filters
  useEffect(() => {
    let filtered = [...tickets];
    
    if (statusFilter !== 'all') {
      filtered = filtered.filter(t => t.status === statusFilter);
    }
    
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(t => t.category === categoryFilter);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        t.ticketNumber?.toLowerCase().includes(query) ||
        t.subject.toLowerCase().includes(query) ||
        (t as any).userName?.toLowerCase().includes(query) ||
        (t as any).userPhone?.includes(query)
      );
    }
    
    setFilteredTickets(filtered);
  }, [tickets, statusFilter, categoryFilter, searchQuery]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadTickets();
  };

  const handleViewTicket = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setLoadingMessages(true);
    setResolutionNotes(ticket.resolutionNotes || '');
    setAttachments([]);
    try {
      const [msgs, atts] = await Promise.all([
        SupportService.getMessages(ticket.id),
        SupportService.getAttachments(ticket.id),
      ]);
      setMessages(msgs);
      setAttachments(atts);
    } catch (error) {
      console.error('Error loading messages/attachments:', error);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedTicket || !user?.id || !replyText.trim()) return;

    setSending(true);
    try {
      await SupportService.addMessage(selectedTicket.id, user.id, 'admin', replyText.trim());
      setReplyText('');
      
      // Update ticket status to waiting_customer
      await supabase
        .from('support_tickets')
        .update({ status: 'waiting_customer', updated_at: new Date().toISOString() })
        .eq('id', selectedTicket.id);
      
      const msgs = await SupportService.getMessages(selectedTicket.id);
      setMessages(msgs);
      toast.show('Reply sent!', { type: 'success' });
      loadTickets();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  const handleAssignToMe = async () => {
    if (!selectedTicket || !user?.id) return;
    setUpdating(true);
    try {
      await supabase
        .from('support_tickets')
        .update({ 
          assigned_admin_id: user.id, 
          status: 'in_progress',
          updated_at: new Date().toISOString() 
        })
        .eq('id', selectedTicket.id);
      
      toast.show('Ticket assigned to you', { type: 'success' });
      loadTickets();
      setShowActionsModal(false);
      setSelectedTicket(null);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to assign ticket');
    } finally {
      setUpdating(false);
    }
  };

  const handleOpenResolutionModal = async () => {
    if (!selectedTicket) return;
    
    setShowActionsModal(false);
    setLoadingDetails(true);
    setShowResolutionModal(true);
    
    // Reset resolution state
    setResolutionType('no_action');
    setResolutionAmount('');
    setResolutionNotes('');
    
    // Set default replacement date
    const nextDate = SupportService.getNextReplacementDate();
    setReplacementDate(nextDate);
    
    // Load ticket details
    try {
      const details = await SupportService.getTicketForResolution(selectedTicket.id);
      setTicketDetails({
        order: details.order,
        subscription: details.subscription,
        customer: details.customer,
      });
      
      // Pre-fill amount if there's an order
      if (details.order) {
        setResolutionAmount(String(details.order.total_amount || 0));
      }
    } catch (error) {
      console.error('Error loading ticket details:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleProcessResolution = async () => {
    if (!selectedTicket || !user?.id) {
      Alert.alert('Error', 'Session error. Please try again.');
      return;
    }
    
    if (!resolutionNotes.trim()) {
      Alert.alert('Error', 'Please add resolution notes');
      return;
    }
    
    if ((resolutionType === 'refund' || resolutionType === 'credit') && !resolutionAmount) {
      Alert.alert('Error', 'Please enter an amount');
      return;
    }
    
    if (resolutionType === 'replacement' && !replacementDate) {
      Alert.alert('Error', 'Please select a replacement date');
      return;
    }
    
    setUpdating(true);
    try {
      const result = await SupportService.resolveTicket({
        ticketId: selectedTicket.id,
        resolutionType,
        notes: resolutionNotes.trim(),
        amount: resolutionAmount ? parseFloat(resolutionAmount) : undefined,
        replacementDate: replacementDate || undefined,
        adminId: user.id,
      });
      
      if (result.success) {
        toast.show(result.message, { type: 'success' });
        loadTickets();
        setShowResolutionModal(false);
        setSelectedTicket(null);
      } else {
        Alert.alert('Resolution Failed', result.message);
      }
    } catch (error: any) {
      console.error('Resolution error:', error);
      Alert.alert('Error', error.message || 'Failed to process resolution');
    } finally {
      setUpdating(false);
    }
  };

  const canReplaceSameDay = SupportService.canReplaceSameDay();
  const todayDate = new Date().toISOString().split('T')[0];
  const tomorrowDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();

  const handleEscalateTicket = async () => {
    if (!selectedTicket) return;
    setUpdating(true);
    try {
      await supabase
        .from('support_tickets')
        .update({ 
          status: 'escalated',
          priority: 'urgent',
          updated_at: new Date().toISOString() 
        })
        .eq('id', selectedTicket.id);
      
      toast.show('Ticket escalated', { type: 'info' });
      loadTickets();
      setShowActionsModal(false);
      setSelectedTicket(null);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to escalate ticket');
    } finally {
      setUpdating(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!selectedTicket) return;
    
    Alert.alert(
      'Close Ticket',
      'Are you sure you want to close this ticket?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close',
          style: 'destructive',
          onPress: async () => {
            setUpdating(true);
            try {
              await supabase
                .from('support_tickets')
                .update({ 
                  status: 'closed',
                  updated_at: new Date().toISOString() 
                })
                .eq('id', selectedTicket.id);
              
              toast.show('Ticket closed', { type: 'success' });
              loadTickets();
              setShowActionsModal(false);
              setSelectedTicket(null);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to close ticket');
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    return STATUSES.find(s => s.value === status)?.color || '#64748B';
  };

  const getStatusLabel = (status: string) => {
    return STATUSES.find(s => s.value === status)?.label || status;
  };

  const getPriorityColor = (priority: string) => {
    return PRIORITIES.find(p => p.value === priority)?.color || '#64748B';
  };

  const getCategoryIcon = (category: string) => {
    return CATEGORIES.find(c => c.value === category)?.icon || '❓';
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTicketStats = () => {
    const open = tickets.filter(t => t.status === 'open').length;
    const inProgress = tickets.filter(t => t.status === 'in_progress').length;
    const escalated = tickets.filter(t => t.status === 'escalated').length;
    const resolved = tickets.filter(t => ['resolved', 'closed'].includes(t.status)).length;
    return { open, inProgress, escalated, resolved };
  };

  const stats = getTicketStats();

  return (
    <AppLayout>
      <AppBar
        title="Support Tickets"
        subtitle={`${tickets.length} total tickets`}
        onBack={onBack}
        variant="surface"
      />

      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#0D9488']} />
        }
      >
        {/* Stats Cards */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: '#EFF6FF' }]}>
            <Text style={[styles.statNumber, { color: '#3B82F6' }]}>{stats.open}</Text>
            <Text style={styles.statLabel}>Open</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#FEF3C7' }]}>
            <Text style={[styles.statNumber, { color: '#F59E0B' }]}>{stats.inProgress}</Text>
            <Text style={styles.statLabel}>In Progress</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#FEE2E2' }]}>
            <Text style={[styles.statNumber, { color: '#EF4444' }]}>{stats.escalated}</Text>
            <Text style={styles.statLabel}>Escalated</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#D1FAE5' }]}>
            <Text style={[styles.statNumber, { color: '#10B981' }]}>{stats.resolved}</Text>
            <Text style={styles.statLabel}>Resolved</Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by ticket #, subject, customer..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#94A3B8"
          />
        </View>

        {/* Status Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {STATUSES.map(status => (
            <TouchableOpacity
              key={status.value}
              style={[
                styles.filterChip,
                statusFilter === status.value && { backgroundColor: status.color + '20', borderColor: status.color },
              ]}
              onPress={() => setStatusFilter(status.value)}
            >
              <Text style={[
                styles.filterChipText,
                statusFilter === status.value && { color: status.color, fontWeight: '600' },
              ]}>
                {status.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Category Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          <TouchableOpacity
            style={[
              styles.filterChip,
              categoryFilter === 'all' && styles.filterChipActive,
            ]}
            onPress={() => setCategoryFilter('all')}
          >
            <Text style={[
              styles.filterChipText,
              categoryFilter === 'all' && styles.filterChipTextActive,
            ]}>
              All Categories
            </Text>
          </TouchableOpacity>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.value}
              style={[
                styles.filterChip,
                categoryFilter === cat.value && styles.filterChipActive,
              ]}
              onPress={() => setCategoryFilter(cat.value)}
            >
              <Text style={styles.filterChipIcon}>{cat.icon}</Text>
              <Text style={[
                styles.filterChipText,
                categoryFilter === cat.value && styles.filterChipTextActive,
              ]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Tickets List */}
        <View style={styles.ticketList}>
          {loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color="#0D9488" size="large" />
          ) : filteredTickets.length === 0 ? (
            <EmptyState
              icon="📋"
              title="No Tickets Found"
              description={searchQuery || statusFilter !== 'all' ? 'Try adjusting your filters' : 'No support tickets yet'}
            />
          ) : (
            filteredTickets.map(ticket => (
              <TouchableOpacity
                key={ticket.id}
                style={styles.ticketCard}
                onPress={() => handleViewTicket(ticket)}
                activeOpacity={0.7}
              >
                <View style={styles.ticketHeader}>
                  <View style={styles.ticketHeaderLeft}>
                    <Text style={styles.ticketNumber}>#{ticket.ticketNumber}</Text>
                    <View style={[styles.priorityDot, { backgroundColor: getPriorityColor(ticket.priority) }]} />
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(ticket.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(ticket.status) }]}>
                      {getStatusLabel(ticket.status)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.ticketSubject} numberOfLines={1}>
                  {getCategoryIcon(ticket.category)} {ticket.subject}
                </Text>

                <View style={styles.ticketMeta}>
                  <Text style={styles.ticketCustomer}>
                    👤 {(ticket as any).userName || 'Unknown'}
                  </Text>
                  <Text style={styles.ticketDate}>{formatDate(ticket.createdAt)}</Text>
                </View>

                {ticket.assignedAdminName && (
                  <Text style={styles.assignedText}>
                    Assigned: {ticket.assignedAdminName}
                  </Text>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Ticket Detail Modal */}
      <Modal visible={!!selectedTicket} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>#{selectedTicket?.ticketNumber}</Text>
                <Text style={styles.modalSubtitle} numberOfLines={1}>{selectedTicket?.subject}</Text>
              </View>
              <TouchableOpacity 
                style={styles.actionsButton}
                onPress={() => setShowActionsModal(true)}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                activeOpacity={0.6}
              >
                <Text style={styles.actionsButtonText}>⚙️</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => setSelectedTicket(null)}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                activeOpacity={0.6}
              >
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Customer & Status Info */}
            {selectedTicket && (
              <View style={styles.ticketInfo}>
                <View style={styles.ticketInfoRow}>
                  <Text style={styles.ticketInfoLabel}>Customer:</Text>
                  <Text style={styles.ticketInfoValue}>
                    {(selectedTicket as any).userName} ({(selectedTicket as any).userPhone})
                  </Text>
                </View>
                <View style={styles.ticketInfoRow}>
                  <Text style={styles.ticketInfoLabel}>Status:</Text>
                  <View style={[styles.statusBadgeSmall, { backgroundColor: getStatusColor(selectedTicket.status) + '20' }]}>
                    <Text style={[styles.statusTextSmall, { color: getStatusColor(selectedTicket.status) }]}>
                      {getStatusLabel(selectedTicket.status)}
                    </Text>
                  </View>
                </View>
                <View style={styles.ticketInfoRow}>
                  <Text style={styles.ticketInfoLabel}>Priority:</Text>
                  <Text style={[styles.ticketInfoValue, { color: getPriorityColor(selectedTicket.priority) }]}>
                    {selectedTicket.priority.toUpperCase()}
                  </Text>
                </View>
              </View>
            )}

            {/* Messages */}
            <ScrollView 
              style={styles.messagesContainer}
              contentContainerStyle={styles.messagesContent}
              showsVerticalScrollIndicator={true}
            >
              {loadingMessages ? (
                <ActivityIndicator style={{ marginTop: 20 }} color="#0D9488" />
              ) : (
                <>
                  {/* Original description */}
                  <View style={[styles.messageCard, styles.messageCustomer]}>
                    <Text style={styles.messageSender}>
                      {(selectedTicket as any)?.userName || 'Customer'}
                    </Text>
                    <Text style={styles.messageText}>{selectedTicket?.description}</Text>
                    <Text style={styles.messageTime}>
                      {selectedTicket && formatDate(selectedTicket.createdAt)}
                    </Text>
                  </View>

                  {/* Attachments */}
                  {attachments.length > 0 && (
                    <View style={styles.attachmentsSection}>
                      <Text style={styles.attachmentsSectionTitle}>
                        📎 Attachments ({attachments.length})
                      </Text>
                      <View style={styles.attachmentsGrid}>
                        {attachments.map(att => (
                          <TouchableOpacity
                            key={att.id}
                            style={styles.attachmentThumb}
                            onPress={() => setSelectedImage(att.fileUrl)}
                          >
                            <Image
                              source={{ uri: att.fileUrl }}
                              style={styles.attachmentImage}
                              resizeMode="cover"
                            />
                            <Text style={styles.attachmentName} numberOfLines={1}>
                              {att.fileName}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Replies */}
                  {messages.map(msg => (
                    <View
                      key={msg.id}
                      style={[
                        styles.messageCard,
                        msg.senderRole === 'customer' ? styles.messageCustomer : styles.messageAdmin,
                      ]}
                    >
                      <Text style={styles.messageSender}>
                        {msg.senderRole === 'customer' 
                          ? (selectedTicket as any)?.userName || 'Customer'
                          : msg.senderName || 'Admin'}
                      </Text>
                      <Text style={styles.messageText}>{msg.message}</Text>
                      <Text style={styles.messageTime}>{formatDate(msg.createdAt)}</Text>
                    </View>
                  ))}

                  {/* Resolution notes */}
                  {selectedTicket?.resolutionNotes && (
                    <View style={[styles.messageCard, styles.messageResolution]}>
                      <Text style={styles.messageSender}>✅ Resolution</Text>
                      <Text style={styles.messageText}>{selectedTicket.resolutionNotes}</Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>

            {/* Reply input */}
            {selectedTicket && !['resolved', 'closed'].includes(selectedTicket.status) && (
              <View style={styles.replyContainer}>
                <TextInput
                  style={styles.replyInput}
                  placeholder="Type your reply..."
                  value={replyText}
                  onChangeText={setReplyText}
                  placeholderTextColor="#94A3B8"
                  multiline
                />
                <TouchableOpacity
                  style={[styles.sendButton, (!replyText.trim() || sending) && styles.sendButtonDisabled]}
                  onPress={handleSendReply}
                  disabled={!replyText.trim() || sending}
                >
                  {sending ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.sendButtonText}>Send</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>

        {/* Actions Overlay - rendered INSIDE the main modal to avoid nested modal issues on iOS */}
        {showActionsModal && (
          <View style={[styles.actionsModalOverlay, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }]}>
            <View style={styles.actionsModalContent}>
              <Text style={styles.actionsModalTitle}>Ticket Actions</Text>

              <View style={styles.actionsGrid}>
                {!selectedTicket?.assignedAdminId && (
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: '#EFF6FF' }]}
                    onPress={handleAssignToMe}
                    disabled={updating}
                  >
                    <Text style={styles.actionButtonIcon}>👋</Text>
                    <Text style={[styles.actionButtonText, { color: '#3B82F6' }]}>Assign to Me</Text>
                  </TouchableOpacity>
                )}

                {selectedTicket && !['resolved', 'closed'].includes(selectedTicket.status) && (
                  <>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: '#D1FAE5' }]}
                      onPress={handleOpenResolutionModal}
                      disabled={updating}
                    >
                      <Text style={styles.actionButtonIcon}>✅</Text>
                      <Text style={[styles.actionButtonText, { color: '#10B981' }]}>Resolve with Action</Text>
                    </TouchableOpacity>

                    {selectedTicket.status !== 'escalated' && (
                      <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#FEE2E2' }]}
                        onPress={handleEscalateTicket}
                        disabled={updating}
                      >
                        <Text style={styles.actionButtonIcon}>🚨</Text>
                        <Text style={[styles.actionButtonText, { color: '#EF4444' }]}>Escalate</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: '#F1F5F9' }]}
                      onPress={handleCloseTicket}
                      disabled={updating}
                    >
                      <Text style={styles.actionButtonIcon}>🔒</Text>
                      <Text style={[styles.actionButtonText, { color: '#64748B' }]}>Close Without Action</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {updating && (
                <ActivityIndicator style={{ marginVertical: 16 }} color="#0D9488" />
              )}

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowActionsModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Resolution Overlay - rendered INSIDE the main modal to avoid nested modal issues on iOS */}
        {showResolutionModal && (
          <View style={[styles.modalOverlay, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1001 }]}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{ flex: 1, justifyContent: 'flex-end' }}
            >
              <View style={[styles.modalContent, { height: '95%' }]}>
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>Resolve Ticket</Text>
                    <Text style={styles.modalSubtitle}>#{selectedTicket?.ticketNumber}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowResolutionModal(false)}>
                    <Text style={styles.closeButton}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.messagesContainer} contentContainerStyle={styles.messagesContent}>
                  {loadingDetails ? (
                    <ActivityIndicator style={{ marginTop: 40 }} color="#0D9488" />
                  ) : (
                    <>
                      {/* Ticket & Order Info */}
                      <View style={styles.resolutionInfoCard}>
                        <Text style={styles.resolutionInfoTitle}>📋 Ticket Info</Text>
                        <Text style={styles.resolutionInfoText}>
                          Category: {getCategoryIcon(selectedTicket?.category || '')} {selectedTicket?.category?.replace('_', ' ')}
                        </Text>
                        <Text style={styles.resolutionInfoText}>
                          Customer: {ticketDetails?.customer?.user?.name || 'Unknown'}
                        </Text>
                        {ticketDetails?.order && (
                          <>
                            <Text style={styles.resolutionInfoText}>
                              Order: #{ticketDetails.order.order_number}
                            </Text>
                            <Text style={styles.resolutionInfoText}>
                              Product: {ticketDetails.order.product?.name} × {ticketDetails.order.quantity}
                            </Text>
                            <Text style={styles.resolutionInfoText}>
                              Amount: ₹{ticketDetails.order.total_amount}
                            </Text>
                          </>
                        )}
                        {ticketDetails?.subscription && (
                          <>
                            <Text style={styles.resolutionInfoText}>
                              Subscription: {ticketDetails.subscription.product?.name}
                            </Text>
                          </>
                        )}
                        <Text style={styles.resolutionInfoText}>
                          Wallet Balance: ₹{ticketDetails?.customer?.wallet_balance || 0}
                        </Text>
                      </View>

                      {/* Resolution Type Selection */}
                      <Text style={styles.resolutionSectionTitle}>Resolution Type</Text>
                      <View style={styles.resolutionTypeGrid}>
                        <TouchableOpacity
                          style={[
                            styles.resolutionTypeButton,
                            resolutionType === 'replacement' && styles.resolutionTypeButtonActive,
                          ]}
                          onPress={() => setResolutionType('replacement')}
                        >
                          <Text style={styles.resolutionTypeIcon}>🔄</Text>
                          <Text style={[
                            styles.resolutionTypeText,
                            resolutionType === 'replacement' && styles.resolutionTypeTextActive,
                          ]}>Replacement</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.resolutionTypeButton,
                            resolutionType === 'refund' && styles.resolutionTypeButtonActive,
                          ]}
                          onPress={() => setResolutionType('refund')}
                        >
                          <Text style={styles.resolutionTypeIcon}>💰</Text>
                          <Text style={[
                            styles.resolutionTypeText,
                            resolutionType === 'refund' && styles.resolutionTypeTextActive,
                          ]}>Refund</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.resolutionTypeButton,
                            resolutionType === 'credit' && styles.resolutionTypeButtonActive,
                          ]}
                          onPress={() => setResolutionType('credit')}
                        >
                          <Text style={styles.resolutionTypeIcon}>🎁</Text>
                          <Text style={[
                            styles.resolutionTypeText,
                            resolutionType === 'credit' && styles.resolutionTypeTextActive,
                          ]}>Goodwill Credit</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.resolutionTypeButton,
                            resolutionType === 'no_action' && styles.resolutionTypeButtonActive,
                          ]}
                          onPress={() => setResolutionType('no_action')}
                        >
                          <Text style={styles.resolutionTypeIcon}>📝</Text>
                          <Text style={[
                            styles.resolutionTypeText,
                            resolutionType === 'no_action' && styles.resolutionTypeTextActive,
                          ]}>No Action</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Replacement Date Selection */}
                      {resolutionType === 'replacement' && (
                        <View style={styles.resolutionFieldContainer}>
                          <Text style={styles.resolutionSectionTitle}>Replacement Date</Text>
                          <View style={styles.dateButtonsRow}>
                            {canReplaceSameDay && (
                              <TouchableOpacity
                                style={[
                                  styles.dateButton,
                                  replacementDate === todayDate && styles.dateButtonActive,
                                ]}
                                onPress={() => setReplacementDate(todayDate)}
                              >
                                <Text style={[
                                  styles.dateButtonText,
                                  replacementDate === todayDate && styles.dateButtonTextActive,
                                ]}>Today</Text>
                              </TouchableOpacity>
                            )}
                            <TouchableOpacity
                              style={[
                                styles.dateButton,
                                replacementDate === tomorrowDate && styles.dateButtonActive,
                              ]}
                              onPress={() => setReplacementDate(tomorrowDate)}
                            >
                              <Text style={[
                                styles.dateButtonText,
                                replacementDate === tomorrowDate && styles.dateButtonTextActive,
                              ]}>Tomorrow</Text>
                            </TouchableOpacity>
                          </View>
                          <TextInput
                            style={styles.resolutionInput}
                            placeholder="Or enter date (YYYY-MM-DD)"
                            value={replacementDate}
                            onChangeText={setReplacementDate}
                            placeholderTextColor="#94A3B8"
                          />
                          {!canReplaceSameDay && (
                            <Text style={styles.cutoffWarning}>
                              ⚠️ Same-day replacement cutoff (4 AM) has passed
                            </Text>
                          )}
                        </View>
                      )}

                      {/* Amount Input for Refund/Credit */}
                      {(resolutionType === 'refund' || resolutionType === 'credit') && (
                        <View style={styles.resolutionFieldContainer}>
                          <Text style={styles.resolutionSectionTitle}>
                            {resolutionType === 'refund' ? 'Refund Amount' : 'Credit Amount'}
                          </Text>
                          <View style={styles.amountInputContainer}>
                            <Text style={styles.currencySymbol}>₹</Text>
                            <TextInput
                              style={styles.amountInput}
                              placeholder="0"
                              value={resolutionAmount}
                              onChangeText={setResolutionAmount}
                              keyboardType="numeric"
                              placeholderTextColor="#94A3B8"
                            />
                          </View>
                          {resolutionType === 'refund' && ticketDetails?.order && (
                            <Text style={styles.amountHint}>
                              Max refund: ₹{ticketDetails.order.total_amount}
                            </Text>
                          )}
                          {resolutionType === 'credit' && (
                            <Text style={styles.amountHint}>
                              Goodwill credit will be added to customer wallet
                            </Text>
                          )}
                        </View>
                      )}

                      {/* Resolution Notes */}
                      <View style={styles.resolutionFieldContainer}>
                        <Text style={styles.resolutionSectionTitle}>Resolution Notes *</Text>
                        <TextInput
                          style={[styles.resolutionInput, { minHeight: 100 }]}
                          placeholder="Describe the resolution and reason..."
                          value={resolutionNotes}
                          onChangeText={setResolutionNotes}
                          multiline
                          numberOfLines={4}
                          textAlignVertical="top"
                          placeholderTextColor="#94A3B8"
                        />
                      </View>
                    </>
                  )}
                </ScrollView>

                {/* Process Button */}
                <View style={styles.resolutionFooter}>
                  <TouchableOpacity
                    style={[styles.processButton, updating && { opacity: 0.6 }]}
                    onPress={handleProcessResolution}
                    disabled={updating || loadingDetails}
                  >
                    {updating ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.processButtonText}>
                        {resolutionType === 'replacement' && '🔄 Schedule Replacement'}
                        {resolutionType === 'refund' && '💰 Process Refund'}
                        {resolutionType === 'credit' && '🎁 Add Credit'}
                        {resolutionType === 'no_action' && '✅ Resolve Ticket'}
                        {resolutionType === 'other' && '✅ Resolve Ticket'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        )}
      </Modal>

      {/* Full Image Viewer Modal */}
      <Modal visible={!!selectedImage} animationType="fade" transparent>
        <View style={styles.imageViewerOverlay}>
          <TouchableOpacity
            style={styles.imageViewerClose}
            onPress={() => setSelectedImage(null)}
          >
            <Text style={styles.imageViewerCloseText}>✕</Text>
          </TouchableOpacity>
          {selectedImage && (
            <>
              <Image
                source={{ uri: selectedImage }}
                style={styles.imageViewerImage}
                resizeMode="contain"
              />
              <TouchableOpacity
                style={styles.imageViewerOpenButton}
                onPress={() => Linking.openURL(selectedImage)}
              >
                <Text style={styles.imageViewerOpenText}>Open in Browser</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Modal>
    </AppLayout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  statsRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 10,
  },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#1E293B',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterScroll: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#F0FDFA',
    borderColor: '#0D9488',
  },
  filterChipIcon: {
    marginRight: 4,
  },
  filterChipText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#0D9488',
    fontWeight: '600',
  },
  ticketList: {
    paddingHorizontal: 16,
  },
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ticketHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ticketNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0D9488',
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  ticketSubject: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 8,
  },
  ticketMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ticketCustomer: {
    fontSize: 13,
    color: '#64748B',
  },
  ticketDate: {
    fontSize: 12,
    color: '#94A3B8',
  },
  assignedText: {
    fontSize: 12,
    color: '#0D9488',
    marginTop: 6,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '90%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0D9488',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 2,
  },
  actionsButton: {
    padding: 8,
    marginRight: 8,
  },
  actionsButtonText: {
    fontSize: 20,
  },
  closeButton: {
    fontSize: 24,
    color: '#94A3B8',
    padding: 4,
  },
  ticketInfo: {
    padding: 16,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  ticketInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  ticketInfoLabel: {
    fontSize: 13,
    color: '#64748B',
    width: 80,
  },
  ticketInfoValue: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '500',
    flex: 1,
  },
  statusBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusTextSmall: {
    fontSize: 11,
    fontWeight: '600',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 20,
  },
  messageCard: {
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
    maxWidth: '85%',
  },
  messageCustomer: {
    backgroundColor: '#F0FDFA',
    alignSelf: 'flex-start',
  },
  messageAdmin: {
    backgroundColor: '#EFF6FF',
    alignSelf: 'flex-end',
  },
  messageResolution: {
    backgroundColor: '#ECFDF5',
    alignSelf: 'stretch',
    maxWidth: '100%',
  },
  messageSender: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
    color: '#1E293B',
    lineHeight: 20,
  },
  messageTime: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 6,
  },
  replyContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 10,
  },
  replyInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1E293B',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  actionsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  actionsModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  actionsModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 16,
    textAlign: 'center',
  },
  resolutionContainer: {
    marginBottom: 16,
  },
  resolutionLabel: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 8,
  },
  resolutionInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: '#1E293B',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actionsGrid: {
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 10,
  },
  actionButtonIcon: {
    fontSize: 20,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  cancelButton: {
    marginTop: 16,
    padding: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '500',
  },
  // Attachment styles
  attachmentsSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  attachmentsSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 10,
  },
  attachmentsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  attachmentThumb: {
    width: 80,
    alignItems: 'center',
  },
  attachmentImage: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
  },
  attachmentName: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
    width: '100%',
  },
  // Image viewer modal styles
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 12,
  },
  imageViewerCloseText: {
    fontSize: 28,
    color: '#FFFFFF',
    fontWeight: '300',
  },
  imageViewerImage: {
    width: '90%',
    height: '70%',
  },
  imageViewerOpenButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#0D9488',
    borderRadius: 10,
  },
  imageViewerOpenText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Resolution modal styles
  resolutionInfoCard: {
    backgroundColor: '#F0FDFA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  resolutionInfoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0D9488',
    marginBottom: 8,
  },
  resolutionInfoText: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 4,
  },
  resolutionSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 10,
    marginTop: 4,
  },
  resolutionTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  resolutionTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  resolutionTypeButtonActive: {
    backgroundColor: '#F0FDFA',
    borderColor: '#0D9488',
  },
  resolutionTypeIcon: {
    fontSize: 18,
  },
  resolutionTypeText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
  },
  resolutionTypeTextActive: {
    color: '#0D9488',
    fontWeight: '600',
  },
  resolutionFieldContainer: {
    marginBottom: 16,
  },
  dateButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  dateButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  dateButtonActive: {
    backgroundColor: '#0D9488',
    borderColor: '#0D9488',
  },
  dateButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
  },
  dateButtonTextActive: {
    color: '#FFFFFF',
  },
  cutoffWarning: {
    fontSize: 12,
    color: '#F59E0B',
    marginTop: 8,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
  },
  currencySymbol: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0D9488',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '600',
    color: '#1E293B',
    paddingVertical: 14,
  },
  amountHint: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 8,
  },
  resolutionFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  processButton: {
    backgroundColor: '#0D9488',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  processButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default AdminSupportScreen;
