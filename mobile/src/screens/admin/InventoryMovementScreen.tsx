import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { supabase } from '../../services/supabase';
import { SupplierService } from '../../services/api/suppliers';
import { ErrorBanner } from '../../components/ErrorBanner';
import { EmptyState } from '../../components/EmptyState';
import { useTheme } from '../../theme';
import { formatQuantity } from '../../utils/helpers';

export const InventoryMovementScreen: React.FC = () => {
  const theme = useTheme();
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('stock_movements')
        .select('id, created_at, movement_type, quantity, reference_type, notes, products:product_id(name, unit), created_by_user:created_by(name)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setMovements(data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: theme.spacing.md }}>
      <Text style={{ fontSize: 22, fontWeight: '600', color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>Inventory Movements</Text>

      {loading && <ActivityIndicator color={theme.colors.primary} />}
      {error && <ErrorBanner message={error} onRetry={load} />}
      {!loading && !error && movements.length === 0 && (
        <EmptyState title="No movements" description="Receipts, issues, and returns will show here." />
      )}

      {!loading && !error && movements.map((m) => (
        <View key={m.id} style={{
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
          marginBottom: theme.spacing.sm,
        }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.textPrimary }}>{m.products?.name} ({m.type})</Text>
          <Text style={{ color: theme.colors.textSecondary }}>{formatQuantity(m.quantity, m.products?.unit)}</Text>
          {m.product_batches?.batch_code && <Text style={{ color: theme.colors.textSecondary }}>Batch: {m.product_batches.batch_code}</Text>}
          {m.profiles?.full_name && <Text style={{ color: theme.colors.textSecondary }}>Distributor: {m.profiles.full_name}</Text>}
          <Text style={{ color: theme.colors.textSecondary }}>Date: {new Date(m.movement_date).toLocaleString()}</Text>
          {m.reference_type && <Text style={{ color: theme.colors.textSecondary }}>Ref: {m.reference_type}</Text>}
        </View>
      ))}

      <TouchableOpacity style={{
        backgroundColor: theme.colors.primary,
        padding: theme.spacing.md,
        borderRadius: theme.radius.md,
        marginTop: theme.spacing.lg,
      }} onPress={async () => {
        // Example manual issue (placeholder): issue 1 unit of first product to a distributor
        try {
          const { data } = await supabase.from('products').select('id, stock_quantity').gt('stock_quantity', 0).limit(1).single();
          if (!data) return;
          await SupplierService.moveStockToDistributor({ product_id: data.id, batch_id: null, quantity: 1, distributor_id: '00000000-0000-0000-0000-000000000000' });
          load();
        } catch (e) {}
      }}>
        <Text style={{ color: theme.colors.onPrimary, textAlign: 'center', fontWeight: '600' }}>Issue Stock (Demo)</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};
