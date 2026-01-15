import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  RefreshControl, 
  ActivityIndicator,
  Dimensions 
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppLayout } from '../../components/AppLayout';
import { AppBar } from '../../components/AppBar';
import { theme } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { getAuthUserId } from '../../utils/auth';
import { supabase } from '../../services/supabase';
import type { DistributorScreenProps } from '../../navigation/types';

const { width } = Dimensions.get('window');

interface Building {
  assignment_id: string;
  tower_id: string;
  tower_name: string;
  society_id: string;
  society_name: string;
  floors: number | null;
  is_active: boolean;
  total_units: number;
  active_subscriptions: number;
}

export const AssignedBuildingsScreen = ({ navigation }: DistributorScreenProps<'AssignedBuildings'>) => {
  const { user } = useAuthStore();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBuildings();
  }, []);

  const loadBuildings = async () => {
    try {
      setError(null);
      
      const userId = await getAuthUserId();
      if (!userId) return;

      const { data: dist } = await supabase
        .from('distributors')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (!dist?.id) {
        setError('Distributor not found');
        return;
      }

      const { data, error: buildingError } = await supabase.rpc('get_distributor_buildings', {
        p_distributor_id: dist.id
      });

      if (buildingError) throw buildingError;

      setBuildings((data || []) as Building[]);
    } catch (err: any) {
      console.error('Error loading buildings:', err);
      setError(err.message || 'Failed to load buildings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadBuildings();
  };

  const handleBuildingPress = (building: Building) => {
    navigation.navigate('BuildingDeliveries', { 
      buildingId: building.tower_id, 
      buildingName: building.tower_name,
      societyName: building.society_name
    });
  };

  // Calculate summary stats
  const totalUnits = buildings.reduce((acc, b) => acc + (b.total_units || 0), 0);
  const totalSubscriptions = buildings.reduce((acc, b) => acc + (b.active_subscriptions || 0), 0);

  const renderItem = ({ item, index }: { item: Building; index: number }) => {
    const subscriptionRate = item.total_units > 0 
      ? Math.round((item.active_subscriptions / item.total_units) * 100) 
      : 0;
    
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handleBuildingPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.buildingIconContainer}>
            <Text style={styles.buildingIcon}>🏢</Text>
          </View>
          <View style={styles.buildingInfo}>
            <Text style={styles.buildingName}>{item.tower_name}</Text>
            <View style={styles.societyRow}>
              <Text style={styles.societyIcon}>📍</Text>
              <Text style={styles.societyText}>{item.society_name}</Text>
            </View>
          </View>
        </View>

        {/* Stats Section */}
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <View style={[styles.statIconContainer, { backgroundColor: '#EEF2FF' }]}>
              <Text style={styles.statEmoji}>🏠</Text>
            </View>
            <View style={styles.statInfo}>
              <Text style={styles.statValue}>{item.total_units || 0}</Text>
              <Text style={styles.statLabel}>Units</Text>
            </View>
          </View>
          
          <View style={styles.statDivider} />
          
          <View style={styles.statItem}>
            <View style={[styles.statIconContainer, { backgroundColor: '#ECFDF5' }]}>
              <Text style={styles.statEmoji}>✅</Text>
            </View>
            <View style={styles.statInfo}>
              <Text style={[styles.statValue, { color: '#10B981' }]}>
                {item.active_subscriptions || 0}
              </Text>
              <Text style={styles.statLabel}>Active</Text>
            </View>
          </View>
          
          <View style={styles.statDivider} />
          
          <View style={styles.statItem}>
            <View style={[styles.statIconContainer, { backgroundColor: '#FEF3C7' }]}>
              <Text style={styles.statEmoji}>📊</Text>
            </View>
            <View style={styles.statInfo}>
              <Text style={[styles.statValue, { color: '#F59E0B' }]}>
                {subscriptionRate}%
              </Text>
              <Text style={styles.statLabel}>Rate</Text>
            </View>
          </View>
        </View>

        {/* Action Button */}
        <TouchableOpacity 
          style={styles.viewButton}
          onPress={() => handleBuildingPress(item)}
        >
          <Text style={styles.viewButtonText}>View Deliveries</Text>
          <Text style={styles.viewButtonArrow}>→</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <AppLayout>
        <AppBar title="My Buildings" onBack={() => navigation.goBack()} variant="surface" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading buildings...</Text>
        </View>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <AppBar title="My Buildings" onBack={() => navigation.goBack()} variant="surface" />
      
      {error ? (
        <TouchableOpacity style={styles.errorBanner} onPress={loadBuildings}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <View style={styles.errorContent}>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorRetry}>Tap to retry</Text>
          </View>
        </TouchableOpacity>
      ) : null}

      {buildings.length === 0 && !error ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Text style={styles.emptyIcon}>🏢</Text>
          </View>
          <Text style={styles.emptyTitle}>No Buildings Assigned</Text>
          <Text style={styles.emptyDescription}>
            You don't have any buildings assigned yet. Contact admin for assignments.
          </Text>
          <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
            <Text style={styles.refreshButtonText}>🔄 Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={buildings}
          keyExtractor={(item) => item.tower_id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          ListHeaderComponent={
            buildings.length > 0 ? (
              <>
                {/* Summary Card */}
                <LinearGradient
                  colors={['#3B82F6', '#2563EB']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.summaryCard}
                >
                  <View style={styles.summaryHeader}>
                    <View style={styles.summaryIconContainer}>
                      <Text style={styles.summaryIcon}>📋</Text>
                    </View>
                    <View style={styles.summaryTitleContainer}>
                      <Text style={styles.summaryTitle}>Your Coverage</Text>
                      <Text style={styles.summarySubtitle}>Buildings assigned to you</Text>
                    </View>
                  </View>
                  
                  <View style={styles.summaryStats}>
                    <View style={styles.summaryStatItem}>
                      <Text style={styles.summaryStatValue}>{buildings.length}</Text>
                      <Text style={styles.summaryStatLabel}>Buildings</Text>
                    </View>
                    <View style={styles.summaryStatDivider} />
                    <View style={styles.summaryStatItem}>
                      <Text style={styles.summaryStatValue}>{totalUnits}</Text>
                      <Text style={styles.summaryStatLabel}>Total Units</Text>
                    </View>
                    <View style={styles.summaryStatDivider} />
                    <View style={styles.summaryStatItem}>
                      <Text style={styles.summaryStatValue}>{totalSubscriptions}</Text>
                      <Text style={styles.summaryStatLabel}>Subscribers</Text>
                    </View>
                  </View>
                </LinearGradient>

                {/* Section Header */}
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>🏢 All Buildings</Text>
                  <View style={styles.sectionBadge}>
                    <Text style={styles.sectionBadgeText}>{buildings.length}</Text>
                  </View>
                </View>
              </>
            ) : null
          }
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={handleRefresh} 
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListFooterComponent={<View style={{ height: 40 }} />}
        />
      )}
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
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  listContainer: {
    padding: 16,
  },

  // Summary Card
  summaryCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  summaryIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  summaryIcon: {
    fontSize: 24,
  },
  summaryTitleContainer: {
    flex: 1,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: 'white',
  },
  summarySubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  summaryStats: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    padding: 16,
  },
  summaryStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryStatValue: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
  },
  summaryStatLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },
  summaryStatDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginRight: 8,
  },
  sectionBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  sectionBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary,
  },

  // Building Card
  card: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  buildingIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  buildingIcon: {
    fontSize: 26,
  },
  buildingInfo: {
    flex: 1,
  },
  buildingName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  societyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  societyIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  societyText: {
    fontSize: 13,
    color: '#64748B',
  },

  // Stats Container
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  statEmoji: {
    fontSize: 16,
  },
  statInfo: {
    flex: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  statDivider: {
    width: 1,
    height: '100%',
    backgroundColor: '#E2E8F0',
    marginHorizontal: 8,
  },

  // View Button
  viewButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'white',
    marginRight: 8,
  },
  viewButtonArrow: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
  },

  // Error Banner
  errorBanner: {
    backgroundColor: '#FEF2F2',
    margin: 16,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  errorContent: {
    flex: 1,
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '500',
  },
  errorRetry: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 2,
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#F8FAFC',
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  refreshButton: {
    marginTop: 24,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  refreshButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
});
