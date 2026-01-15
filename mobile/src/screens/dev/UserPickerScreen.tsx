import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme } from '../../theme';
import { supabase } from '../../services/supabase';
import { useAuthStore } from '../../store/authStore';
import { AppBar } from '../../components/AppBar';

type RoleFilter = 'customer' | 'distributor' | 'admin' | 'all';

interface User {
  id: string;
  phone: string;
  role: 'customer' | 'distributor' | 'admin';
  name?: string;
  email?: string;
}

interface UserPickerScreenProps {
  onSelect: (role: string) => void;
}

export const UserPickerScreen: React.FC<UserPickerScreenProps> = ({ onSelect }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { setUser } = useAuthStore();

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [users, roleFilter, searchQuery]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      
      // Fetch users with their profiles
      const { data: usersData, error } = await supabase
        .from('users')
        .select(`
          id,
          phone,
          role,
          name,
          email,
          customers (wallet_balance),
          distributors (vehicle_number)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const formattedUsers: User[] = usersData.map((u: any) => ({
        id: u.id,
        phone: u.phone,
        role: u.role,
        name: u.name || 'Unknown',
        email: u.email || undefined,
      }));

      setUsers(formattedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterUsers = () => {
    let filtered = users;

    // Filter by role
    if (roleFilter !== 'all') {
      filtered = filtered.filter(u => u.role === roleFilter);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(u =>
        u.name?.toLowerCase().includes(query) ||
        u.phone.includes(query) ||
        u.email?.toLowerCase().includes(query)
      );
    }

    setFilteredUsers(filtered);
  };

  const handleUserSelect = async (user: User) => {
    try {
      // For dev mode impersonation, we need to:
      // 1. Store the impersonated user in AsyncStorage
      // 2. Set it in auth store
      // 3. Store it in a dev mode flag
      
      const mockUser: any = {
        id: user.id,
        name: user.name || 'Unknown',
        email: user.email || undefined,
        phone: user.phone,
        role: user.role,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Store dev mode impersonation info
      await AsyncStorage.setItem('DEV_IMPERSONATE_USER_ID', user.id);
      await AsyncStorage.setItem('DEV_IMPERSONATE_USER', JSON.stringify(mockUser));
      
      // Update auth store
      setUser(mockUser);

      // Navigate to appropriate screen based on role
      onSelect(user.role);
    } catch (error) {
      console.error('Error impersonating user:', error);
    }
  };

  const renderRoleChip = (role: RoleFilter) => (
    <TouchableOpacity
      key={role}
      style={[
        styles.roleChip,
        roleFilter === role && styles.roleChipActive,
      ]}
      onPress={() => setRoleFilter(role)}
    >
      <Text style={[
        styles.roleChipText,
        roleFilter === role && styles.roleChipTextActive,
      ]}>
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </Text>
    </TouchableOpacity>
  );

  const renderUser = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={styles.userCard}
      onPress={() => handleUserSelect(item)}
    >
      <View style={styles.userAvatar}>
        <Text style={styles.userAvatarText}>
          {item.name ? item.name.charAt(0).toUpperCase() : '?'}
        </Text>
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.name || 'Unknown User'}</Text>
        <Text style={styles.userPhone}>{item.phone}</Text>
        {item.email && <Text style={styles.userEmail}>{item.email}</Text>}
      </View>
      <View style={[
        styles.roleBadge,
        item.role === 'customer' && styles.roleCustomer,
        item.role === 'distributor' && styles.roleDistributor,
        item.role === 'admin' && styles.roleAdmin,
      ]}>
        <Text style={styles.roleBadgeText}>{item.role}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <AppBar
        title="Impersonate User"
        subtitle="Select a user to test as"
        variant="surface"
        onBack={() => onSelect('selector')}
      />

      <View style={styles.content}>
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, phone, or email"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#999"
          />
        </View>

        {/* Role Filters */}
        <View style={styles.roleChipsContainer}>
          {renderRoleChip('all')}
          {renderRoleChip('customer')}
          {renderRoleChip('distributor')}
          {renderRoleChip('admin')}
        </View>

        {/* Users List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Loading users...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredUsers}
            renderItem={renderUser}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No users found</Text>
                <Text style={styles.emptySubtext}>
                  {searchQuery ? 'Try a different search' : 'No users in database'}
                </Text>
              </View>
            }
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  searchIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: '#000',
  },
  roleChipsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  roleChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  roleChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  roleChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  roleChipTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    gap: 12,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  userAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  userAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  userPhone: {
    fontSize: 14,
    color: '#666',
  },
  userEmail: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  roleCustomer: {
    backgroundColor: '#E3F2FD',
  },
  roleDistributor: {
    backgroundColor: '#FFF3E0',
  },
  roleAdmin: {
    backgroundColor: '#F3E5F5',
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
  },
});

export default UserPickerScreen;
