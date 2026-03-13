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
  Linking,
} from 'react-native';
import { AppLayout } from '../../components/AppLayout';
import { AppBar } from '../../components/AppBar';
import { EmptyState } from '../../components/EmptyState';
import { ErrorBanner } from '../../components/ErrorBanner';
import { useToast } from '../../components/Toast';
import { supabase } from '../../services/supabase';
import { theme } from '../../theme';
import { Badge } from '../../components/ui';
import { SkeletonList } from '../../components/Skeleton';
import { getAuthUserId } from '../../utils/auth';

interface PendingAddressChangesScreenProps {
  onBack: () => void;
}

interface AddressChangeRequest {
  ticket_id: string;
  ticket_number: string;
  user_id: string;
  customer_name: string;
  customer_phone: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
  current_address_id: string | null;
  current_society: string | null;
  current_tower: string | null;
  current_unit: string | null;
}

interface Society {
  id: string;
  name: string;
  city: string;
}

interface Tower {
  id: string;
  name: string;
}

interface Unit {
  id: string;
  number: string;
  floor: number;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#DC2626',
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#64748B',
};

const STATUS_COLORS: Record<string, string> = {
  open: '#3B82F6',
  in_progress: '#F59E0B',
  waiting_customer: '#8B5CF6',
  escalated: '#EF4444',
};

export const PendingAddressChangesScreen: React.FC<PendingAddressChangesScreenProps> = ({ onBack }) => {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<AddressChangeRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<AddressChangeRequest | null>(null);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [processing, setProcessing] = useState(false);

  // New address selection
  const [societies, setSocieties] = useState<Society[]>([]);
  const [towers, setTowers] = useState<Tower[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedSociety, setSelectedSociety] = useState<string>('');
  const [selectedTower, setSelectedTower] = useState<string>('');
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [loadingSocieties, setLoadingSocieties] = useState(false);
  const [loadingTowers, setLoadingTowers] = useState(false);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [resolution, setResolution] = useState('');

  useEffect(() => {
    loadRequests();
    loadSocieties();
  }, []);

  // Load towers when society changes
  useEffect(() => {
    if (selectedSociety) {
      loadTowers(selectedSociety);
      setSelectedTower('');
      setSelectedUnit('');
      setUnits([]);
    }
  }, [selectedSociety]);

  // Load units when tower changes
  useEffect(() => {
    if (selectedTower) {
      loadUnits(selectedTower);
      setSelectedUnit('');
    }
  }, [selectedTower]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('pending_address_changes')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setRequests(data || []);
    } catch (err: any) {
      console.error('Error loading address change requests:', err);
      setError(err.message || 'Failed to load requests');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadSocieties = async () => {
    try {
      setLoadingSocieties(true);
      const { data, error } = await supabase
        .from('societies')
        .select('id, name, city')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setSocieties(data || []);
    } catch (err) {
      console.error('Error loading societies:', err);
    } finally {
      setLoadingSocieties(false);
    }
  };

  const loadTowers = async (societyId: string) => {
    try {
      setLoadingTowers(true);
      const { data, error } = await supabase
        .from('society_towers')
        .select('id, name')
        .eq('society_id', societyId)
        .order('name');

      if (error) throw error;
      setTowers(data || []);
    } catch (err) {
      console.error('Error loading towers:', err);
    } finally {
      setLoadingTowers(false);
    }
  };

  const loadUnits = async (towerId: string) => {
    try {
      setLoadingUnits(true);
      const { data, error } = await supabase
        .from('tower_units')
        .select('id, number, floor')
        .eq('tower_id', towerId)
        .order('floor')
        .order('number');

      if (error) throw error;
      setUnits(data || []);
    } catch (err) {
      console.error('Error loading units:', err);
    } finally {
      setLoadingUnits(false);
    }
  };

  const handleOpenProcess = (request: AddressChangeRequest) => {
    setSelectedRequest(request);
    setSelectedSociety('');
    setSelectedTower('');
    setSelectedUnit('');
    setResolution('');
    setShowProcessModal(true);
  };

  const handleApproveAddressChange = async () => {
    if (!selectedRequest || !selectedUnit) {
      Alert.alert('Error', 'Please select the new address.');
      return;
    }

    try {
      setProcessing(true);

      // Get selected unit details for address creation
      const unit = units.find(u => u.id === selectedUnit);
      const tower = towers.find(t => t.id === selectedTower);
      const society = societies.find(s => s.id === selectedSociety);

      if (!unit || !tower || !society) {
        throw new Error('Invalid address selection');
      }

      // 1. Check if user already has an address for this unit
      const { data: existingAddress } = await supabase
        .from('addresses')
        .select('id')
        .eq('user_id', selectedRequest.user_id)
        .eq('unit_id', selectedUnit)
        .maybeSingle();

      let newAddressId: string;

      if (existingAddress) {
        // Update existing address to be default
        newAddressId = existingAddress.id;
      } else {
        // 2. Create new address for the user
        const { data: newAddress, error: createError } = await supabase
          .from('addresses')
          .insert({
            user_id: selectedRequest.user_id,
            society_id: selectedSociety,
            society_name: society.name,
            tower_id: selectedTower,
            unit_id: selectedUnit,
            is_default: false,
          })
          .select('id')
          .single();

        if (createError) throw createError;
        newAddressId = newAddress.id;
      }

      // 3. Set all other addresses for this user as non-default
      await supabase
        .from('addresses')
        .update({ is_default: false })
        .eq('user_id', selectedRequest.user_id);

      // 4. Set the new address as default
      await supabase
        .from('addresses')
        .update({ is_default: true })
        .eq('id', newAddressId);

      // 5. Update all active subscriptions to use the new address
      const { error: subError } = await supabase
        .from('subscriptions')
        .update({ address_id: newAddressId })
        .eq('user_id', selectedRequest.user_id)
        .eq('status', 'active');

      if (subError) {
        console.error('Warning: Could not update subscription addresses:', subError);
      }

      // 6. Mark the support ticket as resolved
      const resolutionNote = resolution || `Address changed to: ${society.name}, ${tower.name}, Unit ${unit.number} (Floor ${unit.floor})`;
      
      const { error: ticketError } = await supabase
        .from('support_tickets')
        .update({
          status: 'resolved',
          resolution: resolutionNote,
          resolution_type: 'no_action',
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedRequest.ticket_id);

      if (ticketError) throw ticketError;

      // 7. Add resolution message
      const adminUserId = await getAuthUserId();

      await supabase.from('ticket_messages').insert({
        ticket_id: selectedRequest.ticket_id,
        user_id: adminUserId,
        message: `✅ Address change approved!\n\nNew address: ${society.name}, ${tower.name}, Unit ${unit.number} (Floor ${unit.floor})\n\nYour subscriptions have been updated to deliver to this address.`,
        is_internal: false,
      });

      toast.show('Address change approved!', { type: 'success' });
      setShowProcessModal(false);
      setSelectedRequest(null);
      loadRequests();
    } catch (err: any) {
      console.error('Error approving address change:', err);
      Alert.alert('Error', err.message || 'Failed to process address change');
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectRequest = async () => {
    if (!selectedRequest) return;

    Alert.alert(
      'Reject Request',
      'Are you sure you want to reject this address change request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessing(true);

              // Mark the ticket as resolved with rejection
              const { error: ticketError } = await supabase
                .from('support_tickets')
                .update({
                  status: 'closed',
                  resolution: resolution || 'Address change request rejected.',
                  resolution_type: 'no_action',
                  resolved_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', selectedRequest.ticket_id);

              if (ticketError) throw ticketError;

              // Add rejection message
              const adminUserId = await getAuthUserId();

              await supabase.from('ticket_messages').insert({
                ticket_id: selectedRequest.ticket_id,
                user_id: adminUserId,
                message: `❌ Address change request rejected.\n\n${resolution || 'Please contact support for more information.'}`,
                is_internal: false,
              });

              toast.show('Request rejected', { type: 'info' });
              setShowProcessModal(false);
              setSelectedRequest(null);
              loadRequests();
            } catch (err: any) {
              console.error('Error rejecting request:', err);
              Alert.alert('Error', err.message || 'Failed to reject request');
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleCallCustomer = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderRequestCard = (request: AddressChangeRequest) => (
    <TouchableOpacity
      key={request.ticket_id}
      style={styles.requestCard}
      onPress={() => handleOpenProcess(request)}
      activeOpacity={0.7}
    >
      <View style={styles.requestHeader}>
        <View style={styles.ticketInfo}>
          <Text style={styles.ticketNumber}>#{request.ticket_number}</Text>
          <Badge
            text={request.priority}
            variant={request.priority === 'urgent' || request.priority === 'high' ? 'error' : 'warning'}
            size="sm"
          />
          <Badge
            text={request.status.replace('_', ' ')}
            variant={request.status === 'open' ? 'info' : 'warning'}
            size="sm"
          />
        </View>
        <Text style={styles.requestDate}>{formatDate(request.created_at)}</Text>
      </View>

      <View style={styles.customerInfo}>
        <Text style={styles.customerName}>{request.customer_name}</Text>
        <TouchableOpacity
          style={styles.phoneButton}
          onPress={() => handleCallCustomer(request.customer_phone)}
        >
          <Text style={styles.phoneText}>📞 {request.customer_phone}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.currentAddress}>
        <Text style={styles.addressLabel}>Current Address:</Text>
        <Text style={styles.addressText}>
          {request.current_society
            ? `${request.current_society}, ${request.current_tower || 'N/A'}, Unit ${request.current_unit || 'N/A'}`
            : 'No address on file'}
        </Text>
      </View>

      <View style={styles.requestContent}>
        <Text style={styles.requestSubject}>{request.subject}</Text>
        <Text style={styles.requestDescription} numberOfLines={3}>
          {request.description}
        </Text>
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.tapToProcess}>Tap to process →</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <AppLayout>
      <AppBar title="Address Change Requests" onBack={onBack} variant="surface" />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadRequests();
            }}
            colors={[theme.colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{requests.length}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#FEF3C7' }]}>
            <Text style={[styles.statValue, { color: '#F59E0B' }]}>
              {requests.filter(r => r.priority === 'urgent' || r.priority === 'high').length}
            </Text>
            <Text style={styles.statLabel}>High Priority</Text>
          </View>
        </View>

        {error && <ErrorBanner message={error} onRetry={loadRequests} />}

        {loading ? (
          <SkeletonList count={3} showAvatar showBadges />
        ) : requests.length === 0 ? (
          <EmptyState
            icon="📍"
            title="No Pending Requests"
            description="All address change requests have been processed."
          />
        ) : (
          <View style={styles.requestsList}>
            {requests.map(renderRequestCard)}
          </View>
        )}
      </ScrollView>

      {/* Process Modal */}
      <Modal
        visible={showProcessModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowProcessModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Process Address Change</Text>
              <TouchableOpacity onPress={() => setShowProcessModal(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {/* Customer Info */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Customer</Text>
                <Text style={styles.modalCustomerName}>{selectedRequest?.customer_name}</Text>
                <Text style={styles.modalCustomerPhone}>{selectedRequest?.customer_phone}</Text>
              </View>

              {/* Request Details */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Request Details</Text>
                <Text style={styles.modalRequestText}>{selectedRequest?.description}</Text>
              </View>

              {/* Current Address */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Current Address</Text>
                <Text style={styles.modalAddressText}>
                  {selectedRequest?.current_society
                    ? `${selectedRequest.current_society}, ${selectedRequest.current_tower || 'N/A'}, Unit ${selectedRequest.current_unit || 'N/A'}`
                    : 'No address on file'}
                </Text>
              </View>

              {/* New Address Selection */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Select New Address</Text>

                {/* Society Picker */}
                <Text style={styles.pickerLabel}>Society</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
                  {loadingSocieties ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    societies.map((society) => (
                      <TouchableOpacity
                        key={society.id}
                        style={[
                          styles.pickerOption,
                          selectedSociety === society.id && styles.pickerOptionSelected,
                        ]}
                        onPress={() => setSelectedSociety(society.id)}
                      >
                        <Text
                          style={[
                            styles.pickerOptionText,
                            selectedSociety === society.id && styles.pickerOptionTextSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {society.name}
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>

                {/* Tower Picker */}
                {selectedSociety && (
                  <>
                    <Text style={styles.pickerLabel}>Tower/Building</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
                      {loadingTowers ? (
                        <ActivityIndicator size="small" color={theme.colors.primary} />
                      ) : (
                        towers.map((tower) => (
                          <TouchableOpacity
                            key={tower.id}
                            style={[
                              styles.pickerOption,
                              selectedTower === tower.id && styles.pickerOptionSelected,
                            ]}
                            onPress={() => setSelectedTower(tower.id)}
                          >
                            <Text
                              style={[
                                styles.pickerOptionText,
                                selectedTower === tower.id && styles.pickerOptionTextSelected,
                              ]}
                            >
                              {tower.name}
                            </Text>
                          </TouchableOpacity>
                        ))
                      )}
                    </ScrollView>
                  </>
                )}

                {/* Unit Picker */}
                {selectedTower && (
                  <>
                    <Text style={styles.pickerLabel}>Unit</Text>
                    <View style={styles.unitsGrid}>
                      {loadingUnits ? (
                        <ActivityIndicator size="small" color={theme.colors.primary} />
                      ) : (
                        units.map((unit) => (
                          <TouchableOpacity
                            key={unit.id}
                            style={[
                              styles.unitOption,
                              selectedUnit === unit.id && styles.unitOptionSelected,
                            ]}
                            onPress={() => setSelectedUnit(unit.id)}
                          >
                            <Text
                              style={[
                                styles.unitOptionText,
                                selectedUnit === unit.id && styles.unitOptionTextSelected,
                              ]}
                            >
                              {unit.number}
                            </Text>
                            <Text style={styles.unitFloorText}>F{unit.floor}</Text>
                          </TouchableOpacity>
                        ))
                      )}
                    </View>
                  </>
                )}
              </View>

              {/* Resolution Notes */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Resolution Notes (Optional)</Text>
                <TextInput
                  style={styles.resolutionInput}
                  placeholder="Add notes about this address change..."
                  value={resolution}
                  onChangeText={setResolution}
                  multiline
                  numberOfLines={3}
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </ScrollView>

            {/* Action Buttons */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.rejectButton]}
                onPress={handleRejectRequest}
                disabled={processing}
              >
                <Text style={styles.rejectButtonText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.approveButton,
                  !selectedUnit && styles.buttonDisabled,
                ]}
                onPress={handleApproveAddressChange}
                disabled={processing || !selectedUnit}
              >
                {processing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.approveButtonText}>Approve & Update</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
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
  scrollContent: {
    padding: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  requestsList: {
    gap: 12,
  },
  requestCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  ticketInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ticketNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  requestDate: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  customerInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  phoneButton: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  phoneText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '500',
  },
  currentAddress: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  addressLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  addressText: {
    fontSize: 14,
    color: '#78350F',
  },
  requestContent: {
    marginBottom: 8,
  },
  requestSubject: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
  },
  requestDescription: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    paddingTop: 8,
    alignItems: 'flex-end',
  },
  tapToProcess: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '500',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
  },
  modalCloseButton: {
    fontSize: 24,
    color: theme.colors.textSecondary,
  },
  modalScroll: {
    padding: 20,
    maxHeight: 500,
  },
  modalSection: {
    marginBottom: 20,
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  modalCustomerName: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  modalCustomerPhone: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  modalRequestText: {
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 22,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
  },
  modalAddressText: {
    fontSize: 14,
    color: theme.colors.text,
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 8,
  },
  pickerLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
    marginBottom: 8,
    marginTop: 12,
  },
  pickerRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  pickerOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    marginRight: 8,
  },
  pickerOptionSelected: {
    backgroundColor: theme.colors.primary,
  },
  pickerOptionText: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '500',
  },
  pickerOptionTextSelected: {
    color: '#FFFFFF',
  },
  unitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  unitOption: {
    width: 70,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  unitOptionSelected: {
    backgroundColor: theme.colors.primary,
  },
  unitOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  unitOptionTextSelected: {
    color: '#FFFFFF',
  },
  unitFloorText: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  resolutionInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: theme.colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectButton: {
    backgroundColor: '#FEE2E2',
  },
  rejectButtonText: {
    color: '#DC2626',
    fontWeight: '600',
    fontSize: 16,
  },
  approveButton: {
    backgroundColor: theme.colors.primary,
  },
  approveButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

export default PendingAddressChangesScreen;
