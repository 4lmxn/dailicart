import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { theme } from '../../theme';
import { AuthService } from '../../services/auth/authService';

interface SignupScreenProps {
  onSuccess: () => void;
  onBackToLogin: () => void;
}

type UserRole = 'customer' | 'distributor';

export const SignupScreen: React.FC<SignupScreenProps> = ({
  onSuccess,
  onBackToLogin,
}) => {
  const [role, setRole] = useState<UserRole>('customer');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);

  // Customer specific
  const [address, setAddress] = useState('');
  const [area, setArea] = useState('');
  const [city, setCity] = useState('Bangalore');
  const [pincode, setPincode] = useState('');

  // Distributor specific
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [zone, setZone] = useState('');

  const handleSignup = async () => {
    // Validation
    if (!email || !phone || !password || !fullName) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    if (phone.length !== 10) {
      Alert.alert('Error', 'Please enter a valid 10-digit phone number');
      return;
    }

    if (role === 'customer' && (!address || !area || !pincode)) {
      Alert.alert('Error', 'Please provide complete delivery address');
      return;
    }

    if (role === 'distributor' && (!vehicleNumber || !zone)) {
      Alert.alert('Error', 'Please provide vehicle details');
      return;
    }

    setLoading(true);

    try {
      // Create auth user
      const { data: authData, error: authError } = await AuthService.signUp(
        email,
        password,
        fullName,
        `+91${phone}`,
        role
      );

      if (authError) throw authError;

      // Wait for user to be available in Supabase Auth
      let userId = authData?.user?.id;
      let retries = 0;
      while (!userId && retries < 5) {
        await new Promise(res => setTimeout(res, 400));
        const session = await AuthService.getSession?.();
        userId = session?.user?.id || userId;
        retries++;
      }

      if (!userId) throw new Error('Failed to get user ID after signup. Please try again.');

      // Create profile based on role
      if (role === 'customer') {
        const { error: profileError } = await AuthService.createCustomerProfile(
          userId,
          address,
          city,
          area,
          pincode
        );
        if (profileError) throw profileError;
      } else {
        const { error: profileError } = await AuthService.createDistributorProfile(
          userId,
          zone,
          vehicleNumber
        );
        if (profileError) throw profileError;
      }

      Alert.alert(
        'Success! 🎉',
        'Your account has been created. Please check your email to verify your account.',
        [{ text: 'OK', onPress: onSuccess }]
      );
    } catch (error: any) {
      console.error('Signup error:', error);
      Alert.alert('Signup Failed', error.message || 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onBackToLogin} style={styles.backButton}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <View style={styles.logoContainer}>
            <Text style={styles.logoEmoji}>🥛</Text>
          </View>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join iDaily for fresh deliveries</Text>
        </View>

        {/* Role Selection */}
        <View style={styles.roleContainer}>
          <TouchableOpacity
            style={[styles.roleButton, role === 'customer' && styles.roleButtonActive]}
            onPress={() => setRole('customer')}
          >
            <Text style={[styles.roleEmoji, role === 'customer' && styles.roleEmojiActive]}>
              👤
            </Text>
            <Text style={[styles.roleText, role === 'customer' && styles.roleTextActive]}>
              Customer
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.roleButton, role === 'distributor' && styles.roleButtonActive]}
            onPress={() => setRole('distributor')}
          >
            <Text style={[styles.roleEmoji, role === 'distributor' && styles.roleEmojiActive]}>
              🚚
            </Text>
            <Text style={[styles.roleText, role === 'distributor' && styles.roleTextActive]}>
              Distributor
            </Text>
          </TouchableOpacity>
        </View>

        {/* Common Fields */}
        <View style={styles.form}>
          <Text style={styles.label}>Full Name *</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Enter your full name"
            placeholderTextColor="#94A3B8"
            autoCapitalize="words"
          />

          <Text style={styles.label}>Email *</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your email"
            placeholderTextColor="#94A3B8"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Phone Number *</Text>
          <View style={styles.phoneContainer}>
            <Text style={styles.phonePrefix}>+91</Text>
            <TextInput
              style={[styles.input, styles.phoneInput]}
              value={phone}
              onChangeText={setPhone}
              placeholder="10-digit mobile number"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              maxLength={10}
            />
          </View>

          <Text style={styles.label}>Password *</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Minimum 6 characters"
            placeholderTextColor="#94A3B8"
            secureTextEntry
          />

          <Text style={styles.label}>Confirm Password *</Text>
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Re-enter your password"
            placeholderTextColor="#94A3B8"
            secureTextEntry
          />

          {/* Customer Specific Fields */}
          {role === 'customer' && (
            <>
              <Text style={styles.sectionTitle}>Delivery Address</Text>

              <Text style={styles.label}>Address *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={address}
                onChangeText={setAddress}
                placeholder="Flat/House No, Building, Street"
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={2}
              />

              <Text style={styles.label}>Area *</Text>
              <TextInput
                style={styles.input}
                value={area}
                onChangeText={setArea}
                placeholder="e.g., Whitefield, Koramangala"
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.label}>Pincode *</Text>
              <TextInput
                style={styles.input}
                value={pincode}
                onChangeText={setPincode}
                placeholder="6-digit pincode"
                placeholderTextColor="#94A3B8"
                keyboardType="number-pad"
                maxLength={6}
              />
            </>
          )}

          {/* Distributor Specific Fields */}
          {role === 'distributor' && (
            <>
              <Text style={styles.sectionTitle}>Delivery Details</Text>

              <Text style={styles.label}>Vehicle Number *</Text>
              <TextInput
                style={styles.input}
                value={vehicleNumber}
                onChangeText={setVehicleNumber}
                placeholder="e.g., KA01AB1234"
                placeholderTextColor="#94A3B8"
                autoCapitalize="characters"
              />

              <Text style={styles.label}>Delivery Zone *</Text>
              <TextInput
                style={styles.input}
                value={zone}
                onChangeText={setZone}
                placeholder="e.g., Whitefield, BTM Layout"
                placeholderTextColor="#94A3B8"
              />
            </>
          )}
        </View>

        {/* Signup Button */}
        <TouchableOpacity
          style={[styles.signupButton, loading && styles.signupButtonDisabled]}
          onPress={handleSignup}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.signupButtonText}>Create Account</Text>
          )}
        </TouchableOpacity>

        {/* Terms */}
        <Text style={styles.terms}>
          By signing up, you agree to our{' '}
          <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
          <Text style={styles.termsLink}>Privacy Policy</Text>
        </Text>

        {/* Back to Login */}
        <TouchableOpacity onPress={onBackToLogin} style={styles.loginLink}>
          <Text style={styles.loginLinkText}>
            Already have an account? <Text style={styles.loginLinkBold}>Sign In</Text>
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  backButton: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    fontSize: 24,
    color: '#0F172A',
  },
  logoContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  logoEmoji: {
    fontSize: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: '500',
  },
  roleContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  roleButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  roleButtonActive: {
    borderColor: theme.colors.primary,
    backgroundColor: '#EFF6FF',
  },
  roleEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  roleEmojiActive: {
    transform: [{ scale: 1.1 }],
  },
  roleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  roleTextActive: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  form: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 16,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#0F172A',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  phoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  phonePrefix: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  phoneInput: {
    flex: 1,
  },
  signupButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  signupButtonDisabled: {
    opacity: 0.6,
  },
  signupButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  terms: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
  termsLink: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  loginLink: {
    marginTop: 24,
    alignItems: 'center',
  },
  loginLinkText: {
    fontSize: 14,
    color: '#64748B',
  },
  loginLinkBold: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
});
