import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { AppBar } from '../../components/AppBar';
import { AppLayout } from '../../components/AppLayout';
import { theme } from '../../theme';
import { supabase } from '../../services/supabase';
import { getLocalDateString } from '../../utils/helpers';
import Toast from 'react-native-toast-message';
import { AdminScreenProps } from '../../navigation/types';

interface Building {
  society_id: string;
  society_name: string;
  society_address?: string;
  tower_id: string;
  tower_name: string;
  floors?: number;
  total_units?: number;
  assigned_distributors?: string[] | null;
}

interface DistributorBuilding {
  assignment_id: string;
  society_id: string;
  society_name: string;
  tower_id: string;
  tower_name: string;
  floors: number;
  is_active: boolean;
  total_units?: number;
  active_subscriptions?: number;
}

type TabType = 'assigned' | 'available';

export const BuildingAssignmentScreen: React.FC<AdminScreenProps<'BuildingAssignment'>> = ({ 
  route,
  navigation,
}) => {
  const { distributorId, distributorName = 'Distributor' } = route.params;
  const [loading, setLoading] = useState(true);
  const [availableBuildings, setAvailableBuildings] = useState<Building[]>([]);
  const [assignedBuildings, setAssignedBuildings] = useState<DistributorBuilding[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('assigned');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({
    totalAssigned: 0,
    totalUnits: 0,
    totalSubscriptions: 0,
  });

  useEffect(() => {
    loadData();
  }, [distributorId]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load available buildings (towers not yet assigned to any distributor)
      // First get all assigned tower IDs
      const { data: assignedTowers } = await supabase
        .from('distributor_building_assignments')
        .select('tower_id')
        .eq('is_active', true);
      
      const assignedTowerIds = (assignedTowers || []).map(a => a.tower_id);
      
      // Then get all towers that are not assigned
      let query = supabase
        .from('society_towers')
        .select(`
          id,
          name,
          society_id,
          societies!inner(id, name, area, city)
        `);
      
      // Only filter if there are assigned towers
      if (assignedTowerIds.length > 0) {
        query = query.not('id', 'in', `(${assignedTowerIds.join(',')})`);
      }
      
      const { data: available, error: availError } = await query;
      
      if (availError) throw availError;
      
      // Transform to expected format
      const formattedAvailable = (available || []).map((tower: any) => ({
        tower_id: tower.id,
        tower_name: tower.name,
        society_id: tower.society_id,
        society_name: tower.societies?.name || 'Unknown',
        society_address: tower.societies?.area ? `${tower.societies.area}, ${tower.societies.city || 'Bangalore'}` : '',
      }));

      // Load assigned buildings for this distributor with subscription counts
      const { data: assigned, error: assignError } = await supabase
        .rpc('get_distributor_buildings', { p_distributor_id: distributorId });
      
      if (assignError) throw assignError;

      // Get subscription counts for assigned buildings
      const assignedWithStats = await Promise.all(
        (assigned || []).map(async (building: any) => {
          // Query subscriptions through addresses table (addresses have tower_id)
          const { data: subscriptions } = await supabase
            .from('subscriptions')
            .select('id, address_id!inner(tower_id)')
            .eq('address_id.tower_id', building.tower_id)
            .eq('status', 'active');

          const { data: units } = await supabase
            .from('tower_units')
            .select('id')
            .eq('tower_id', building.tower_id);

          return {
            ...building,
            total_units: units?.length || 0,
            active_subscriptions: subscriptions?.length || 0,
          };
        })
      );

      setAvailableBuildings(formattedAvailable);
      setAssignedBuildings(assignedWithStats);

      // Calculate stats
      const totalUnits = assignedWithStats.reduce((sum, b) => sum + (b.total_units || 0), 0);
      const totalSubscriptions = assignedWithStats.reduce((sum, b) => sum + (b.active_subscriptions || 0), 0);
      
      setStats({
        totalAssigned: assignedWithStats.filter(b => b.is_active).length,
        totalUnits,
        totalSubscriptions,
      });
    } catch (error: any) {
      console.error('Error loading buildings:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to load buildings'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (towerId: string, towerName: string) => {
    try {
      setProcessing(towerId);
      
      // Get the society_id for this tower
      const { data: towerData, error: towerError } = await supabase
        .from('society_towers')
        .select('society_id')
        .eq('id', towerId)
        .maybeSingle();
      
      if (towerError) throw towerError;
      if (!towerData) throw new Error('Tower not found');
      
      // Insert into distributor_building_assignments
      const { error } = await supabase
        .from('distributor_building_assignments')
        .upsert({
          distributor_id: distributorId,
          tower_id: towerId,
          society_id: towerData.society_id,
          is_active: true,
          assigned_at: getLocalDateString(),
        }, {
          onConflict: 'distributor_id,tower_id'
        });

      if (error) throw error;

      Toast.show({
        type: 'success',
        text1: 'Building Assigned',
        text2: `${towerName} assigned to ${distributorName}`
      });
      await loadData();
    } catch (error: any) {
      console.error('Error assigning building:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to assign building'
      });
    } finally {
      setProcessing(null);
    }
  };

  const handleRemove = async (towerId: string, towerName: string) => {
    Alert.alert(
      'Remove Assignment',
      `Remove ${towerName} from ${distributorName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessing(towerId);
              
              // Update is_active to false instead of deleting
              const { error } = await supabase
                .from('distributor_building_assignments')
                .update({ is_active: false })
                .eq('distributor_id', distributorId)
                .eq('tower_id', towerId);

              if (error) throw error;

              Toast.show({
                type: 'success',
                text1: 'Building Removed',
                text2: `${towerName} removed from ${distributorName}`
              });
              await loadData();
            } catch (error: any) {
              console.error('Error removing building:', error);
              Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to remove building'
              });
            } finally {
              setProcessing(null);
            }
          },
        },
      ]
    );
  };

  const isAssigned = (towerId: string) => {
    return assignedBuildings.some(ab => ab.tower_id === towerId && ab.is_active);
  };

  const filterBuildings = (buildings: Building[] | DistributorBuilding[]) => {
    if (!searchQuery) return buildings;
    
    const query = searchQuery.toLowerCase();
    return buildings.filter(b => 
      b.tower_name.toLowerCase().includes(query) ||
      b.society_name.toLowerCase().includes(query)
    );
  };

  const groupBySociety = (buildings: Building[] | DistributorBuilding[]) => {
    const grouped: { [key: string]: (Building | DistributorBuilding)[] } = {};
    buildings.forEach(building => {
      if (!grouped[building.society_name]) {
        grouped[building.society_name] = [];
      }
      grouped[building.society_name].push(building);
    });
    return grouped;
  };

  if (loading) {
    return (
      <AppLayout>
        <AppBar
          title="Building Assignment"
          subtitle={distributorName}
          onBack={() => navigation.goBack()}
          variant="surface"
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </AppLayout>
    );
  }

  const filteredAssigned = filterBuildings(assignedBuildings.filter(ab => ab.is_active));
  const filteredAvailable = filterBuildings(availableBuildings.filter(b => !isAssigned(b.tower_id)));
  const groupedAssigned = groupBySociety(filteredAssigned as DistributorBuilding[]);
  const groupedAvailable = groupBySociety(filteredAvailable as Building[]);

  return (
    <AppLayout>
      <AppBar
        title="Building Assignment"
        subtitle={distributorName}
        onBack={() => navigation.goBack()}
        variant="surface"
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={[styles.statCard, { backgroundColor: '#E3F2FD' }]}>
            <Text style={styles.statValue}>{stats.totalAssigned}</Text>
            <Text style={styles.statLabel}>Buildings</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#F3E5F5' }]}>
            <Text style={[styles.statValue, { color: '#9C27B0' }]}>{stats.totalUnits}</Text>
            <Text style={styles.statLabel}>Total Units</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#E8F5E9' }]}>
            <Text style={[styles.statValue, { color: '#4CAF50' }]}>{stats.totalSubscriptions}</Text>
            <Text style={styles.statLabel}>Subscriptions</Text>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search buildings or societies..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#999"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={styles.clearIcon}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'assigned' && styles.tabActive]}
            onPress={() => setActiveTab('assigned')}
          >
            <Text style={[styles.tabText, activeTab === 'assigned' && styles.tabTextActive]}>
              Assigned ({assignedBuildings.filter(ab => ab.is_active).length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'available' && styles.tabActive]}
            onPress={() => setActiveTab('available')}
          >
            <Text style={[styles.tabText, activeTab === 'available' && styles.tabTextActive]}>
              Available ({availableBuildings.filter(b => !isAssigned(b.tower_id)).length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Assigned Buildings */}
        {activeTab === 'assigned' && (
          <View style={styles.tabContent}>
            {filteredAssigned.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🏢</Text>
                <Text style={styles.emptyTitle}>
                  {searchQuery ? 'No matching buildings' : 'No buildings assigned'}
                </Text>
                <Text style={styles.emptyDescription}>
                  {searchQuery ? 'Try a different search term' : 'Switch to Available tab to assign buildings'}
                </Text>
              </View>
            ) : (
              Object.entries(groupedAssigned).map(([societyName, buildings]) => (
                <View key={societyName} style={styles.societyGroup}>
                  <Text style={styles.societyGroupTitle}>🏘️ {societyName}</Text>
                  {(buildings as DistributorBuilding[]).map(building => (
                    <View key={building.tower_id} style={styles.buildingCard}>
                      <View style={styles.buildingHeader}>
                        <View style={styles.buildingInfo}>
                          <Text style={styles.buildingName}>{building.tower_name}</Text>
                          <Text style={styles.buildingDetails}>
                            {building.floors} floors • {building.total_units || 0} units
                          </Text>
                          {building.active_subscriptions !== undefined && (
                            <Text style={styles.subscriptionText}>
                              ✓ {building.active_subscriptions} active subscriptions
                            </Text>
                          )}
                        </View>
                        <View style={styles.assignedBadge}>
                          <Text style={styles.assignedBadgeText}>✓</Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[styles.removeButton, processing === building.tower_id && styles.buttonDisabled]}
                        onPress={() => handleRemove(building.tower_id, building.tower_name)}
                        disabled={processing === building.tower_id}
                      >
                        {processing === building.tower_id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.removeButtonText}>Remove Assignment</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ))
            )}
          </View>
        )}

        {/* Available Buildings */}
        {activeTab === 'available' && (
          <View style={styles.tabContent}>
            {filteredAvailable.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🎉</Text>
                <Text style={styles.emptyTitle}>
                  {searchQuery ? 'No matching buildings' : 'All buildings assigned!'}
                </Text>
                <Text style={styles.emptyDescription}>
                  {searchQuery ? 'Try a different search term' : 'This distributor has been assigned to all available buildings'}
                </Text>
              </View>
            ) : (
              Object.entries(groupedAvailable).map(([societyName, buildings]) => (
                <View key={societyName} style={styles.societyGroup}>
                  <Text style={styles.societyGroupTitle}>🏘️ {societyName}</Text>
                  {(buildings as Building[]).map(building => (
                    <View key={building.tower_id} style={styles.buildingCard}>
                      <View style={styles.buildingInfo}>
                        <Text style={styles.buildingName}>{building.tower_name}</Text>
                        <Text style={styles.buildingDetails}>
                          {building.floors} floors • {building.total_units} units
                        </Text>
                        {building.assigned_distributors && building.assigned_distributors.length > 0 && (
                          <Text style={styles.assignedToText}>
                            📍 Currently: {building.assigned_distributors.join(', ')}
                          </Text>
                        )}
                      </View>
                      <TouchableOpacity
                        style={[styles.assignButton, processing === building.tower_id && styles.buttonDisabled]}
                        onPress={() => handleAssign(building.tower_id, building.tower_name)}
                        disabled={processing === building.tower_id}
                      >
                        {processing === building.tower_id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.assignButtonText}>Assign</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ))
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </AppLayout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
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
  statsContainer: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
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
    color: '#7C3AED',
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    fontWeight: '500',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1E293B',
  },
  clearIcon: {
    fontSize: 16,
    color: '#64748B',
    padding: 6,
  },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
  },
  tabActive: {
    backgroundColor: '#7C3AED',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  tabContent: {
    paddingHorizontal: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginTop: 8,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  societyGroup: {
    marginBottom: 20,
  },
  societyGroupTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  buildingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  buildingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  buildingInfo: {
    flex: 1,
  },
  buildingName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  buildingDetails: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 4,
  },
  subscriptionText: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '600',
  },
  assignedToText: {
    fontSize: 12,
    color: '#F59E0B',
    fontStyle: 'italic',
    marginTop: 4,
  },
  assignedBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  assignedBadgeText: {
    fontSize: 16,
    color: '#10B981',
  },
  assignButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginTop: 12,
  },
  assignButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  removeButton: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginTop: 12,
  },
  removeButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
