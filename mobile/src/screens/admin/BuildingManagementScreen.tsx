import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator } from 'react-native';
import { AppLayout } from '../../components/AppLayout';
import { theme } from '../../theme';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { ErrorBanner } from '../../components/ErrorBanner';
import { useToast } from '../../components/Toast';
import { supabase } from '../../services/supabase';

interface Building {
  id: any;
  name: any;
  slug: any;
  society: any;
}

export const BuildingManagementScreen = () => {
  const { show: showToast } = useToast();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadBuildings();
  }, []);

  const loadBuildings = async () => {
    setError(null);
    // Using society_towers as the schema uses towers, not buildings
    const { data, error: err } = await supabase
      .from('society_towers')
      .select('id,name,society:societies(id,name)')
      .order('name');
    setLoading(false);
    setRefreshing(false);
    if (err) {
      setError(err.message || 'Failed to load buildings');
    } else {
      // Map to expected shape with slug fallback
      setBuildings((data || []).map((t: any) => ({ ...t, slug: t.name?.toLowerCase().replace(/\s+/g, '-') })));
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadBuildings();
  };

  const filtered = buildings.filter(b => b.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const renderItem = ({ item }: { item: Building }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.buildingName}>{item.name}</Text>
        <Text style={styles.badge}>🏢</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.societyText}>{item.society?.name}</Text>
        <Text style={styles.projectText}>{item.society?.project?.name}</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <AppLayout>
        <Text style={styles.title}>Building Management</Text>
        <SkeletonList count={5} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Text style={styles.title}>Building Management</Text>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search buildings..."
          placeholderTextColor={theme.colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>
      {error && <ErrorBanner message={error} onRetry={loadBuildings} style={{ marginHorizontal: theme.spacing.md, marginBottom: theme.spacing.md }} />}
      {filtered.length === 0 ? (
        <EmptyState icon="🏢" title="No buildings" description="No buildings match your search or none have been added yet." />
      ) : (
        <FlatList
          data={filtered}
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
  container: { flex: 1, backgroundColor: theme.colors.background },
  title: { ...theme.typography.h2, color: theme.colors.text, marginHorizontal: theme.spacing.md, marginTop: theme.spacing.md },
  searchContainer: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.md },
  searchInput: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, padding: theme.spacing.md, fontSize: 14, borderWidth: 1, borderColor: theme.colors.border },
  list: { padding: theme.spacing.md },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, padding: theme.spacing.md, ...theme.shadows.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.sm },
  buildingName: { ...theme.typography.h3, fontSize: 16, color: theme.colors.text },
  badge: { fontSize: 20 },
  cardBody: {},
  societyText: { ...theme.typography.body, fontSize: 14, color: theme.colors.text, marginBottom: 4 },
  projectText: { ...theme.typography.caption, color: theme.colors.textSecondary },
});
