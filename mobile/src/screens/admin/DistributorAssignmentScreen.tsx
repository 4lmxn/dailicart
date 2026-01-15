import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { AppLayout } from '../../components/AppLayout';
import { theme } from '../../theme';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { ErrorBanner } from '../../components/ErrorBanner';
import { useToast } from '../../components/Toast';
import { supabase } from '../../services/supabase';

interface Assignment {
  id: any;
  distributor: any;
  society: any;
  tower?: any;
  assigned_at?: any;
  effective_from?: any;
  effective_to?: any;
  is_active: any;
}

export const DistributorAssignmentScreen = () => {
  const { show: showToast } = useToast();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAssignments();
  }, []);

  const loadAssignments = async () => {
    setError(null);
    const { data, error: err } = await supabase
      .from('distributor_building_assignments')
      .select('id,assigned_at,is_active,distributor:distributors(id,user:users(name,phone)),society:societies(id,name,pincode),tower:society_towers(id,name)')
      .order('assigned_at', { ascending: false });
    setLoading(false);
    setRefreshing(false);
    if (err) {
      setError(err.message || 'Failed to load assignments');
    } else {
      setAssignments(data || []);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadAssignments();
  };

  const renderItem = ({ item }: { item: Assignment }) => {
    // Handle both field name variations
    const assignedDate = item.effective_from || item.assigned_at;
    const distributor = Array.isArray(item.distributor) ? item.distributor[0] : item.distributor;
    const society = Array.isArray(item.society) ? item.society[0] : item.society;
    const tower = Array.isArray(item.tower) ? item.tower[0] : item.tower;
    const user = Array.isArray(distributor?.user) ? distributor?.user[0] : distributor?.user;
    
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.distributorName}>{user?.name || 'Unknown'}</Text>
          <View style={[styles.statusBadge, item.is_active && styles.statusActive]}>
            <Text style={styles.statusText}>{item.is_active ? 'Active' : 'Inactive'}</Text>
          </View>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.buildingText}>🏢 {society?.name}{tower?.name ? ` - ${tower.name}` : ''}</Text>
          {assignedDate && <Text style={styles.dateText}>From: {new Date(assignedDate).toLocaleDateString()}</Text>}
          {item.effective_to && <Text style={styles.dateText}>To: {new Date(item.effective_to).toLocaleDateString()}</Text>}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <AppLayout>
        <Text style={styles.title}>Distributor Assignments</Text>
        <SkeletonList count={5} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Text style={styles.title}>Distributor Assignments</Text>
      {error && <ErrorBanner message={error} onRetry={loadAssignments} style={{ marginHorizontal: theme.spacing.md, marginBottom: theme.spacing.md }} />}
      {assignments.length === 0 ? (
        <EmptyState icon="📋" title="No assignments" description="No distributor assignments found. Create new assignments to manage deliveries." />
      ) : (
        <FlatList
          data={assignments}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.md }} />}
        />
      )}
    </AppLayout>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  title: { fontSize: 24, fontWeight: '700', color: '#1E293B', marginHorizontal: 20, marginVertical: 20, letterSpacing: -0.5 },
  list: { padding: 20 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  distributorName: { fontSize: 17, fontWeight: '700', color: '#1E293B', letterSpacing: -0.3 },
  statusBadge: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#F1F5F9' },
  statusActive: { backgroundColor: '#D1FAE5' },
  statusText: { fontSize: 12, color: '#1E293B', fontWeight: '700' },
  cardBody: { gap: 6 },
  buildingText: { fontSize: 15, color: '#1E293B' },
  dateText: { fontSize: 14, color: '#64748B' },
});
