import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Share,
  Clipboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppLayout } from '../../components/AppLayout';
import { AppBar } from '../../components/AppBar';
import type { AdminScreenProps } from '../../navigation/types';
import { supabase } from '../../services/supabase';
import { useToast } from '../../components/Toast';

interface ActivationCode {
  id: string;
  code: string;
  created_at: string;
  expires_at: string | null;
  used: boolean;
  used_by: string | null;
  used_at: string | null;
  notes: string | null;
  user_name?: string;
}

export const ActivationCodesScreen: React.FC<AdminScreenProps<'ActivationCodes'>> = ({ navigation }) => {
  const { show: showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [codes, setCodes] = useState<ActivationCode[]>([]);
  const [filter, setFilter] = useState<'all' | 'active' | 'used' | 'expired'>('all');
  
  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCodeNotes, setNewCodeNotes] = useState('');
  const [expiryDays, setExpiryDays] = useState('30');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  const loadCodes = useCallback(async () => {
    try {
      let query = supabase
        .from('distributor_activation_codes')
        .select(`
          id,
          code,
          created_at,
          expires_at,
          used,
          used_by,
          used_at,
          notes
        `)
        .order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      // Get user names for used codes
      const usedByIds = data?.filter(c => c.used_by).map(c => c.used_by) || [];
      let userNames: Record<string, string> = {};
      
      if (usedByIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, name')
          .in('id', usedByIds);
        
        users?.forEach(u => {
          userNames[u.id] = u.name;
        });
      }

      const codesWithNames = data?.map(c => ({
        ...c,
        user_name: c.used_by ? userNames[c.used_by] : undefined,
      })) || [];

      setCodes(codesWithNames);
    } catch (error) {
      console.error('Error loading codes:', error);
      showToast('Failed to load activation codes', { type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadCodes();
  };

  const handleCreateCode = async () => {
    setCreating(true);
    try {
      const days = parseInt(expiryDays) || 30;
      const { data, error } = await supabase.rpc('create_activation_code', {
        p_notes: newCodeNotes || null,
        p_expires_in_days: days,
      });

      if (error) throw error;
      
      const newCode = data?.[0]?.code;
      if (newCode) {
        setGeneratedCode(newCode);
        showToast('✅ Activation code created!', { type: 'success' });
        loadCodes();
      }
    } catch (error: any) {
      console.error('Error creating code:', error);
      Alert.alert('Error', error.message || 'Failed to create activation code');
    } finally {
      setCreating(false);
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      await Clipboard.setString(code);
      showToast('📋 Code copied to clipboard!', { type: 'success' });
    } catch (_error) {
      showToast('Failed to copy', { type: 'error' });
    }
  };

  const handleShareCode = async (code: string) => {
    try {
      await Share.share({
        message: `Your DailiCart Distributor Activation Code is: ${code}\n\nUse this code when registering as a distributor on the DailiCart app.`,
        title: 'DailiCart Activation Code',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleDeleteCode = async (codeId: string, codeValue: string) => {
    Alert.alert(
      'Delete Code',
      `Are you sure you want to delete code ${codeValue}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('distributor_activation_codes')
                .delete()
                .eq('id', codeId);
              
              if (error) throw error;
              
              showToast('Code deleted', { type: 'success' });
              loadCodes();
            } catch (_error) {
              showToast('Failed to delete code', { type: 'error' });
            }
          },
        },
      ]
    );
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setGeneratedCode(null);
    setNewCodeNotes('');
    setExpiryDays('30');
  };

  const getFilteredCodes = () => {
    const now = new Date();
    return codes.filter(code => {
      switch (filter) {
        case 'active':
          return !code.used && (!code.expires_at || new Date(code.expires_at) > now);
        case 'used':
          return code.used;
        case 'expired':
          return !code.used && code.expires_at && new Date(code.expires_at) <= now;
        default:
          return true;
      }
    });
  };

  const getCodeStatus = (code: ActivationCode) => {
    if (code.used) return 'used';
    if (code.expires_at && new Date(code.expires_at) <= new Date()) return 'expired';
    return 'active';
  };

  const filteredCodes = getFilteredCodes();

  const renderCodeCard = (code: ActivationCode) => {
    const status = getCodeStatus(code);
    
    return (
      <View key={code.id} style={styles.codeCard}>
        <View style={styles.codeHeader}>
          <Text style={styles.codeValue}>{code.code}</Text>
          <View style={[
            styles.statusBadge,
            status === 'active' && styles.statusActive,
            status === 'used' && styles.statusUsed,
            status === 'expired' && styles.statusExpired,
          ]}>
            <Text style={[
              styles.statusText,
              status === 'active' && styles.statusTextActive,
              status === 'used' && styles.statusTextUsed,
              status === 'expired' && styles.statusTextExpired,
            ]}>
              {status === 'active' ? '✅ Active' : status === 'used' ? '✓ Used' : '⏰ Expired'}
            </Text>
          </View>
        </View>

        {code.notes && (
          <Text style={styles.codeNotes}>📝 {code.notes}</Text>
        )}

        <View style={styles.codeDetails}>
          <View style={styles.codeDetailRow}>
            <Text style={styles.codeDetailLabel}>Created</Text>
            <Text style={styles.codeDetailValue}>
              {new Date(code.created_at).toLocaleDateString('en-IN')}
            </Text>
          </View>
          {code.expires_at && (
            <View style={styles.codeDetailRow}>
              <Text style={styles.codeDetailLabel}>Expires</Text>
              <Text style={[
                styles.codeDetailValue,
                status === 'expired' && styles.expiredText,
              ]}>
                {new Date(code.expires_at).toLocaleDateString('en-IN')}
              </Text>
            </View>
          )}
          {code.used && code.user_name && (
            <View style={styles.codeDetailRow}>
              <Text style={styles.codeDetailLabel}>Used by</Text>
              <Text style={styles.codeDetailValue}>{code.user_name}</Text>
            </View>
          )}
        </View>

        <View style={styles.codeActions}>
          <TouchableOpacity
            style={styles.codeActionButton}
            onPress={() => handleCopyCode(code.code)}
          >
            <Text style={styles.codeActionText}>📋 Copy</Text>
          </TouchableOpacity>
          {status === 'active' && (
            <TouchableOpacity
              style={styles.codeActionButton}
              onPress={() => handleShareCode(code.code)}
            >
              <Text style={styles.codeActionText}>📤 Share</Text>
            </TouchableOpacity>
          )}
          {!code.used && (
            <TouchableOpacity
              style={[styles.codeActionButton, styles.codeActionDanger]}
              onPress={() => handleDeleteCode(code.id, code.code)}
            >
              <Text style={[styles.codeActionText, styles.codeActionTextDanger]}>🗑️ Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <AppLayout>
        <AppBar title="Activation Codes" onBack={() => navigation.goBack()} variant="surface" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0D9488" />
          <Text style={styles.loadingText}>Loading codes...</Text>
        </View>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <AppBar title="Activation Codes" onBack={() => navigation.goBack()} variant="surface" />
      
      {/* Stats Header */}
      <LinearGradient
        colors={['#0D9488', '#0F766E']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.statsHeader}
      >
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{codes.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {codes.filter(c => !c.used && (!c.expires_at || new Date(c.expires_at) > new Date())).length}
            </Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{codes.filter(c => c.used).length}</Text>
            <Text style={styles.statLabel}>Used</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {(['all', 'active', 'used', 'expired'] as const).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterTab, filter === f && styles.filterTabActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterTabText, filter === f && styles.filterTabTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Codes List */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#0D9488']} />
        }
      >
        {filteredCodes.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🎫</Text>
            <Text style={styles.emptyTitle}>No codes found</Text>
            <Text style={styles.emptySubtitle}>
              {filter === 'all' 
                ? 'Create your first activation code'
                : `No ${filter} codes`}
            </Text>
          </View>
        ) : (
          filteredCodes.map(renderCodeCard)
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Create Button */}
      <TouchableOpacity
        style={styles.createButton}
        onPress={() => setShowCreateModal(true)}
      >
        <LinearGradient
          colors={['#0D9488', '#0F766E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.createButtonGradient}
        >
          <Text style={styles.createButtonIcon}>➕</Text>
          <Text style={styles.createButtonText}>Generate Code</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Create Modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {generatedCode ? (
              <>
                <View style={styles.modalSuccess}>
                  <Text style={styles.modalSuccessIcon}>🎉</Text>
                  <Text style={styles.modalSuccessTitle}>Code Generated!</Text>
                  <View style={styles.generatedCodeBox}>
                    <Text style={styles.generatedCodeText}>{generatedCode}</Text>
                  </View>
                  <Text style={styles.modalSuccessHint}>
                    Share this code with the distributor
                  </Text>
                </View>
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.modalButtonPrimary}
                    onPress={() => handleCopyCode(generatedCode)}
                  >
                    <Text style={styles.modalButtonPrimaryText}>📋 Copy Code</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalButtonPrimary}
                    onPress={() => handleShareCode(generatedCode)}
                  >
                    <Text style={styles.modalButtonPrimaryText}>📤 Share</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={styles.modalButtonSecondary}
                  onPress={closeCreateModal}
                >
                  <Text style={styles.modalButtonSecondaryText}>Done</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Generate Activation Code</Text>
                <Text style={styles.modalSubtitle}>
                  Create a new code for distributor registration
                </Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Notes (optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={newCodeNotes}
                    onChangeText={setNewCodeNotes}
                    placeholder="e.g., For John - Sector 5"
                    placeholderTextColor="#94A3B8"
                    multiline
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Expires in (days)</Text>
                  <TextInput
                    style={styles.input}
                    value={expiryDays}
                    onChangeText={setExpiryDays}
                    placeholder="30"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                  />
                  <Text style={styles.inputHint}>
                    Code will expire after {expiryDays || '30'} days
                  </Text>
                </View>

                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.modalButtonSecondary}
                    onPress={closeCreateModal}
                  >
                    <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButtonPrimary, creating && styles.modalButtonDisabled]}
                    onPress={handleCreateCode}
                    disabled={creating}
                  >
                    {creating ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.modalButtonPrimaryText}>Generate</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </AppLayout>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748B',
    fontWeight: '500',
  },
  statsHeader: {
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  filterContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  filterScroll: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    marginRight: 8,
  },
  filterTabActive: {
    backgroundColor: '#0D9488',
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  contentContainer: {
    padding: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#64748B',
  },
  codeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  codeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  codeValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    letterSpacing: 2,
    fontFamily: 'monospace',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusActive: {
    backgroundColor: '#DCFCE7',
  },
  statusUsed: {
    backgroundColor: '#E0E7FF',
  },
  statusExpired: {
    backgroundColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusTextActive: {
    color: '#16A34A',
  },
  statusTextUsed: {
    color: '#4F46E5',
  },
  statusTextExpired: {
    color: '#DC2626',
  },
  codeNotes: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  codeDetails: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  codeDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  codeDetailLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  codeDetailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  expiredText: {
    color: '#DC2626',
  },
  codeActions: {
    flexDirection: 'row',
    gap: 10,
  },
  codeActionButton: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  codeActionDanger: {
    backgroundColor: '#FEE2E2',
  },
  codeActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  codeActionTextDanger: {
    color: '#DC2626',
  },
  createButton: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  createButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  createButtonIcon: {
    fontSize: 18,
  },
  createButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 28,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 15,
    color: '#64748B',
    marginBottom: 24,
  },
  modalSuccess: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  modalSuccessIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  modalSuccessTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 20,
  },
  generatedCodeBox: {
    backgroundColor: '#F0FDFA',
    borderWidth: 2,
    borderColor: '#0D9488',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 32,
    marginBottom: 16,
  },
  generatedCodeText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0D9488',
    letterSpacing: 3,
    fontFamily: 'monospace',
  },
  modalSuccessHint: {
    fontSize: 14,
    color: '#64748B',
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    color: '#1E293B',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  inputHint: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalButtonPrimary: {
    flex: 1,
    backgroundColor: '#0D9488',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  modalButtonDisabled: {
    opacity: 0.5,
  },
  modalButtonPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalButtonSecondary: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  modalButtonSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
  },
});

export default ActivationCodesScreen;
