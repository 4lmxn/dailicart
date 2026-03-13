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
import { theme } from '../../theme';
import { AppLayout } from '../../components/AppLayout';
import { AppBar } from '../../components/AppBar';
import type { AdminScreenProps } from '../../navigation/types';
import { formatCurrency, getLocalDateString, getLocalDateOffsetString } from '../../utils/helpers';
import { supabase } from '../../services/supabase';
import { AdminService } from '../../services/api/admin';
import { useToast } from '../../components/Toast';

interface DistributorDetailScreenProps {}

interface DistributorData {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  email: string;
  zone: string;
  vehicleNumber: string;
  totalDeliveries: number;
  onTimePercentage: number;
  rating: number;
  totalCollection: number;
  earnings7d: number;
  isActive: boolean;
}

interface DeliveryStats {
  today: number;
  completed: number;
  pending: number;
  inTransit: number;
  week: number;
  month: number;
}

interface RouteAssignment {
  id: string;
  society: string;
  building: string;
  address: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

interface SalarySlip {
  id: string;
  periodStart: string;
  periodEnd: string;
  totalEarnings: number;
  bonuses: number;
  penalties: number;
  status: string;
}

interface StockMovement {
  id: string;
  date: string;
  product: string;
  quantity: number;
  type: string;
  notes?: string;
}

export const DistributorDetailScreen: React.FC<AdminScreenProps<'DistributorDetail'>> = ({ route, navigation }) => {
  const { distributorId } = route.params;
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [distributor, setDistributor] = useState<DistributorData | null>(null);
  const [deliveryStats, setDeliveryStats] = useState<DeliveryStats | null>(null);
  const [routes, setRoutes] = useState<RouteAssignment[]>([]);
  const [assignedBuildings, setAssignedBuildings] = useState<any[]>([]);
  const [salarySlips, setSalarySlips] = useState<SalarySlip[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'routes' | 'salary' | 'stock'>('overview');
  
  // Modals
  const [showEditModal, setShowEditModal] = useState(false);
  
  // Edit form
  const [editForm, setEditForm] = useState({
    vehicleNumber: '',
    isActive: true,
  });

  useEffect(() => {
    loadDistributorData();
  }, [distributorId]);

  const loadDistributorData = async () => {
    try {
      setLoading(true);
      // Load distributor core first (others depend on its id)
      const distData = await loadDistributor();
      if (distData) {
        await Promise.all([
          loadDeliveryStats(distData.id),
          loadRoutes(distData.id),
          loadBuildingAssignments(distData.id),
          loadSalarySlips(distData.id),
          loadStockMovements(distData.id),
        ]);
      }
    } catch (error) {
      console.error('Error loading distributor data:', error);
      Alert.alert('Error', 'Failed to load distributor details');
    } finally {
      setLoading(false);
    }
  };

  const loadDistributor = async (): Promise<DistributorData | null> => {
    const { data, error } = await AdminService.getDistributorDetails(distributorId);
    if (error) throw error;
    if (!data) throw new Error('Distributor not found');

    // Get 7-day earnings
    const end = new Date();
    const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
    const { data: earnings } = await AdminService.getDistributorEarnings(
      data.id,
      getLocalDateString(start),
      getLocalDateString(end)
    );

    // Get total deliveries count
    const { count: totalDeliveries } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_distributor_id', data.id)
      .eq('status', 'delivered');

    // Get on-time percentage (completed vs total assigned)
    const { data: allOrders } = await supabase
      .from('orders')
      .select('status')
      .eq('assigned_distributor_id', data.id);
    
    const totalAssigned = allOrders?.length || 0;
    const completedCount = allOrders?.filter((o: any) => o.status === 'delivered').length || 0;
    const onTimePercentage = totalAssigned > 0 ? Math.round((completedCount / totalAssigned) * 100) : 0;

    const userRec = Array.isArray((data as any).users) ? (data as any).users[0] : (data as any).users;
    const distributorData: DistributorData = {
      id: data.id,
      user_id: data.user_id,
      name: userRec?.name || 'Distributor',
      phone: userRec?.phone || '',
      email: userRec?.email || '',
      zone: Array.isArray(data.assigned_areas) ? data.assigned_areas.join(', ') : (data.assigned_areas || '—'),
      vehicleNumber: data.vehicle_number || '',
      totalDeliveries: totalDeliveries || 0,
      onTimePercentage: onTimePercentage,
      rating: 5.0,
      totalCollection: earnings?.total_earnings || 0,
      earnings7d: earnings?.total_earnings || 0,
      isActive: data.is_active !== false,
    };
    
    setDistributor(distributorData);

    setEditForm({
      vehicleNumber: data.vehicle_number || '',
      isActive: data.is_active !== false,
    });
    
    return distributorData;
  };

  const loadDeliveryStats = async (distId: string) => {
    const today = getLocalDateString();
    const weekAgo = getLocalDateOffsetString(-6);
    const monthAgo = getLocalDateOffsetString(-29);

    const [todayRes, weekRes, monthRes] = await Promise.all([
      supabase.from('orders').select('status').eq('assigned_distributor_id', distId).eq('delivery_date', today),
      supabase.from('orders').select('status').eq('assigned_distributor_id', distId).gte('delivery_date', weekAgo),
      supabase.from('orders').select('status').eq('assigned_distributor_id', distId).gte('delivery_date', monthAgo),
    ]);

    const todayOrders = todayRes.data || [];
    const weekOrders = weekRes.data || [];
    const monthOrders = monthRes.data || [];

    setDeliveryStats({
      today: todayOrders.length,
      completed: todayOrders.filter((d: any) => d.status === 'delivered').length,
      pending: todayOrders.filter((d: any) => d.status === 'pending').length,
      inTransit: todayOrders.filter((d: any) => d.status === 'in_transit').length,
      week: weekOrders.length,
      month: monthOrders.length,
    });
  };

  const loadRoutes = async (distId: string) => {
    const { data, error } = await AdminService.getDistributorAssignments(distId);
    if (error) {
      console.error('Error loading routes:', error);
      return;
    }

    setRoutes(
      (data || []).map((a: any) => ({
        id: a.id,
        society: a.society?.name || '—',
        building: a.tower?.name || '—',
        address: a.society?.address || '—',
        effectiveFrom: a.assigned_at,
        effectiveTo: undefined,
      }))
    );
  };

  const loadBuildingAssignments = async (distId: string) => {
    // Query directly from table instead of RPC that may not exist
    const { data, error } = await supabase
      .from('distributor_building_assignments')
      .select(`
        id,
        assigned_at,
        is_active,
        society:societies (id, name),
        tower:society_towers (id, name)
      `)
      .eq('distributor_id', distId)
      .eq('is_active', true);
    
    if (error) {
      console.error('Error loading building assignments:', error);
      setAssignedBuildings([]);
      return;
    }
    
    setAssignedBuildings((data || []).map((a: any) => ({
      id: a.id,
      society_id: a.society?.id || '',
      society_name: a.society?.name || '—',
      tower_id: a.tower?.id || '',
      tower_name: a.tower?.name || '—',
      assigned_at: a.assigned_at,
    })));
  };

  const loadSalarySlips = async (distId: string) => {
    const { data, error } = await AdminService.getDistributorSalarySlips(distId, 6);
    if (error) {
      console.error('Error loading salary slips:', error);
      return;
    }

    setSalarySlips(
      (data || []).map((slip: any) => ({
        id: slip.id,
        periodStart: slip.period_start,
        periodEnd: slip.period_end,
        totalEarnings: slip.base_earnings || 0,
        bonuses: slip.bonus_amount || 0,
        penalties: slip.deductions || 0,
        status: slip.status || 'pending',
      }))
    );
  };

  const loadStockMovements = async (distId: string) => {
    const { data, error } = await AdminService.getDistributorStockMovements(distId, 20);
    if (error) {
      console.error('Error loading stock movements:', error);
      return;
    }

    setStockMovements(
      (data || []).map((mov: any) => ({
        id: mov.id,
        date: mov.movement_date,
        product: mov.product_name || 'Unknown Product',
        quantity: mov.quantity || 0,
        type: mov.movement_type || 'outbound',
        notes: mov.notes,
      }))
    );
  };

  const handleSaveEdit = async () => {
    if (!distributor) return;
    try {
      const { error } = await supabase
        .from('distributors')
        .update({
          vehicle_number: editForm.vehicleNumber,
          is_active: editForm.isActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', distributor.id);

      if (error) throw error;

      await loadDistributor();
      setShowEditModal(false);
      Alert.alert('✅ Updated', 'Distributor profile updated successfully');
    } catch (error) {
      console.error('Error updating distributor:', error);
      Alert.alert('Error', 'Failed to update distributor profile');
    }
  };

  const handleToggleActive = async () => {
    if (!distributor) return;
    const newStatus = !distributor.isActive;
    Alert.alert(
      newStatus ? 'Activate Distributor' : 'Deactivate Distributor',
      `Are you sure you want to ${newStatus ? 'activate' : 'deactivate'} this distributor?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: newStatus ? 'default' : 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('distributors')
                .update({
                  is_active: newStatus,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', distributor.id);

              if (error) throw error;

              await loadDistributor();
              Alert.alert('✅ Updated', `Distributor ${newStatus ? 'activated' : 'deactivated'} successfully`);
            } catch (error) {
              console.error('Error toggling distributor status:', error);
              Alert.alert('Error', 'Failed to update distributor status');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <AppLayout>
        <AppBar 
          title="Distributor Details" 
          onBack={() => navigation.goBack()} 
          variant="surface" 
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading distributor data...</Text>
        </View>
      </AppLayout>
    );
  }

  if (!distributor) {
    return (
      <AppLayout>
        <AppBar 
          title="Distributor Details" 
          onBack={() => navigation.goBack()} 
          variant="surface" 
        />
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Distributor not found</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.emptyButton}>
            <Text style={styles.emptyButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </AppLayout>
    );
  }

  const renderOverview = () => (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
      {/* Profile Section */}
      <View style={styles.section}>
        <View style={styles.profileHeader}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>{distributor.name.charAt(0)}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{distributor.name}</Text>
            <Text style={styles.profileDetail}>{distributor.phone}</Text>
            <Text style={styles.profileDetail}>{distributor.email}</Text>
            <View style={[styles.statusBadge, { backgroundColor: distributor.isActive ? '#E8F5E9' : '#FFEBEE' }]}>
              <Text style={[styles.statusBadgeText, { color: distributor.isActive ? '#4CAF50' : '#F44336' }]}>
                {distributor.isActive ? '✅ Active' : '⏸️ Inactive'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Zone & Vehicle Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Assignment Details</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>🏘️ Assigned Societies</Text>
            <Text style={styles.infoValue}>
              {assignedBuildings.length > 0 ? assignedBuildings.length : 'None'}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>🚗 Vehicle Number</Text>
            <Text style={styles.infoValue}>{distributor.vehicleNumber || 'Not provided'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>📅 Member Since</Text>
            <Text style={styles.infoValue}>{new Date().toLocaleDateString()}</Text>
          </View>
        </View>
      </View>

      {/* Delivery Stats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Delivery Stats</Text>
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: '#E3F2FD' }]}>
            <Text style={styles.statValue}>{deliveryStats?.today || 0}</Text>
            <Text style={styles.statLabel}>Today</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#E8F5E9' }]}>
            <Text style={styles.statValue}>{deliveryStats?.completed || 0}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#FFF3E0' }]}>
            <Text style={styles.statValue}>{deliveryStats?.week || 0}</Text>
            <Text style={styles.statLabel}>This Week</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#E1BEE7' }]}>
            <Text style={styles.statValue}>{deliveryStats?.month || 0}</Text>
            <Text style={styles.statLabel}>This Month</Text>
          </View>
        </View>
      </View>

      {/* Earnings & Performance */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Earnings & Performance</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>💵 Last 7 Days Earnings</Text>
            <Text style={[styles.infoValue, { color: theme.colors.success, fontSize: 18, fontWeight: '700' }]}>
              {formatCurrency(distributor.earnings7d)}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>💰 Total Collection</Text>
            <Text style={[styles.infoValue, { color: theme.colors.success }]}>
              {formatCurrency(distributor.totalCollection)}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>📋 Salary Slips</Text>
            <Text style={styles.infoValue}>{salarySlips.length} available</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>📦 Stock Issues</Text>
            <Text style={styles.infoValue}>{stockMovements.length} movements</Text>
          </View>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.actionButton} onPress={() => setShowEditModal(true)}>
          <Text style={styles.actionButtonText}>✏️ Edit Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.actionButton, styles.actionButtonPrimary]} 
          onPress={() => navigation.navigate('BuildingAssignment', { distributorId: distributor.id, distributorName: distributor.name })}
        >
          <Text style={styles.actionButtonText}>🏘️ Assign Buildings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleToggleActive}>
          <Text style={styles.actionButtonText}>
            {distributor.isActive ? '⏸️ Deactivate' : '✅ Activate'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.actionButtonSecondary]}>
          <Text style={[styles.actionButtonText, styles.actionButtonTextSecondary]}>
            📊 View Full Report
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  const handleRemoveBuilding = async (towerId: string, societyName: string, towerName: string) => {
    if (!distributor) return;
    
    Alert.alert(
      'Remove Assignment',
      `Remove ${towerName} (${societyName}) from ${distributor.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              // Update is_active to false instead of deleting
              const { error } = await supabase
                .from('distributor_building_assignments')
                .update({ is_active: false })
                .eq('distributor_id', distributor.id)
                .eq('tower_id', towerId);

              if (error) throw error;

              toast.show(`Building removed - ${towerName} unassigned from ${distributor.name}`, { type: 'success' });

              await loadBuildingAssignments(distributor.id);
            } catch (error: any) {
              console.error('Error removing building:', error);
              toast.show(error.message || 'Failed to remove building assignment', { type: 'error' });
            }
          }
        }
      ]
    );
  };

  const renderRoutes = () => {
    // Group buildings by society
    const groupedBuildings = assignedBuildings.reduce((acc: any, building: any) => {
      const societyKey = building.society_id || building.society_name || 'unknown';
      if (!acc[societyKey]) {
        acc[societyKey] = {
          society_id: building.society_id,
          society_name: building.society_name,
          buildings: []
        };
      }
      acc[societyKey].buildings.push(building);
      return acc;
    }, {});

    return (
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Building Assignments</Text>
            <TouchableOpacity 
              onPress={() => navigation.navigate('BuildingAssignment', { distributorId })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Text style={[styles.linkText, { color: '#9C27B0' }]}>Manage</Text>
            </TouchableOpacity>
          </View>
          
          {assignedBuildings.length === 0 ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={styles.placeholderText}>No building assignments yet</Text>
              <TouchableOpacity 
                onPress={() => navigation.navigate('BuildingAssignment', { distributorId })}
                style={{ 
                  marginTop: 12, 
                  paddingHorizontal: 16, 
                  paddingVertical: 8, 
                  backgroundColor: '#9C27B0', 
                  borderRadius: 8 
                }}
              >
                <Text style={{ color: 'white', fontWeight: '600' }}>+ Assign Buildings</Text>
              </TouchableOpacity>
            </View>
          ) : (
            Object.entries(groupedBuildings).map(([societyKey, group]: [string, any]) => (
              <View key={societyKey} style={{ marginBottom: 16 }}>
                <Text style={[styles.routeArea, { marginBottom: 8 }]}>🏘️ {group.society_name}</Text>
                {group.buildings.map((building: any, index: number) => (
                  <View key={building.tower_id || `building-${index}`} style={styles.routeCard}>
                    <View style={styles.routeCardHeader}>
                      <Text style={styles.routeBuildingText}>🏢 {building.tower_name}</Text>
                      <TouchableOpacity 
                        onPress={() => handleRemoveBuilding(building.tower_id, building.society_name, building.tower_name)}
                      >
                        <Text style={{ color: '#F44336', fontSize: 12, fontWeight: '600' }}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.routeCardStats}>
                      <Text style={styles.routeCardStat}>
                        📦 {building.total_units || 0} units
                      </Text>
                      <Text style={styles.routeCardStat}>
                        ✓ {building.active_subscriptions || 0} active subscriptions
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ))
          )}
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  const renderSalary = () => (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Salary Slips</Text>
        {salarySlips.length === 0 ? (
          <Text style={styles.placeholderText}>No salary slips generated yet</Text>
        ) : (
          salarySlips.map((slip) => (
            <View key={slip.id} style={styles.routeCard}>
              <View style={styles.routeCardHeader}>
                <Text style={styles.routeArea}>
                  {new Date(slip.periodStart).toLocaleDateString()} - {new Date(slip.periodEnd).toLocaleDateString()}
                </Text>
                <View style={[styles.statusBadge, { 
                  backgroundColor: slip.status === 'paid' ? '#E8F5E9' : '#FFF3E0',
                  alignSelf: 'flex-start'
                }]}>
                  <Text style={[styles.statusBadgeText, {
                    color: slip.status === 'paid' ? '#4CAF50' : '#FF9800'
                  }]}>{slip.status.toUpperCase()}</Text>
                </View>
              </View>
              <View style={styles.divider} />
              <View style={styles.routeCardStats}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Base Earnings</Text>
                  <Text style={[styles.infoValue, { color: theme.colors.success }]}>{formatCurrency(slip.totalEarnings)}</Text>
                </View>
                {slip.bonuses > 0 && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Bonuses</Text>
                    <Text style={[styles.infoValue, { color: '#4CAF50' }]}>+{formatCurrency(slip.bonuses)}</Text>
                  </View>
                )}
                {slip.penalties > 0 && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Penalties</Text>
                    <Text style={[styles.infoValue, { color: '#F44336' }]}>-{formatCurrency(slip.penalties)}</Text>
                  </View>
                )}
                <View style={[styles.divider, { marginVertical: 8 }]} />
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { fontWeight: '700' }]}>Net Pay</Text>
                  <Text style={[styles.infoValue, { color: theme.colors.success, fontWeight: '700', fontSize: 17 }]}>
                    {formatCurrency(slip.totalEarnings + slip.bonuses - slip.penalties)}
                  </Text>
                </View>
              </View>
            </View>
          ))
        )}
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );

  const renderStock = () => (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Stock Movements</Text>
        {stockMovements.length === 0 ? (
          <Text style={styles.placeholderText}>No stock movements recorded</Text>
        ) : (
          stockMovements.map((mov) => (
            <View key={mov.id} style={styles.routeCard}>
              <View style={styles.routeCardHeader}>
                <Text style={styles.routeArea}>
                  {mov.type === 'issue' ? '📤' : mov.type === 'return' ? '📥' : '📦'} {mov.product}
                </Text>
                <Text style={styles.routeBuildingText}>{new Date(mov.date).toLocaleString()}</Text>
              </View>
              <View style={styles.routeCardStats}>
                <Text style={styles.routeCardStat}>
                  Quantity: {mov.quantity} • Type: {mov.type.toUpperCase()}
                </Text>
                {mov.notes && <Text style={styles.routeCardStat}>Note: {mov.notes}</Text>}
              </View>
            </View>
          ))
        )}
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );

  return (
    <AppLayout>
      <AppBar 
        title="Distributor Details" 
        onBack={() => navigation.goBack()} 
        variant="surface" 
      />

      {/* Tabs */}
      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBarContent}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'overview' && styles.tabActive]}
            onPress={() => setActiveTab('overview')}
          >
            <Text style={[styles.tabText, activeTab === 'overview' && styles.tabTextActive]}>Overview</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'routes' && styles.tabActive]}
            onPress={() => setActiveTab('routes')}
          >
            <Text style={[styles.tabText, activeTab === 'routes' && styles.tabTextActive]}>Assignments</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'salary' && styles.tabActive]}
            onPress={() => setActiveTab('salary')}
          >
            <Text style={[styles.tabText, activeTab === 'salary' && styles.tabTextActive]}>Salary</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'stock' && styles.tabActive]}
            onPress={() => setActiveTab('stock')}
          >
            <Text style={[styles.tabText, activeTab === 'stock' && styles.tabTextActive]}>Stock</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Content */}
      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'routes' && renderRoutes()}
      {activeTab === 'salary' && renderSalary()}
      {activeTab === 'stock' && renderStock()}

      {/* Edit Profile Modal */}
      <Modal visible={showEditModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Distributor Profile</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={styles.inputLabel}>Vehicle Number</Text>
              <TextInput
                style={styles.input}
                value={editForm.vehicleNumber}
                onChangeText={(text) => setEditForm({ ...editForm, vehicleNumber: text })}
                placeholder="Enter vehicle number"
              />
              <Text style={{ fontSize: 13, color: theme.colors.textSecondary, marginTop: 8 }}>
                Society assignments managed via Assignments tab
              </Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={() => setShowEditModal(false)}
                >
                  <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalButton} onPress={handleSaveEdit}>
                  <Text style={styles.modalButtonText}>Save Changes</Text>
                </TouchableOpacity>
              </View>
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
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  tabBarContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tab: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginRight: 8,
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: theme.colors.primary,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748B',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    margin: 20,
  },
  emptyText: {
    fontSize: 18,
    color: '#64748B',
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  section: {
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  linkText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#7C3AED',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarLargeText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  profileDetail: {
    fontSize: 15,
    color: '#64748B',
    marginBottom: 4,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    marginTop: 8,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoLabel: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  statCard: {
    width: '47%',
    margin: '1.5%',
    padding: 20,
    borderRadius: 20,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  actionButton: {
    backgroundColor: '#7C3AED',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButtonPrimary: {
    backgroundColor: '#7C3AED',
  },
  actionButtonSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  actionButtonTextSecondary: {
    color: '#1E293B',
  },
  routeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  routeCardHeader: {
    marginBottom: 10,
  },
  routeArea: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    letterSpacing: -0.3,
  },
  routeCardStats: {
    flexDirection: 'row',
    gap: 16,
  },
  routeCardStat: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  routeBuildingText: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 6,
  },
  placeholderText: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    padding: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
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
    padding: 28,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E293B',
    letterSpacing: -0.3,
  },
  modalClose: {
    fontSize: 28,
    color: '#64748B',
    fontWeight: '300',
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 8,
    marginTop: 16,
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
  modalButtons: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 28,
  },
  modalButton: {
    flex: 1,
    backgroundColor: '#7C3AED',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  modalButtonSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalButtonSecondaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748B',
  },
});
