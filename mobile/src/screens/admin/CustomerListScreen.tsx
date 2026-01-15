import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { CustomerAdminService } from '../../services/api/customers';
import { theme } from '../../theme';
import { AdminScreenProps } from '../../navigation/types';
import { useToast } from '../../components/Toast';
import { formatCurrency } from '../../utils/helpers';
import { EmptyState } from '../../components/EmptyState';
import { ErrorBanner } from '../../components/ErrorBanner';

interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  wallet: number;
  subscriptions: number;
  status: string;
  area: string;
}

export const CustomerListScreen: React.FC<AdminScreenProps<'CustomerList'>> = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;
  const [total, setTotal] = useState<number | null>(null);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'low' | 'active' | 'inactive'>('all');
  const toast = useToast();
  const navigation = useNavigation<any>();

  const fetchPage = useCallback(async (append: boolean) => {
    try {
      if (!append) setLoading(true); else setLoadingMore(true);
      setError(null);
      const { rows: data, total } = await CustomerAdminService.getCustomersPaged({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        searchQuery: searchQuery.trim() || undefined,
        filter,
        lowWalletThreshold: 100,
      });
      setTotal(total);
      const mapped: CustomerRow[] = data.map(r => ({
        id: r.id,
        name: r.name || '—',
        phone: r.phone || '—',
        wallet: r.wallet || 0,
        subscriptions: r.subscriptions || 0,
        status: r.subscriptions > 0 ? 'active' : 'inactive',
        area: r.area || '—',
      }));
      const filtered = mapped.filter(c => {
        switch (filter) {
          case 'low': return c.wallet < 100;
          case 'active': return c.status === 'active';
          case 'inactive': return c.status !== 'active';
          default: return true;
        }
      });
      setRows(prev => append ? [...prev, ...filtered] : filtered);
    } catch (e: any) {
      console.error('Customers fetch failed', e);
      setError(e.message || 'Failed to load customers. Please try again.');
      toast.show('Customers load failed', { type: 'error' });
      if (!append) setRows([]);
    } finally {
      setLoading(false); setLoadingMore(false);
    }
  }, [page, searchQuery, filter, toast]);

  useEffect(() => {
    const h = setTimeout(() => {
      setPage(0);
      fetchPage(false);
    }, 300);
    return () => clearTimeout(h);
  }, [searchQuery, filter, fetchPage]);

  const loadMore = () => {
    if (loadingMore) return;
    if (total !== null && rows.length >= total) return;
    setPage(p => p + 1);
    setTimeout(() => fetchPage(true), 0);
  };

  const renderItem = ({ item }: { item: CustomerRow }) => (
    <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('CustomerDetail', { customerId: item.id })}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{item.name.charAt(0)}</Text></View>
        <View style={styles.info}>
          <Text style={styles.title}>{item.name}</Text>
          <Text style={styles.subtitle}>{item.phone} • {item.area}</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </View>
      <View style={styles.footer}>
        <View style={styles.badge}><Text style={styles.badgeText}>💰 {formatCurrency(item.wallet)}</Text></View>
        <View style={styles.badge}><Text style={styles.badgeText}>📋 {item.subscriptions} subs</Text></View>
        <View style={[styles.badge, item.wallet < 100 && styles.badgeWarn]}>
          <Text style={[styles.badgeText, item.wallet < 100 && styles.badgeTextWarn]}>{item.status === 'active' ? '✅ Active' : '⏸️ Inactive'}</Text>
        </View>
        <TouchableOpacity
          style={styles.topupBtn}
          onPress={async () => {
            try {
              await CustomerAdminService.adjustWallet(item.id, 100, 'Admin quick top-up');
              fetchPage(false);
              toast.show('Wallet +100', { type: 'success' });
            } catch (e: any) {
              toast.show(e.message || 'Top-up failed', { type: 'error' });
            }
          }}
        >
          <Text style={styles.topupBtnText}>+ ₹100</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search customers..."
            placeholderTextColor={theme.colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {!!searchQuery && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn} activeOpacity={0.7}>
              <Text style={styles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.filterRow}>
          {(['all','low','active','inactive'] as const).map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, filter !== f && styles.filterChipInactive]}
              onPress={() => setFilter(f)}
              activeOpacity={0.7}
            >
              <Text style={filter === f ? styles.filterChipText : styles.filterChipTextInactive}>
                {f === 'all' && `All (${total ?? '…'})`}
                {f === 'low' && `Low (${rows.filter(c => c.wallet < 100).length})`}
                {f === 'active' && `Active (${rows.filter(c => c.status === 'active').length})`}
                {f === 'inactive' && `Inactive (${rows.filter(c => c.status !== 'active').length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      
      {error && <ErrorBanner message={error} onRetry={() => fetchPage(false)} />}
      
      {loading && page === 0 ? (
        <FlatList
          data={[1,2,3,4,5,6]}
          keyExtractor={(i) => String(i)}
          renderItem={() => (
            <View style={styles.skeletonCard}>
              <View style={styles.skeletonHeader}>
                <View style={styles.skeletonAvatar} />
                <View style={{ flex: 1 }}>
                  <View style={styles.skeletonLineWide} />
                  <View style={styles.skeletonLine} />
                </View>
              </View>
              <View style={styles.skeletonBadges}>
                <View style={styles.skeletonBadge} />
                <View style={styles.skeletonBadge} />
                <View style={styles.skeletonBadge} />
              </View>
            </View>
          )}
          contentContainerStyle={{ padding: 16, paddingBottom: 64 }}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="👥"
          title="No Customers Found"
          description="Try adjusting your search or filters to find customers."
          actionLabel="Clear Filters"
          onAction={() => {
            setSearchQuery('');
            setFilter('all');
          }}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 64 }}
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          getItemLayout={(data, index) => ({
            length: 120,
            offset: 120 * index,
            index,
          })}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          ItemSeparatorComponent={() => <View style={{ height: 0 }} />}
          ListFooterComponent={() => (
            total !== null && rows.length < total ? (
              loadingMore ? (
                <View style={{ paddingHorizontal: 16 }}>
                  <View style={styles.skeletonCard}>
                    <View style={styles.skeletonHeader}>
                      <View style={styles.skeletonAvatar} />
                      <View style={{ flex: 1 }}>
                        <View style={styles.skeletonLineWide} />
                        <View style={styles.skeletonLine} />
                      </View>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                  <Text style={styles.loadMoreHint}>Scroll for more…</Text>
                </View>
              )
            ) : null
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F8FAFC',
  },
  searchSection: { 
    padding: 20, 
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  searchBar: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#F8FAFC', 
    borderRadius: 16, 
    paddingHorizontal: 16, 
    height: 52, 
    borderWidth: 1, 
    borderColor: '#E2E8F0',
  },
  searchIcon: { 
    fontSize: 18,
    marginRight: 8,
  },
  searchInput: { 
    flex: 1, 
    color: '#1E293B', 
    fontSize: 15,
    paddingHorizontal: 8,
  },
  clearBtn: { 
    padding: 8, 
    borderRadius: 10, 
    backgroundColor: '#E2E8F0',
  },
  clearBtnText: { 
    fontSize: 14, 
    color: '#64748B',
  },
  filterRow: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    marginTop: 16, 
    marginBottom: 8,
    gap: 10,
  },
  filterChip: { 
    paddingVertical: 10, 
    paddingHorizontal: 16, 
    backgroundColor: '#7C3AED', 
    borderRadius: 20,
  },
  filterChipInactive: { 
    backgroundColor: '#F1F5F9',
  },
  filterChipText: { 
    color: '#FFFFFF', 
    fontSize: 13, 
    fontWeight: '600',
  },
  filterChipTextInactive: { 
    color: '#64748B', 
    fontSize: 13, 
    fontWeight: '600',
  },
  card: { 
    backgroundColor: '#FFFFFF', 
    borderRadius: 20, 
    padding: 18, 
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 0,
  },
  cardHeader: { 
    flexDirection: 'row', 
    alignItems: 'center',
    marginBottom: 4,
  },
  avatar: { 
    width: 50, 
    height: 50, 
    borderRadius: 16, 
    backgroundColor: '#7C3AED', 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginRight: 14,
  },
  avatarText: { 
    fontSize: 20, 
    fontWeight: '700', 
    color: '#FFFFFF',
  },
  info: { 
    flex: 1,
  },
  title: { 
    fontSize: 17, 
    fontWeight: '700', 
    color: '#1E293B',
  },
  subtitle: { 
    fontSize: 14, 
    color: '#64748B', 
    marginTop: 4,
  },
  arrow: { 
    fontSize: 24, 
    color: '#94A3B8', 
    marginLeft: 4,
  },
  footer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    flexWrap: 'wrap', 
    marginTop: 14, 
    gap: 10,
  },
  badge: { 
    backgroundColor: '#F1F5F9', 
    paddingHorizontal: 14, 
    paddingVertical: 8, 
    borderRadius: 12,
  },
  badgeText: { 
    fontSize: 13, 
    fontWeight: '600',
    color: '#1E293B',
  },
  badgeWarn: { 
    backgroundColor: '#FEF3C7',
  },
  badgeTextWarn: { 
    color: '#D97706',
  },
  topupBtn: { 
    paddingHorizontal: 14, 
    paddingVertical: 8, 
    backgroundColor: '#10B981', 
    borderRadius: 12,
  },
  topupBtnText: { 
    fontSize: 13, 
    color: '#FFFFFF', 
    fontWeight: '700',
  },
  loadMoreHint: { 
    fontSize: 14, 
    color: '#64748B',
    fontWeight: '500',
  },
  // Skeleton styles
  skeletonCard: { 
    backgroundColor: '#FFFFFF', 
    borderRadius: 20, 
    padding: 18, 
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  skeletonHeader: { 
    flexDirection: 'row', 
    alignItems: 'center',
  },
  skeletonAvatar: { 
    width: 50, 
    height: 50, 
    borderRadius: 16, 
    backgroundColor: '#E2E8F0', 
    marginRight: 14,
  },
  skeletonLineWide: { 
    height: 16, 
    borderRadius: 8, 
    backgroundColor: '#E2E8F0', 
    marginBottom: 10, 
    width: '60%',
  },
  skeletonLine: { 
    height: 14, 
    borderRadius: 7, 
    backgroundColor: '#E2E8F0', 
    width: '40%',
  },
  skeletonBadges: { 
    flexDirection: 'row', 
    gap: 10, 
    marginTop: 14,
  },
  skeletonBadge: { 
    height: 28, 
    width: 90, 
    borderRadius: 12, 
    backgroundColor: '#E2E8F0',
  },
});

export default CustomerListScreen;
