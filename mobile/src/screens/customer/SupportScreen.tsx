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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { AppLayout } from '../../components/AppLayout';
import { AppBar } from '../../components/AppBar';
import { EmptyState } from '../../components/EmptyState';
import { useAuthStore } from '../../store/authStore';
import { useToast } from '../../components/Toast';
import {
  SupportService,
  SupportTicket,
  TicketMessage,
  TicketCategory,
  TicketAttachment,
} from '../../services/api/support';

export interface SupportPrefill {
  category?: TicketCategory;
  subject?: string;
  description?: string;
}

interface SupportScreenProps {
  onBack: () => void;
  prefill?: SupportPrefill;
}

const CATEGORIES: { value: TicketCategory; label: string; icon: string }[] = [
  { value: 'delivery_issue', label: 'Delivery Issue', icon: '🚚' },
  { value: 'product_quality', label: 'Product Quality', icon: '🥛' },
  { value: 'payment', label: 'Payment Issue', icon: '💳' },
  { value: 'refund', label: 'Refund Request', icon: '💰' },
  { value: 'subscription', label: 'Subscription', icon: '📋' },
  { value: 'address_change', label: 'Address Change', icon: '📍' },
  { value: 'other', label: 'Other', icon: '❓' },
];

// Subject suggestions based on category
const SUBJECT_SUGGESTIONS: Record<TicketCategory, string[]> = {
  delivery_issue: [
    'Delivery not received today',
    'Delivery arrived late',
    'Wrong quantity delivered',
    'Delivery left at wrong location',
    'Missed delivery without notification',
  ],
  product_quality: [
    'Milk tastes different/spoiled',
    'Product packaging was damaged',
    'Found foreign particles in product',
    'Product expired before use',
    'Cream content seems low',
  ],
  payment: [
    'Payment failed but wallet debited',
    'Double charged for recharge',
    'Transaction pending for too long',
    'Unable to add money to wallet',
    'Payment receipt not received',
  ],
  refund: [
    'Request refund for cancelled order',
    'Request refund for spoiled product',
    'Refund for duplicate payment',
    'Refund for undelivered order',
    'Close account and refund balance',
  ],
  subscription: [
    'Unable to pause subscription',
    'Subscription not starting on time',
    'Want to change delivery quantity',
    'Unable to cancel subscription',
    'Subscription showing wrong dates',
  ],
  address_change: [
    'Request to change my delivery address',
    'Request to update society/building',
    'Request to change flat/unit number',
    'Request to delete an address',
    'Moving to a new location',
  ],
  other: [
    'Change my phone number',
    'General feedback/suggestion',
    'Account related query',
    'App not working properly',
    'Other issue',
  ],
};

export const SupportScreen: React.FC<SupportScreenProps> = ({ onBack, prefill }) => {
  const { user } = useAuthStore();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // New ticket modal
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [newCategory, setNewCategory] = useState<TicketCategory>(prefill?.category || 'other');
  const [newSubject, setNewSubject] = useState(prefill?.subject || '');
  const [newDescription, setNewDescription] = useState(prefill?.description || '');
  const [newPhotos, setNewPhotos] = useState<Array<{ uri: string; fileName: string }>>([]);
  const [creating, setCreating] = useState(false);

  // Reply
  const [replyText, setReplyText] = useState('');
  const [replyPhotos, setReplyPhotos] = useState<Array<{ uri: string; fileName: string }>>([]);
  const [sending, setSending] = useState(false);

  // Handle prefill data - auto-open new ticket modal
  useEffect(() => {
    if (prefill?.category) {
      setShowNewTicket(true);
    }
  }, [prefill]);

  const loadTickets = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await SupportService.getTickets(user.id);
      setTickets(data);
    } catch (error) {
      console.error('Error loading tickets:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadTickets();
  };

  const handleViewTicket = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setLoadingMessages(true);
    try {
      const [msgs, atts] = await Promise.all([
        SupportService.getMessages(ticket.id),
        SupportService.getAttachments(ticket.id),
      ]);
      setMessages(msgs);
      setAttachments(atts);
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handlePickPhoto = async (forReply: boolean = false) => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const fileName = asset.fileName || `photo-${Date.now()}.jpg`;
        const photo = { uri: asset.uri, fileName };

        if (forReply) {
          setReplyPhotos(prev => [...prev, photo]);
        } else {
          setNewPhotos(prev => [...prev, photo]);
        }
      }
    } catch (error) {
      console.error('Error picking photo:', error);
      Alert.alert('Error', 'Failed to pick photo');
    }
  };

  const handleRemovePhoto = (index: number, forReply: boolean = false) => {
    if (forReply) {
      setReplyPhotos(prev => prev.filter((_, i) => i !== index));
    } else {
      setNewPhotos(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleCreateTicket = async () => {
    if (!user?.id) return;
    if (!newSubject.trim() || !newDescription.trim()) {
      Alert.alert('Missing Information', 'Please fill in all required fields');
      return;
    }

    setCreating(true);
    try {
      await SupportService.createTicket(user.id, {
        category: newCategory,
        priority: 'medium', // Auto-assigned, admins can adjust based on issue
        subject: newSubject.trim(),
        description: newDescription.trim(),
        attachments: newPhotos,
      });
      toast.show('Ticket created successfully!', { type: 'success' });
      setShowNewTicket(false);
      setNewSubject('');
      setNewDescription('');
      setNewCategory('other');
      setNewPhotos([]);
      loadTickets();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create ticket');
    } finally {
      setCreating(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedTicket || !user?.id || !replyText.trim()) return;

    setSending(true);
    try {
      await SupportService.addMessage(selectedTicket.id, user.id, 'customer', replyText.trim());

      // Upload photos if any
      if (replyPhotos.length > 0) {
        await SupportService.addAttachments(selectedTicket.id, user.id, replyPhotos);
      }

      setReplyText('');
      setReplyPhotos([]);

      const [msgs, atts] = await Promise.all([
        SupportService.getMessages(selectedTicket.id),
        SupportService.getAttachments(selectedTicket.id),
      ]);
      setMessages(msgs);
      setAttachments(atts);

      toast.show('Message sent!', { type: 'success' });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return '#3B82F6';
      case 'in_progress': return '#F59E0B';
      case 'waiting_customer': return '#8B5CF6';
      case 'resolved': return '#10B981';
      case 'closed': return '#64748B';
      case 'escalated': return '#EF4444';
      default: return '#64748B';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'open': return 'Open';
      case 'in_progress': return 'In Progress';
      case 'waiting_customer': return 'Awaiting Reply';
      case 'resolved': return 'Resolved';
      case 'closed': return 'Closed';
      case 'escalated': return 'Escalated';
      default: return status;
    }
  };

  const getCategoryIcon = (category: string) => {
    return CATEGORIES.find(c => c.value === category)?.icon || '❓';
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <AppLayout>
        <AppBar title="Support" onBack={onBack} variant="surface" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0D9488" />
        </View>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <AppBar title="Support" onBack={onBack} variant="surface" />

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Header Card */}
        <LinearGradient
          colors={['#0D9488', '#14B8A6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerCard}
        >
          <Text style={styles.headerTitle}>Need Help?</Text>
          <Text style={styles.headerSubtitle}>
            We're here to assist you with any issues
          </Text>
          <TouchableOpacity
            style={styles.newTicketButton}
            onPress={() => setShowNewTicket(true)}
          >
            <Text style={styles.newTicketButtonText}>+ Create New Ticket</Text>
          </TouchableOpacity>
        </LinearGradient>

        {/* Tickets List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Tickets</Text>

          {tickets.length === 0 ? (
            <EmptyState
              icon="🎫"
              title="No Tickets"
              description="You haven't created any support tickets yet"
            />
          ) : (
            tickets.map(ticket => (
              <TouchableOpacity
                key={ticket.id}
                style={styles.ticketCard}
                onPress={() => handleViewTicket(ticket)}
              >
                <View style={styles.ticketHeader}>
                  <Text style={styles.ticketIcon}>{getCategoryIcon(ticket.category)}</Text>
                  <View style={styles.ticketInfo}>
                    <Text style={styles.ticketNumber}>#{ticket.ticketNumber}</Text>
                    <Text style={styles.ticketSubject} numberOfLines={1}>
                      {ticket.subject}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(ticket.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(ticket.status) }]}>
                      {getStatusLabel(ticket.status)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.ticketDate}>{formatDate(ticket.createdAt)}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* New Ticket Modal */}
      <Modal visible={showNewTicket} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Support Ticket</Text>
              <TouchableOpacity onPress={() => setShowNewTicket(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Category */}
              <Text style={styles.inputLabel}>Category *</Text>
              <View style={styles.categoryGrid}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.value}
                    style={[
                      styles.categoryOption,
                      newCategory === cat.value && styles.categoryOptionActive,
                    ]}
                    onPress={() => setNewCategory(cat.value)}
                  >
                    <Text style={styles.categoryIcon}>{cat.icon}</Text>
                    <Text style={[
                      styles.categoryLabel,
                      newCategory === cat.value && styles.categoryLabelActive,
                    ]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Subject */}
              <Text style={styles.inputLabel}>Subject *</Text>

              {/* Subject Suggestions */}
              <View style={styles.suggestionsContainer}>
                <Text style={styles.suggestionsLabel}>Quick select:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestionsScroll}>
                  {SUBJECT_SUGGESTIONS[newCategory].map((suggestion, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.suggestionChip,
                        newSubject === suggestion && styles.suggestionChipActive,
                      ]}
                      onPress={() => setNewSubject(suggestion)}
                    >
                      <Text style={[
                        styles.suggestionChipText,
                        newSubject === suggestion && styles.suggestionChipTextActive,
                      ]}>
                        {suggestion}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <TextInput
                style={styles.input}
                placeholder="Or type your own subject..."
                value={newSubject}
                onChangeText={setNewSubject}
                placeholderTextColor="#94A3B8"
              />

              {/* Description */}
              <Text style={styles.inputLabel}>Description *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Provide more details about your issue..."
                value={newDescription}
                onChangeText={setNewDescription}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                placeholderTextColor="#94A3B8"
              />

              {/* Photo Attachments */}
              <Text style={styles.inputLabel}>
                Attachments {newPhotos.length > 0 && `(${newPhotos.length})`}
              </Text>
              <View style={styles.photosContainer}>
                {newPhotos.map((photo, index) => (
                  <View key={index} style={styles.photoPreview}>
                    <Image source={{ uri: photo.uri }} style={styles.photoImage} />
                    <TouchableOpacity
                      style={styles.photoRemove}
                      onPress={() => handleRemovePhoto(index, false)}
                    >
                      <Text style={styles.photoRemoveText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {newPhotos.length < 5 && (
                  <TouchableOpacity
                    style={styles.photoAddButton}
                    onPress={() => handlePickPhoto(false)}
                  >
                    <Text style={styles.photoAddIcon}>📷</Text>
                    <Text style={styles.photoAddText}>Add Photo</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.photoHint}>
                Add up to 5 photos to help explain your issue
              </Text>
            </ScrollView>

            <TouchableOpacity
              style={[styles.submitButton, creating && styles.buttonDisabled]}
              onPress={handleCreateTicket}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>Submit Ticket</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Ticket Detail Modal */}
      <Modal visible={!!selectedTicket} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>#{selectedTicket?.ticketNumber}</Text>
                <Text style={styles.modalSubtitle}>{selectedTicket?.subject}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedTicket(null)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Status */}
            {selectedTicket && (
              <View style={[styles.statusBar, { backgroundColor: getStatusColor(selectedTicket.status) + '15' }]}>
                <Text style={[styles.statusBarText, { color: getStatusColor(selectedTicket.status) }]}>
                  Status: {getStatusLabel(selectedTicket.status)}
                </Text>
              </View>
            )}

            {/* Messages */}
            <ScrollView style={styles.messagesContainer}>
              {loadingMessages ? (
                <ActivityIndicator style={{ marginTop: 20 }} color="#0D9488" />
              ) : (
                <>
                  {/* Original description */}
                  <View style={[styles.messageCard, styles.messageCustomer]}>
                    <Text style={styles.messageSender}>You</Text>
                    <Text style={styles.messageText}>{selectedTicket?.description}</Text>
                    <Text style={styles.messageTime}>
                      {selectedTicket && formatDate(selectedTicket.createdAt)}
                    </Text>
                  </View>

                  {/* Attachments */}
                  {attachments.length > 0 && (
                    <View style={styles.attachmentsSection}>
                      <Text style={styles.attachmentsSectionTitle}>Attachments</Text>
                      <View style={styles.attachmentsGrid}>
                        {attachments.map(att => (
                          <TouchableOpacity
                            key={att.id}
                            style={styles.attachmentThumb}
                            onPress={() => {
                              // Could open in a modal or external viewer
                              Alert.alert('Photo', att.fileName, [
                                { text: 'OK' }
                              ]);
                            }}
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
                        {msg.senderRole === 'customer' ? 'You' : msg.senderName || 'Support'}
                      </Text>
                      <Text style={styles.messageText}>{msg.message}</Text>
                      <Text style={styles.messageTime}>{formatDate(msg.createdAt)}</Text>
                    </View>
                  ))}

                  {/* Resolution notes */}
                  {selectedTicket?.resolutionNotes && (
                    <View style={[styles.messageCard, styles.messageResolution]}>
                      <Text style={styles.messageSender}>Resolution</Text>
                      <Text style={styles.messageText}>{selectedTicket.resolutionNotes}</Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>

            {/* Reply input */}
            {selectedTicket && !['resolved', 'closed'].includes(selectedTicket.status) && (
              <View style={styles.replySection}>
                {/* Reply photos preview */}
                {replyPhotos.length > 0 && (
                  <View style={styles.replyPhotosContainer}>
                    {replyPhotos.map((photo, index) => (
                      <View key={index} style={styles.replyPhotoPreview}>
                        <Image source={{ uri: photo.uri }} style={styles.replyPhotoImage} />
                        <TouchableOpacity
                          style={styles.photoRemove}
                          onPress={() => handleRemovePhoto(index, true)}
                        >
                          <Text style={styles.photoRemoveText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.replyContainer}>
                  <TouchableOpacity
                    style={styles.photoButton}
                    onPress={() => handlePickPhoto(true)}
                    disabled={replyPhotos.length >= 3}
                  >
                    <Text style={styles.photoButtonIcon}>📷</Text>
                  </TouchableOpacity>

                  <TextInput
                    style={styles.replyInput}
                    placeholder="Type your message..."
                    value={replyText}
                    onChangeText={setReplyText}
                    placeholderTextColor="#94A3B8"
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
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </AppLayout>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  headerCard: {
    margin: 16,
    padding: 24,
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 16,
  },
  newTicketButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  newTicketButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0D9488',
  },
  section: {
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
  },
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  ticketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ticketIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  ticketInfo: {
    flex: 1,
  },
  ticketNumber: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 2,
  },
  ticketSubject: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  ticketDate: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 8,
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
    maxHeight: '90%',
    minHeight: '70%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 4,
  },
  closeButton: {
    fontSize: 24,
    color: '#64748B',
    padding: 4,
  },
  modalBody: {
    padding: 20,
    maxHeight: 400,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 8,
    marginTop: 16,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categoryOptionActive: {
    backgroundColor: '#F0FDFA',
    borderColor: '#0D9488',
  },
  categoryIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  categoryLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  categoryLabelActive: {
    color: '#0D9488',
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  priorityLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  suggestionsContainer: {
    marginBottom: 8,
  },
  suggestionsLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 8,
  },
  suggestionsScroll: {
    flexGrow: 0,
  },
  suggestionChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  suggestionChipActive: {
    backgroundColor: '#F0FDFA',
    borderColor: '#0D9488',
  },
  suggestionChipText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  suggestionChipTextActive: {
    color: '#0D9488',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#1E293B',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#0D9488',
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  statusBar: {
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  statusBarText: {
    fontSize: 13,
    fontWeight: '600',
  },
  messagesContainer: {
    flex: 1,
    padding: 16,
  },
  messageCard: {
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
    maxWidth: '85%',
  },
  messageCustomer: {
    backgroundColor: '#F0FDFA',
    alignSelf: 'flex-end',
  },
  messageAdmin: {
    backgroundColor: '#F1F5F9',
    alignSelf: 'flex-start',
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
  replySection: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  replyPhotosContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  replyPhotoPreview: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  replyPhotoImage: {
    width: '100%',
    height: '100%',
  },
  replyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  photoButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoButtonIcon: {
    fontSize: 20,
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
  },
  sendButton: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 20,
    paddingVertical: 10,
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
  photosContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  photoPreview: {
    width: 80,
    height: 80,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#F1F5F9',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoRemoveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  photoAddButton: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoAddIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  photoAddText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  photoHint: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 8,
  },
  attachmentsSection: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  attachmentsSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 12,
  },
  attachmentsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  attachmentThumb: {
    width: 80,
    height: 100,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
  },
  attachmentImage: {
    width: '100%',
    height: 80,
  },
  attachmentName: {
    fontSize: 10,
    color: '#64748B',
    padding: 4,
    textAlign: 'center',
  },
});

export default SupportScreen;
