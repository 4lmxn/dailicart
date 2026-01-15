import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { AppLayout } from '../../components/AppLayout';
import { theme } from '../../theme';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { ErrorBanner } from '../../components/ErrorBanner';
import { supabase } from '../../services/supabase';

interface Assignment {
  id: string;
  distributorName: string;
  societyName: string;
  towerName: string;
  assignedAt: string;
  isActive: boolean;
}

export const DistributorAssignmentScreen = () => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAssignments();
  }, []);

  const loadAssignments = async () => {
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('distributor_building_assignments')
        .select(`
          id,
          assigned_at,
          is_active,
          distributor_id,
          society_id,
          tower_id
        `)
        .order('assigned_at', { ascending: false });

      if (err) throw err;

      // Get related data in batch to avoid complex joins
      const distributorIds = [...new Set((data || []).map(d => d.distributor_id))];
      const societyIds = [...new Set((data || []).map(d => d.society_id))];
      const towerIds = [...new Set((data || []).map(d => d.tower_id).filter(Boolean))];

      const [distributorsRes, societiesRes, towersRes] = await Promise.all([
        supabase.from('distributors').select('id, user_id').in('id', distributorIds.length ? distributorIds : ['']),
        supabase.from('societies').select('id, name').in('id', societyIds.length ? societyIds : ['']),
        supabase.from('society_towers').select('id, name').in('id', towerIds.length ? towerIds : ['']),
      ]);

      // Get user names for distributors
      const userIds = (distributorsRes.data || []).map(d => d.user_id);
      const usersRes = await supabase.from('users').select('id, name').in('id', userIds.length ? userIds : ['']);

      // Create lookup maps
      const userMap = new Map((usersRes.data || []).map(u => [u.id, u.name]));
      const distUserMap = new Map((distributorsRes.data || []).map(d => [d.id, userMap.get(d.user_id) || 'Unknown']));
      const societyMap = new Map((societiesRes.data || []).map(s => [s.id, s.name]));
      const towerMap = new Map((towersRes.data || []).map(t => [t.id, t.name]));

      // Transform to clean format
      const formatted: Assignment[] = (data || []).map(a => ({
        id: a.id,
        distributorName: distUserMap.get(a.distributor_id) || 'Unknown',
        societyName: societyMap.get(a.society_id) || 'Unknown',
        towerName: towerMap.get(a.tower_id) || '',
        assignedAt: a.assigned_at,
        isActive: a.is_active,
      }));

      setAssignments(formatted);
    } catch (err: any) {
      setError(err.message || 'Failed to load assignments');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadAssignments();
  };

  const renderItem = ({ item }: { item: Assignment }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.distributorName}>{item.distributorName}</Text>
        <View style={[styles.statusBadge, item.isActive && styles.statusActive]}>
          <Text style={styles.statusText}>{item.isActive ? 'Active' : 'Inactive'}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.buildingText}>
          🏢 {item.societyName}{item.towerName ? ` - ${item.towerName}` : ''}
        </Text>
        <Text style={styles.dateText}>
          From: {new Date(item.assignedAt).toLocaleDateString()}
        </Text>
      </View>
    </View>
  );

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
