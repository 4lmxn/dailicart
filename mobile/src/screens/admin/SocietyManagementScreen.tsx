import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Modal,
  Alert,
  ScrollView,
} from 'react-native';
import { theme } from '../../theme';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { ErrorBanner } from '../../components/ErrorBanner';
import { supabase } from '../../services/supabase';

interface Society {
  id: string;
  name: string;
  slug: string;
  developer: string | null;
  area: string | null;
  pincode: string | null;
  is_active: boolean;
  created_at: string;
}

interface SocietyManagementScreenProps {
  onBack?: () => void;
  onSelectSociety?: (societyId: string) => void;
}

export const SocietyManagementScreen: React.FC<SocietyManagementScreenProps> = ({ onBack, onSelectSociety }) => {
  const [societies, setSocieties] = useState<Society[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSociety, setEditingSociety] = useState<Society | null>(null);
  
  const [form, setForm] = useState({
    name: '',
    developer: '',
    area: '',
    pincode: '',
  });

  useEffect(() => {
    loadSocieties();
  }, []);

  const loadSocieties = async () => {
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('societies')
        .select('*')
        .order('name');
      
      if (err) throw err;
      setSocieties(data || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load societies');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadSocieties();
  };

  const handleAdd = () => {
    setEditingSociety(null);
    setForm({ name: '', developer: '', area: '', pincode: '' });
    setShowModal(true);
  };

  const handleEdit = (society: Society) => {
    setEditingSociety(society);
    setForm({
      name: society.name,
      developer: society.developer || '',
      area: society.area || '',
      pincode: society.pincode || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('Error', 'Society name is required');
      return;
    }

    try {
      if (editingSociety) {
        // Update existing
        const { error: updateErr } = await supabase
          .from('societies')
          .update({
            name: form.name.trim(),
            developer: form.developer.trim() || null,
            area: form.area.trim() || null,
            pincode: form.pincode.trim() || null,
          })
          .eq('id', editingSociety.id);

        if (updateErr) throw updateErr;
        Alert.alert('Success', 'Society updated successfully');
      } else {
        // Create new
        const { error: insertErr } = await supabase
          .from('societies')
          .insert({
            name: form.name.trim(),
            developer: form.developer.trim() || null,
            area: form.area.trim() || null,
            pincode: form.pincode.trim() || null,
            is_active: true,
          });

        if (insertErr) throw insertErr;
        Alert.alert('Success', 'Society created successfully');
      }

      setShowModal(false);
      loadSocieties();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save society');
    }
  };

  const handleDelete = (society: Society) => {
    Alert.alert(
      'Delete Society',
      `Are you sure you want to delete ${society.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error: deleteErr } = await supabase
                .from('societies')
                .delete()
                .eq('id', society.id);

              if (deleteErr) throw deleteErr;
              Alert.alert('Success', 'Society deleted successfully');
              loadSocieties();
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to delete society');
            }
          },
        },
      ]
    );
  };

  const handleToggleActive = async (society: Society) => {
    try {
      const { error: updateErr } = await supabase
        .from('societies')
        .update({ is_active: !society.is_active })
        .eq('id', society.id);

      if (updateErr) throw updateErr;
      loadSocieties();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update status');
    }
  };

  const filtered = societies.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.developer?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.area?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderItem = ({ item }: { item: Society }) => (
    <TouchableOpacity
      style={[styles.card, !item.is_active && styles.cardInactive]}
      onPress={() => onSelectSociety?.(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.societyName}>{item.name}</Text>
          {item.developer && (
            <Text style={styles.developer}>by {item.developer}</Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => handleToggleActive(item)}
          style={[styles.statusBadge, item.is_active ? styles.activeBadge : styles.inactiveBadge]}
        >
          <Text style={styles.statusText}>
            {item.is_active ? 'Active' : 'Inactive'}
          </Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.cardBody}>
        {item.area && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>📍 Area:</Text>
            <Text style={styles.infoValue}>{item.area}</Text>
          </View>
        )}
        {item.pincode && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>📮 Pincode:</Text>
            <Text style={styles.infoValue}>{item.pincode}</Text>
          </View>
        )}
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleEdit(item)}
        >
          <Text style={styles.actionButtonText}>✏️ Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => handleDelete(item)}
        >
          <Text style={[styles.actionButtonText, styles.deleteButtonText]}>🗑️ Delete</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Societies</Text>
          <View style={{ width: 44 }} />
        </View>
        <SkeletonList count={5} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Custom Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Societies</Text>
        <TouchableOpacity onPress={handleAdd} style={styles.addButton}>
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {error && <ErrorBanner message={error} onRetry={() => setError(null)} />}

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search societies..."
          placeholderTextColor={theme.colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <EmptyState
            icon="🏘️"
            title="No societies found"
            description={searchQuery ? "Try a different search" : "Add your first society"}
          />
        }
      />

      <Modal
        visible={showModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView>
              <Text style={styles.modalTitle}>
                {editingSociety ? 'Edit Society' : 'Add New Society'}
              </Text>

              <Text style={styles.label}>Society Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Prestige Lakeside Habitat"
                value={form.name}
                onChangeText={(text) => setForm({ ...form, name: text })}
              />

              <Text style={styles.label}>Developer</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Prestige, Sobha, Brigade"
                value={form.developer}
                onChangeText={(text) => setForm({ ...form, developer: text })}
              />

              <Text style={styles.label}>Area</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Whitefield, Koramangala"
                value={form.area}
                onChangeText={(text) => setForm({ ...form, area: text })}
              />

              <Text style={styles.label}>Pincode</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 560066"
                keyboardType="numeric"
                value={form.pincode}
                onChangeText={(text) => setForm({ ...form, pincode: text })}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => setShowModal(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.saveButton]}
                  onPress={handleSave}
                >
                  <Text style={styles.saveButtonText}>
                    {editingSociety ? 'Update' : 'Create'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 24,
    color: '#1E293B',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    letterSpacing: -0.3,
  },
  addButton: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  searchContainer: {
    padding: 20,
    backgroundColor: '#FFFFFF',
  },
  searchInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1E293B',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  listContent: {
    padding: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 0,
  },
  cardInactive: {
    opacity: 0.6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  societyName: {
    fontSize: 19,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  developer: {
    fontSize: 14,
    color: '#64748B',
    fontStyle: 'italic',
  },
  statusBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  activeBadge: {
    backgroundColor: '#D1FAE5',
  },
  inactiveBadge: {
    backgroundColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  cardBody: {
    marginBottom: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  infoLabel: {
    fontSize: 14,
    color: '#64748B',
    width: 100,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    color: '#1E293B',
    flex: 1,
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#CCFBF1',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  deleteButton: {
    backgroundColor: '#FEE2E2',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0D9488',
  },
  deleteButtonText: {
    color: '#DC2626',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    width: '92%',
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 24,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1E293B',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 28,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F1F5F9',
  },
  saveButton: {
    backgroundColor: '#0D9488',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748B',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
