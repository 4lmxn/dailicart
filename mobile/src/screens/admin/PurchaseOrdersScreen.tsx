import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SupplierService } from '../../services/api/suppliers';
import { ErrorBanner } from '../../components/ErrorBanner';
import { EmptyState } from '../../components/EmptyState';
import { useTheme } from '../../theme';

export const PurchaseOrdersScreen: React.FC = () => {
  const theme = useTheme();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const data = await SupplierService.getPurchaseOrders();
      setOrders(data);
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
      <Text style={{ fontSize: 22, fontWeight: '600', color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>Purchase Orders</Text>

      {loading && <ActivityIndicator color={theme.colors.primary} />}
      {error && <ErrorBanner message={error} onRetry={load} />}
      {!loading && !error && orders.length === 0 && (
        <EmptyState title="No purchase orders" description="Create a PO to record incoming stock." />
      )}

      {!loading && !error && orders.map((po) => (
        <View key={po.id} style={{
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
          marginBottom: theme.spacing.sm,
        }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.textPrimary }}>{po.suppliers?.name || 'Supplier'}</Text>
          <Text style={{ color: theme.colors.textSecondary }}>Order Date: {po.order_date}</Text>
          <Text style={{ color: theme.colors.textSecondary }}>Status: {po.status}</Text>
          <View style={{ marginTop: theme.spacing.sm }}>
            <Text style={{ fontWeight: '600', color: theme.colors.textPrimary }}>Items</Text>
            {(po.purchase_order_items || []).map((it: any) => (
              <Text key={it.id} style={{ color: theme.colors.textSecondary }}>
                - {it.products?.name} × {it.quantity} @ {it.unit_cost}
              </Text>
            ))}
          </View>
          <View style={{ flexDirection: 'row', marginTop: theme.spacing.sm }}>
            {po.status === 'pending' && (
              <TouchableOpacity style={{
                backgroundColor: theme.colors.primary,
                paddingVertical: theme.spacing.xs,
                paddingHorizontal: theme.spacing.sm,
                borderRadius: theme.radius.sm,
                marginRight: theme.spacing.sm,
              }}>
                <Text style={{ color: theme.colors.onPrimary }}>Receive Goods</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={{
              backgroundColor: theme.colors.secondary,
              paddingVertical: theme.spacing.xs,
              paddingHorizontal: theme.spacing.sm,
              borderRadius: theme.radius.sm,
            }}>
              <Text style={{ color: theme.colors.onSecondary }}>View Details</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      <TouchableOpacity style={{
        backgroundColor: theme.colors.primary,
        padding: theme.spacing.md,
        borderRadius: theme.radius.md,
        marginTop: theme.spacing.lg,
      }}>
        <Text style={{ color: theme.colors.onPrimary, textAlign: 'center', fontWeight: '600' }}>Create Purchase Order</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};
