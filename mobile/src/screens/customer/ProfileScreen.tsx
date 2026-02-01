import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLayout } from '../../components/AppLayout';
import { AppBar } from '../../components/AppBar';
import { ErrorBanner } from '../../components/ErrorBanner';
import { theme } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../services/supabase';
import { createAddress, updateAddress, listSocieties, listTowers, listUnits } from '../../services/address';

interface Address {
  id: string;
  label: string; // derived label
  flatNo: string;
  society: string;
  street: string;
  pincode: string;
  isDefault: boolean;
}

interface Profile {
  name: string;
  phone: string;
  email: string;
  deliveryInstructions: string;
}

interface ProfileScreenProps {
  onBack: () => void;
  onNavigateToSupport?: (prefill?: { category?: string; subject?: string; description?: string }) => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ onBack, onNavigateToSupport }) => {
  const { logout, user } = useAuthStore();
  const insets = useSafeAreaInsets();
  
  // Use real user data from auth store
  const [profile, setProfile] = useState<Profile>({
    name: user?.name || '',
    phone: user?.phone || '',
    email: user?.email || '',
    deliveryInstructions: '',
  });
  
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [addrError, setAddrError] = useState<string | null>(null);
    const loadCustomerAndAddresses = async () => {
      if (!user?.id) return;
      setLoadingAddresses(true);
      setAddrError(null);
      try {
        // Use user.id directly (after migration)
        setCustomerId(user.id);
        
        // Query addresses using user_id
        const { data: addrRows, error: addrErr } = await supabase
          .from('addresses')
          .select('id, apartment_number, society_name, street_address, pincode, is_default')
          .eq('user_id', user.id)
          .order('is_default', { ascending: false });
        if (addrErr) throw addrErr;
        const mapped: Address[] = (addrRows || []).map(r => ({
          id: r.id,
          label: r.is_default ? 'Default' : 'Address',
          flatNo: r.apartment_number || '',
          society: r.society_name || '',
          street: r.street_address || '',
          pincode: r.pincode || '',
          isDefault: r.is_default || false,
        }));
        setAddresses(mapped);
      } catch (e: any) {
        console.warn('Load addresses error', e);
        setAddrError(e.message || 'Failed to load addresses');
      } finally {
        setLoadingAddresses(false);
      }
    };

    useEffect(() => {
      loadCustomerAndAddresses();
    }, [user?.id]);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);

  const [addressForm, setAddressForm] = useState({
    label: '',
    societyId: null as string | null,
    towerId: null as string | null,
    unitId: null as string | null,
  });

  // Address selection state
  const [societies, setSocieties] = useState<any[]>([]);
  const [towers, setTowers] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [societySearchQuery, setSocietySearchQuery] = useState('');
  const [loadingAddressStep, setLoadingAddressStep] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const handleSaveProfile = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'User not found. Please re-login.');
      return;
    }

    // Validate inputs
    if (!profile.name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }

    setSavingProfile(true);
    try {
      // Update users table
      const { error: userError } = await supabase
        .from('users')
        .update({
          name: profile.name.trim(),
          email: profile.email.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (userError) throw userError;

      // Update local auth store with new name
      const { setUser: updateUser } = useAuthStore.getState();
      updateUser({
        ...user,
        name: profile.name.trim(),
        email: profile.email.trim() || user.email,
      });

      setIsEditingProfile(false);
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (error: any) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', error.message || 'Failed to save profile. Please try again.');
    } finally {
      setSavingProfile(false);
    }
  };

  const loadSocietiesForAddress = async () => {
    setLoadingAddressStep('societies');
    setAddressError(null);
    try {
      const data = await listSocieties(societySearchQuery);
      setSocieties(data || []);
    } catch (e: any) {
      setAddressError('Failed to load societies');
    } finally {
      setLoadingAddressStep(null);
    }
  };

  const loadTowersForAddress = async (societyId: string) => {
    setLoadingAddressStep('towers');
    setAddressError(null);
    setTowers([]);
    setUnits([]);
    setAddressForm(prev => ({ ...prev, towerId: null, unitId: null }));
    try {
      const data = await listTowers(societyId);
      setTowers(data || []);
    } catch (e: any) {
      setAddressError('Failed to load towers');
    } finally {
      setLoadingAddressStep(null);
    }
  };

  const loadUnitsForAddress = async (towerId: string) => {
    setLoadingAddressStep('units');
    setAddressError(null);
    setUnits([]);
    setAddressForm(prev => ({ ...prev, unitId: null }));
    try {
      const data = await listUnits(towerId);
      setUnits(data || []);
    } catch (e: any) {
      setAddressError('Failed to load units');
    } finally {
      setLoadingAddressStep(null);
    }
  };

  useEffect(() => {
    if (showAddressModal && societySearchQuery.length > 2) {
      loadSocietiesForAddress();
    }
  }, [societySearchQuery, showAddressModal]);

  const handleSetDefaultAddress = async (addressId: string) => {
    if (!customerId) return;
    try {
      // Reset previous default
      const currentDefault = addresses.find(a => a.isDefault && a.id !== addressId);
      if (currentDefault) {
        await supabase.from('addresses').update({ is_default: false }).eq('id', currentDefault.id);
      }
      await supabase.from('addresses').update({ is_default: true }).eq('id', addressId);
      setAddresses(prev => prev.map(a => ({ ...a, isDefault: a.id === addressId })));
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to set default address');
    }
  };

  const handleDeleteAddress = (addressId: string) => {
    const address = addresses.find((a) => a.id === addressId);
    if (!address) return;
    
    if (address.isDefault) {
      Alert.alert('Cannot Delete', 'This is your default address. Please contact support if you need to change it.');
      return;
    }
    
    // Route to support for address deletion request
    Alert.alert(
      'Request Address Deletion',
      'For your security, address changes require admin approval. Would you like to submit a support request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit Request',
          onPress: () => {
            if (onNavigateToSupport) {
              onNavigateToSupport({
                category: 'address_change',
                subject: 'Request to delete an address',
                description: `Please delete my address:\n\nFlat: ${address.flatNo}\nSociety: ${address.society}\nStreet: ${address.street}\n\nReason: [Please add your reason here]`,
              });
            } else {
              Alert.alert('Info', 'Please go to Support section to submit an address change request.');
            }
          },
        },
      ]
    );
  };

  // Handler for requesting address changes (edit)
  const handleRequestAddressChange = (address: Address) => {
    Alert.alert(
      'Request Address Change',
      'For your security and to ensure uninterrupted deliveries, address changes require admin approval. Would you like to submit a support request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit Request',
          onPress: () => {
            if (onNavigateToSupport) {
              onNavigateToSupport({
                category: 'address_change',
                subject: 'Request to change my delivery address',
                description: `Current Address:\nFlat: ${address.flatNo}\nSociety: ${address.society}\nStreet: ${address.street}\n\nNew Address Details:\n[Please provide your new address details here]\n\nReason for change: [Please add your reason]`,
              });
            } else {
              Alert.alert('Info', 'Please go to Support section to submit an address change request.');
            }
          },
        },
      ]
    );
  };

  const handleAddAddress = () => {
    setEditingAddress(null);
    setAddressForm({
      label: '',
      societyId: null,
      towerId: null,
      unitId: null,
    });
    setSocieties([]);
    setTowers([]);
    setUnits([]);
    setSocietySearchQuery('');
    setAddressError(null);
    setShowAddressModal(true);
  };

  const handleSaveAddress = async () => {
    if (!addressForm.societyId || !addressForm.towerId || !addressForm.unitId) {
      Alert.alert('Error', 'Please select society, tower, and unit');
      return;
    }
    if (!customerId) {
      Alert.alert('Error', 'Customer record missing');
      return;
    }
    try {
      // Insert address first
      const { data: insertedAddr, error: insertError } = await supabase
        .from('addresses')
        .insert({
          user_id: customerId,
          society_id: addressForm.societyId,
          tower_id: addressForm.towerId,
          unit_id: addressForm.unitId,
          is_default: addresses.length === 0,
        })
        .select('id, is_default')
        .single();
      
      if (insertError) throw insertError;

      // Get the related names separately for clarity
      const selectedSociety = societies.find(s => s.id === addressForm.societyId);
      const selectedTower = towers.find(t => t.id === addressForm.towerId);
      const selectedUnit = units.find(u => u.id === addressForm.unitId);
      
      setAddresses(prev => [...prev, {
        id: insertedAddr.id,
        label: insertedAddr.is_default ? 'Default' : 'Address',
        flatNo: selectedUnit?.number || '',
        society: selectedSociety?.name || '',
        street: `Tower ${selectedTower?.name || ''}`,
        pincode: '',
        isDefault: insertedAddr.is_default || false,
      }]);
      setShowAddressModal(false);
      Alert.alert('Success', 'Address added!');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save address');
    }
  };

  return (
    <AppLayout>
      <AppBar 
        title="Profile & Addresses" 
        onBack={onBack} 
        variant="surface"
        actions={[{ 
          label: 'Logout', 
          onPress: () => {
            Alert.alert(
              'Logout',
              'Are you sure you want to logout?',
              [
                { text: 'Cancel', style: 'cancel' },
                { 
                  text: 'Logout', 
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await logout();
                    } catch (error) {
                      Alert.alert('Error', 'Failed to logout. Please try again.');
                    }
                  }
                }
              ]
            );
          }
        }]}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Profile Information</Text>
            <TouchableOpacity onPress={() => setIsEditingProfile(!isEditingProfile)}>
              <Text style={styles.editButton}>{isEditingProfile ? 'Cancel' : 'Edit'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.profileCard}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                style={[styles.input, !isEditingProfile && styles.inputDisabled]}
                value={profile.name}
                onChangeText={(text) => setProfile({ ...profile, name: text })}
                editable={isEditingProfile}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Phone Number</Text>
              <TextInput
                style={[styles.input, styles.inputDisabled]}
                value={profile.phone}
                editable={false}
              />
              <Text style={styles.inputHint}>Cannot be changed</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={[styles.input, !isEditingProfile && styles.inputDisabled]}
                value={profile.email}
                onChangeText={(text) => setProfile({ ...profile, email: text })}
                editable={isEditingProfile}
                keyboardType="email-address"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Delivery Instructions</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.textArea,
                  !isEditingProfile && styles.inputDisabled,
                ]}
                value={profile.deliveryInstructions}
                onChangeText={(text) => setProfile({ ...profile, deliveryInstructions: text })}
                editable={isEditingProfile}
                multiline
                numberOfLines={3}
                placeholder="Leave at door, call before delivery, etc."
              />
            </View>

            {isEditingProfile && (
              <TouchableOpacity 
                style={[styles.saveButton, savingProfile && styles.saveButtonDisabled]} 
                onPress={handleSaveProfile}
                disabled={savingProfile}
              >
                {savingProfile ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Addresses Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Delivery Addresses</Text>
            <TouchableOpacity onPress={handleAddAddress}>
              <Text style={styles.addButton}>+ Add New</Text>
            </TouchableOpacity>
          </View>

          {addrError && (
            <Text style={{ color: theme.colors.error, marginBottom: 12 }}>{addrError}</Text>
          )}
          {loadingAddresses && addresses.length === 0 && (
            <Text style={{ color: theme.colors.textSecondary }}>Loading addresses...</Text>
          )}
          {addresses.map((address) => (
            <View key={address.id} style={styles.addressCard}>
              <View style={styles.addressHeader}>
                <View style={styles.addressLabelContainer}>
                  <Text style={styles.addressLabel}>{address.label}</Text>
                  {address.isDefault && (
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultBadgeText}>Default</Text>
                    </View>
                  )}
                </View>
              </View>
              <Text style={styles.addressText}>{address.flatNo}</Text>
              <Text style={styles.addressText}>{address.society}</Text>
              {address.street && (
                <Text style={styles.addressLandmark}>{address.street}</Text>
              )}
              <Text style={styles.addressText}>{address.pincode}</Text>

              <View style={styles.addressActions}>
                {!address.isDefault && (
                  <TouchableOpacity
                    style={styles.addressActionButton}
                    onPress={() => handleSetDefaultAddress(address.id)}
                  >
                    <Text style={styles.addressActionText}>Set as Default</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.addressActionButton, styles.addressEditButton]}
                  onPress={() => handleRequestAddressChange(address)}
                >
                  <Text style={[styles.addressActionText, styles.addressEditButtonText]}>Request Change</Text>
                </TouchableOpacity>
                {!address.isDefault && (
                  <TouchableOpacity
                    style={[styles.addressActionButton, styles.deleteButton]}
                    onPress={() => handleDeleteAddress(address.id)}
                  >
                    <Text style={[styles.addressActionText, styles.deleteButtonText]}>Delete</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Address Modal */}
      <Modal
        visible={showAddressModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddressModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Address</Text>
              <TouchableOpacity onPress={() => setShowAddressModal(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {addressError && <ErrorBanner message={addressError} onRetry={loadSocietiesForAddress} />}

              {/* Society Selection */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>🏘️ Society *</Text>
                <TextInput
                  style={styles.input}
                  value={societySearchQuery}
                  onChangeText={setSocietySearchQuery}
                  placeholder="Search for your society..."
                  placeholderTextColor="#94A3B8"
                />
                {loadingAddressStep === 'societies' ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color="#0D9488" />
                    <Text style={styles.loadingText}>Searching...</Text>
                  </View>
                ) : societies.length > 0 ? (
                  <ScrollView style={styles.selectionList} horizontal showsHorizontalScrollIndicator={false}>
                    {societies.map(society => (
                      <TouchableOpacity
                        key={society.id}
                        style={[
                          styles.selectionCard,
                          addressForm.societyId === society.id && styles.selectionCardActive,
                        ]}
                        onPress={() => {
                          setAddressForm(prev => ({ ...prev, societyId: society.id }));
                          loadTowersForAddress(society.id);
                        }}
                      >
                        <Text
                          style={[
                            styles.selectionCardText,
                            addressForm.societyId === society.id && styles.selectionCardTextActive,
                          ]}
                        >
                          {society.name}
                        </Text>
                        {society.area && (
                          <Text style={styles.selectionCardSubtext}>{society.area}</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : societySearchQuery.length > 0 ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>🏘️</Text>
                    <Text style={styles.emptyText}>No societies found</Text>
                  </View>
                ) : null}
              </View>

              {/* Tower Selection */}
              {addressForm.societyId && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>🏢 Tower/Building *</Text>
                  {loadingAddressStep === 'towers' ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color="#0D9488" />
                      <Text style={styles.loadingText}>Loading towers...</Text>
                    </View>
                  ) : towers.length > 0 ? (
                    <View style={styles.gridContainer}>
                      {towers.map(tower => (
                        <TouchableOpacity
                          key={tower.id}
                          style={[
                            styles.gridItem,
                            addressForm.towerId === tower.id && styles.gridItemActive,
                          ]}
                          onPress={() => {
                            setAddressForm(prev => ({ ...prev, towerId: tower.id }));
                            loadUnitsForAddress(tower.id);
                          }}
                        >
                          <Text
                            style={[
                              styles.gridItemText,
                              addressForm.towerId === tower.id && styles.gridItemTextActive,
                            ]}
                          >
                            Tower {tower.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyIcon}>🏗️</Text>
                      <Text style={styles.emptyText}>No towers found</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Unit Selection */}
              {addressForm.towerId && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>🏠 Unit/Flat *</Text>
                  {loadingAddressStep === 'units' ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color="#0D9488" />
                      <Text style={styles.loadingText}>Loading units...</Text>
                    </View>
                  ) : units.length > 0 ? (
                    <View style={styles.unitsGrid}>
                      {units.map(unit => (
                        <TouchableOpacity
                          key={unit.id}
                          style={[
                            styles.unitChip,
                            addressForm.unitId === unit.id && styles.unitChipActive,
                          ]}
                          onPress={() => setAddressForm(prev => ({ ...prev, unitId: unit.id }))}
                        >
                          <Text
                            style={[
                              styles.unitChipText,
                              addressForm.unitId === unit.id && styles.unitChipTextActive,
                            ]}
                          >
                            {unit.number}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyIcon}>🏠</Text>
                      <Text style={styles.emptyText}>No units found</Text>
                    </View>
                  )}
                </View>
              )}

              <TouchableOpacity 
                style={[
                  styles.modalSaveButton,
                  (!addressForm.societyId || !addressForm.towerId || !addressForm.unitId) && styles.modalSaveButtonDisabled,
                ]} 
                onPress={handleSaveAddress}
                disabled={!addressForm.societyId || !addressForm.towerId || !addressForm.unitId}
              >
                <Text style={styles.modalSaveButtonText}>Save Address</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </AppLayout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: theme.colors.primary,
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 28,
    color: '#FFFFFF',
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  logoutButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  section: {
    marginTop: 16,
    paddingHorizontal: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  editButton: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  addButton: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  inputDisabled: {
    backgroundColor: '#F0F0F0',
    color: theme.colors.textSecondary,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  inputHint: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  addressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  addressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addressLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addressLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  defaultBadge: {
    backgroundColor: theme.colors.success + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  defaultBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.success,
  },
  editIcon: {
    fontSize: 18,
  },
  addressText: {
    fontSize: 14,
    color: theme.colors.text,
    marginBottom: 4,
  },
  addressLandmark: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  addressActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  addressActionButton: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteButton: {
    backgroundColor: '#FFEBEE',
  },
  addressEditButton: {
    backgroundColor: '#E3F2FD',
  },
  addressActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
  },
  deleteButtonText: {
    color: theme.colors.error,
  },
  addressEditButtonText: {
    color: theme.colors.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  modalCloseButton: {
    fontSize: 28,
    color: theme.colors.textSecondary,
  },
  modalSaveButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  modalSaveButtonDisabled: {
    backgroundColor: '#94A3B8',
    opacity: 0.6,
  },
  modalSaveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Address Selection Styles
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  selectionList: {
    marginTop: 12,
    maxHeight: 140,
  },
  selectionCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 16,
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    minWidth: 160,
  },
  selectionCardActive: {
    borderColor: '#0D9488',
    backgroundColor: '#CCFBF1',
  },
  selectionCardText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
  },
  selectionCardTextActive: {
    color: '#0D9488',
  },
  selectionCardSubtext: {
    fontSize: 12,
    color: '#64748B',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  gridItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  gridItemActive: {
    borderColor: '#0D9488',
    backgroundColor: '#CCFBF1',
  },
  gridItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  gridItemTextActive: {
    color: '#0D9488',
  },
  unitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  unitChip: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  unitChipActive: {
    borderColor: '#0D9488',
    backgroundColor: '#CCFBF1',
  },
  unitChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  unitChipTextActive: {
    color: '#0D9488',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
});
