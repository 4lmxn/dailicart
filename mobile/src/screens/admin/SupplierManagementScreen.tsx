import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SupplierService } from '../../services/api/suppliers';
import { ErrorBanner } from '../../components/ErrorBanner';
import { EmptyState } from '../../components/EmptyState';
import { useTheme } from '../../theme';

export const SupplierManagementScreen: React.FC = () => {
  const theme = useTheme();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const data = await SupplierService.getSuppliers();
      setSuppliers(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = suppliers.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: theme.spacing.md }}>
      <Text style={{ fontSize: 22, fontWeight: '600', color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>Suppliers</Text>
      <TextInput
        placeholder="Search suppliers"
        value={query}
        onChangeText={setQuery}
        style={{
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: theme.radius.md,
          padding: theme.spacing.sm,
          marginBottom: theme.spacing.md,
          color: theme.colors.textPrimary,
        }}
      />

      {loading && <ActivityIndicator color={theme.colors.primary} />}
      {error && <ErrorBanner message={error} onRetry={load} />}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState title="No suppliers" description="Add suppliers to track purchases and payments." />
      )}

      {!loading && !error && filtered.map((s) => (
        <View key={s.id} style={{
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
          marginBottom: theme.spacing.sm,
        }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.textPrimary }}>{s.name}</Text>
          {s.contact_name && <Text style={{ color: theme.colors.textSecondary }}>Contact: {s.contact_name}</Text>}
          {s.phone && <Text style={{ color: theme.colors.textSecondary }}>Phone: {s.phone}</Text>}
          {s.email && <Text style={{ color: theme.colors.textSecondary }}>Email: {s.email}</Text>}
          <View style={{ flexDirection: 'row', marginTop: theme.spacing.sm }}>
            <TouchableOpacity style={{
              backgroundColor: theme.colors.primary,
              paddingVertical: theme.spacing.xs,
              paddingHorizontal: theme.spacing.sm,
              borderRadius: theme.radius.sm,
              marginRight: theme.spacing.sm,
            }}>
              <Text style={{ color: theme.colors.onPrimary }}>View Purchases</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{
              backgroundColor: theme.colors.secondary,
              paddingVertical: theme.spacing.xs,
              paddingHorizontal: theme.spacing.sm,
              borderRadius: theme.radius.sm,
            }}>
              <Text style={{ color: theme.colors.onSecondary }}>Record Payment</Text>
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
        <Text style={{ color: theme.colors.onPrimary, textAlign: 'center', fontWeight: '600' }}>Add Supplier</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};
