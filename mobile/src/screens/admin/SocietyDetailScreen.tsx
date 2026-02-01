import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
} from 'react-native';
import { theme } from '../../theme';
import { supabase } from '../../services/supabase';
import { EmptyState } from '../../components/EmptyState';

interface SocietyDetailScreenProps {
  societyId: string;
  onBack: () => void;
}

interface Tower {
  id: string;
  name: string;
  floors: number | null;
  society_id: string;
}

interface Unit {
  id: string;
  number: string;
  floor: number | null;
  tower_id: string;
  is_active: boolean;
}

interface Address {
  id: string;
  apartment_number: string | null;
  user_id: string;
  users?: {
    id: string;
    name: string;
    phone: string;
  };
}

export const SocietyDetailScreen: React.FC<SocietyDetailScreenProps> = ({ societyId, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [society, setSociety] = useState<any>(null);
  const [towers, setTowers] = useState<Tower[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [expandedTower, setExpandedTower] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [customerDetail, setCustomerDetail] = useState<any>(null);
  const [loadingCustomer, setLoadingCustomer] = useState(false);

  useEffect(() => {
    loadDetails();
  }, [societyId]);

  const loadDetails = async () => {
    try {
      // Fetch society
      const { data: societyData, error: societyErr } = await supabase
        .from('societies')
        .select('*')
        .eq('id', societyId)
        .maybeSingle();

      if (societyErr) throw societyErr;
      if (!societyData) {
        Alert.alert('Error', 'Society not found');
        onBack();
        return;
      }
      setSociety(societyData);

      // Fetch towers
      const { data: towersData, error: towersErr } = await supabase
        .from('society_towers')
        .select('*')
        .eq('society_id', societyId)
        .order('name');

      if (towersErr) throw towersErr;
      setTowers(towersData || []);

      // Fetch units for all towers
      if (towersData && towersData.length > 0) {
        const { data: unitsData, error: unitsErr } = await supabase
          .from('tower_units')
          .select('*')
          .in('tower_id', towersData.map((t: Tower) => t.id))
          .order('floor, number');

        if (unitsErr) throw unitsErr;
        setUnits(unitsData || []);
      }

      // Fetch addresses/customers
      const { data: addressesData, error: addressesErr } = await supabase
        .from('addresses')
        .select(`
          id,
          apartment_number,
          user_id,
          users:user_id (
            id,
            name,
            phone
          )
        `)
        .eq('society_id', societyId);

      if (addressesErr) throw addressesErr;
      // Transform data - Supabase returns single object for belongs-to relations
      const transformedAddresses = (addressesData || []).map((addr: any) => ({
        ...addr,
        users: Array.isArray(addr.users) ? addr.users[0] : addr.users,
      }));
      setAddresses(transformedAddresses);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load society details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadDetails();
  };

  const getUnitsForTower = (towerId: string) => units.filter(u => u.tower_id === towerId);
  const getAddressesForUnit = (unitId: string) => addresses.filter(a => a.id === unitId);
  const getAddressesForApartment = (apartmentNum: string) => 
    addresses.filter(a => a.apartment_number === apartmentNum);

  const handleUnitPress = async (unit: Unit) => {
    setSelectedUnit(unit);
    setLoadingCustomer(true);
    
    try {
      // Find customer by unit_id or apartment_number
      const { data: addressData, error: addrError } = await supabase
        .from('addresses')
        .select(`
          id,
          apartment_number,
          is_default,
          user_id,
          users:user_id (
            id,
            name,
            phone,
            email
          )
        `)
        .or(`unit_id.eq.${unit.id},apartment_number.eq.${unit.number}`)
        .limit(1)
        .maybeSingle();

      if (addrError && addrError.code !== 'PGRST116') throw addrError;

      if (addressData) {
        // Fetch wallet balance separately
        const { data: customerData } = await supabase
          .from('customers')
          .select('id, wallet_balance')
          .eq('user_id', addressData.user_id)
          .maybeSingle();

        // Fetch active subscriptions count using user_id
        const { data: subsData } = await supabase
          .from('subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', addressData.user_id)
          .eq('status', 'active');

        setCustomerDetail({
          ...addressData,
          customers: customerData,
          activeSubscriptions: subsData || 0,
        });
      } else {
        setCustomerDetail(null);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load customer details');
    } finally {
      setLoadingCustomer(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Loading...</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0D9488" />
        </View>
      </View>
    );
  }

  if (!society) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Not Found</Text>
          <View style={{ width: 44 }} />
        </View>
        <EmptyState icon="🏘️" title="Society not found" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{society.name}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Society Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>🏘️ Society Information</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Name:</Text>
            <Text style={styles.infoValue}>{society.name}</Text>
          </View>
          {society.developer && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Developer:</Text>
              <Text style={styles.infoValue}>{society.developer}</Text>
            </View>
          )}
          {society.area && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Area:</Text>
              <Text style={styles.infoValue}>{society.area}</Text>
            </View>
          )}
          {society.pincode && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Pincode:</Text>
              <Text style={styles.infoValue}>{society.pincode}</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Status:</Text>
            <Text style={[styles.infoValue, { color: society.is_active ? theme.colors.success : theme.colors.error }]}>
              {society.is_active ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>

        {/* Summary Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{towers.length}</Text>
            <Text style={styles.statLabel}>Towers</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{units.length}</Text>
            <Text style={styles.statLabel}>Units</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{addresses.length}</Text>
            <Text style={styles.statLabel}>Customers</Text>
          </View>
        </View>

        {/* Towers Section */}
        {towers.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏗️ Towers & Units</Text>
            {towers.map(tower => {
              const towerUnits = getUnitsForTower(tower.id);
              return (
                <View key={tower.id} style={styles.towerCard}>
                  <TouchableOpacity
                    onPress={() => setExpandedTower(expandedTower === tower.id ? null : tower.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.towerHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.towerName}>Tower {tower.name}</Text>
                        <Text style={styles.towerInfo}>
                          {tower.floors ? `${tower.floors} floors` : 'Floors not specified'} • {towerUnits.length} units
                        </Text>
                      </View>
                      <Text style={styles.expandIcon}>
                        {expandedTower === tower.id ? '▼' : '▶'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {expandedTower === tower.id && (
                    <View style={styles.unitsContainer}>
                      {towerUnits.length > 0 ? (
                        towerUnits.map(unit => {
                          const unitAddresses = addresses.filter(a => a.apartment_number === unit.number);
                          return (
                            <TouchableOpacity 
                              key={unit.id} 
                              style={styles.unitCard}
                              onPress={() => handleUnitPress(unit)}
                              activeOpacity={0.7}
                            >
                              <View style={styles.unitHeader}>
                                <Text style={styles.unitNumber}>Unit {unit.number}</Text>
                                {unit.floor && (
                                  <Text style={styles.unitFloor}>Floor {unit.floor}</Text>
                                )}
                                <View style={[styles.unitStatus, unit.is_active ? styles.unitActive : styles.unitInactive]}>
                                  <Text style={styles.unitStatusText}>
                                    {unit.is_active ? 'Active' : 'Inactive'}
                                  </Text>
                                </View>
                              </View>
                              {unitAddresses.length > 0 && (
                                <View style={styles.customersContainer}>
                                  <Text style={styles.customersTitle}>👥 Customers:</Text>
                                  {unitAddresses.map(addr => (
                                    <View key={addr.id} style={styles.customerRow}>
                                      <Text style={styles.customerName}>
                                        {addr.users?.name || 'Unknown'}
                                      </Text>
                                      <Text style={styles.customerPhone}>
                                        {addr.users?.phone || 'No phone'}
                                      </Text>
                                    </View>
                                  ))}
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        })
                      ) : (
                        <Text style={styles.emptyText}>No units defined for this tower</Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.section}>
            <EmptyState
              icon="🏗️"
              title="No Towers"
              description="This society has no towers defined yet"
            />
          </View>
        )}

        {/* Customers without Units */}
        {addresses.filter(a => !a.apartment_number || !units.find(u => u.number === a.apartment_number)).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📍 Other Customers</Text>
            <View style={styles.customersList}>
              {addresses
                .filter(a => !a.apartment_number || !units.find(u => u.number === a.apartment_number))
                .map(addr => (
                  <View key={addr.id} style={styles.customerCard}>
                    <Text style={styles.customerName}>
                      {addr.users?.name || 'Unknown'}
                    </Text>
                    <Text style={styles.customerPhone}>
                      {addr.users?.phone || 'No phone'}
                    </Text>
                    {addr.apartment_number && (
                      <Text style={styles.customerApt}>
                        Apt: {addr.apartment_number}
                      </Text>
                    )}
                  </View>
                ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Customer Detail Modal */}
      <Modal
        visible={selectedUnit !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedUnit(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Unit {selectedUnit?.number}
              </Text>
              <TouchableOpacity onPress={() => setSelectedUnit(null)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {loadingCustomer ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
              </View>
            ) : customerDetail ? (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>👤 Customer Information</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Name:</Text>
                    <Text style={styles.detailValue}>
                      {customerDetail.customers?.users?.name || 'N/A'}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Phone:</Text>
                    <Text style={styles.detailValue}>
                      {customerDetail.customers?.users?.phone || 'N/A'}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Email:</Text>
                    <Text style={styles.detailValue}>
                      {customerDetail.customers?.users?.email || 'N/A'}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>💰 Account Status</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Wallet Balance:</Text>
                    <Text style={[styles.detailValue, styles.walletBalance]}>
                      ₹{customerDetail.customers?.wallet_balance?.toFixed(2) || '0.00'}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Active Subscriptions:</Text>
                    <Text style={styles.detailValue}>
                      {customerDetail.activeSubscriptions || 0}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Default Address:</Text>
                    <Text style={styles.detailValue}>
                      {customerDetail.is_default ? '✓ Yes' : '✗ No'}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>📍 Unit Details</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Unit Number:</Text>
                    <Text style={styles.detailValue}>{selectedUnit?.number}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Floor:</Text>
                    <Text style={styles.detailValue}>{selectedUnit?.floor || 'N/A'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Status:</Text>
                    <Text style={[styles.detailValue, { color: selectedUnit?.is_active ? theme.colors.success : theme.colors.error }]}>
                      {selectedUnit?.is_active ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                </View>
              </ScrollView>
            ) : (
              <View style={styles.modalBody}>
                <EmptyState
                  icon="🏠"
                  title="Unit Not Assigned"
                  description={`Unit ${selectedUnit?.number} is currently not assigned to any customer. Customers can select this unit during onboarding or profile update.`}
                />
              </View>
            )}
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
  backButtonText: {
    fontSize: 24,
    color: '#1E293B',
    fontWeight: '600',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  content: {
    flex: 1,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    padding: 20,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 12,
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
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '700',
    color: '#0D9488',
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  section: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  buildingCard: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  buildingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  buildingName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E293B',
  },
  buildingDetails: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  detailText: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 6,
  },
  towerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    overflow: 'hidden',
  },
  towerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
  },
  towerName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  towerInfo: {
    fontSize: 14,
    color: '#64748B',
  },
  expandIcon: {
    fontSize: 18,
    color: '#64748B',
  },
  unitsContainer: {
    padding: 18,
    paddingTop: 0,
    backgroundColor: '#F8FAFC',
  },
  unitCard: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  unitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  unitNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },
  unitFloor: {
    fontSize: 13,
    color: '#64748B',
    marginRight: 10,
  },
  unitStatus: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  unitActive: {
    backgroundColor: '#D1FAE5',
  },
  unitInactive: {
    backgroundColor: '#FEE2E2',
  },
  unitStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  customersContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  customersTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 8,
  },
  customerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  customerName: {
    fontSize: 14,
    color: '#1E293B',
    flex: 1,
  },
  customerPhone: {
    fontSize: 14,
    color: '#64748B',
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    padding: 16,
    fontStyle: 'italic',
  },
  customersList: {
    gap: 10,
  },
  customerCard: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  customerApt: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '80%',
    minHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E293B',
    letterSpacing: -0.3,
  },
  modalClose: {
    fontSize: 24,
    color: '#64748B',
    padding: 6,
  },
  modalLoading: {
    padding: 40,
    alignItems: 'center',
  },
  modalBody: {
    padding: 20,
  },
  detailSection: {
    marginBottom: 24,
  },
  detailSectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 14,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 14,
    color: '#64748B',
    width: 140,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    color: '#1E293B',
    flex: 1,
    fontWeight: '600',
  },
  walletBalance: {
    fontWeight: '700',
    color: '#10B981',
    fontSize: 17,
  },
});
