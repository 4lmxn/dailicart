import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { theme } from '../../theme';

interface RoleSelectorScreenProps {
  onSelect: (role: 'customer' | 'admin' | 'distributor' | 'onboarding' | 'auth' | 'impersonate') => void;
  onBack?: () => void;
}

export const RoleSelectorScreen: React.FC<RoleSelectorScreenProps> = ({ onSelect, onBack }) => {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Development Mode</Text>
      <Text style={styles.subtitle}>Quickly navigate to any screen for testing</Text>
      
      <Text style={styles.sectionTitle}>🎭 Roles</Text>
      <View style={styles.grid}>
        <TouchableOpacity style={styles.card} onPress={() => onSelect('customer')}>
          <Text style={styles.cardIcon}>🛍️</Text>
          <Text style={styles.cardTitle}>Customer</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.card} onPress={() => onSelect('admin')}>
          <Text style={styles.cardIcon}>🛠️</Text>
          <Text style={styles.cardTitle}>Admin</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.card} onPress={() => onSelect('distributor')}>
          <Text style={styles.cardIcon}>🚚</Text>
          <Text style={styles.cardTitle}>Distributor</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>📱 Screens</Text>
      <View style={styles.grid}>
        <TouchableOpacity style={styles.card} onPress={() => onSelect('onboarding')}>
          <Text style={styles.cardIcon}>👋</Text>
          <Text style={styles.cardTitle}>Onboarding</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.card} onPress={() => onSelect('auth')}>
          <Text style={styles.cardIcon}>🔐</Text>
          <Text style={styles.cardTitle}>Login/Auth</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>🧪 Testing</Text>
      <View style={styles.grid}>
        <TouchableOpacity style={[styles.card, styles.wideCard]} onPress={() => onSelect('impersonate')}>
          <Text style={styles.cardIcon}>🎭</Text>
          <Text style={styles.cardTitle}>Impersonate Real User</Text>
          <Text style={styles.cardSubtitle}>Test as actual DB user</Text>
        </TouchableOpacity>
      </View>

      {onBack && (
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  contentContainer: { padding: theme.spacing.xl },
  title: { ...theme.typography.h2, color: theme.colors.text },
  subtitle: { ...theme.typography.body, color: theme.colors.textSecondary, marginTop: theme.spacing.xs, marginBottom: theme.spacing.xl },
  sectionTitle: { ...theme.typography.h3, fontSize: 18, color: theme.colors.text, marginTop: theme.spacing.lg, marginBottom: theme.spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
  card: { width: '47%', backgroundColor: theme.colors.card, borderRadius: theme.borderRadius.lg, padding: theme.spacing.lg, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border },
  wideCard: { width: '100%' },
  cardIcon: { fontSize: 32, marginBottom: theme.spacing.sm },
  cardTitle: { ...theme.typography.h3, fontSize: 16, textTransform: 'capitalize', textAlign: 'center' },
  cardSubtitle: { ...theme.typography.caption, fontSize: 12, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 4 },
  backBtn: { marginTop: theme.spacing.xl, alignSelf: 'flex-start', backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.md, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
  backText: { color: theme.colors.textLight, fontWeight: '600' },
});

export default RoleSelectorScreen;
