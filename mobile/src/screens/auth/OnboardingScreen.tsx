import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../services/supabase';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { ErrorBanner } from '../../components/ErrorBanner';
import { useToast } from '../../components/Toast';
import { listSocieties, listTowers, listUnits } from '../../services/address';

const { width } = Dimensions.get('window');

type RoleOption = 'customer' | 'distributor';
type OnboardingStep = 'role' | 'personal' | 'address' | 'verify';

interface Props {
  onComplete?: () => void;
}

export const OnboardingScreen: React.FC<Props> = ({ onComplete }) => {
  const { user, setUser } = useAuthStore();
  const { show: showToast } = useToast();
  
  // Step management
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('role');
  const [slideAnim] = useState(new Animated.Value(0));
  
  // Basic info
  const [role, setRole] = useState<RoleOption | null>(
    user?.role && (user.role === 'customer' || user.role === 'distributor') ? user.role : null
  );
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [loading, setLoading] = useState(false);

  // Address state
  const [societies, setSocieties] = useState<any[]>([]);
  const [towers, setTowers] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  
  const [selectedSociety, setSelectedSociety] = useState<string | null>(null);
  const [selectedTower, setSelectedTower] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingStep, setLoadingStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Distributor fields
  const [idProofType, setIdProofType] = useState<'aadhar' | 'pan' | 'driving_license' | ''>('');
  const [idProofNumber, setIdProofNumber] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  
  // Distributor activation code
  const [activationCode, setActivationCode] = useState('');
  const [activationVerified, setActivationVerified] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);

  // Load societies
  useEffect(() => {
    if (role === 'customer' && currentStep === 'address') {
      loadSocieties();
    }
  }, [role, currentStep]);

  // Animation
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 50,
      friction: 7,
    }).start();
  }, [currentStep]);

  const loadSocieties = async () => {
    setLoadingStep('societies');
    setError(null);
    try {
      const data = await listSocieties(searchQuery);
      setSocieties(data || []);
    } catch (e: any) {
      setError('Failed to load societies');
    } finally {
      setLoadingStep(null);
    }
  };

  const loadTowers = async (societyId: string) => {
    setLoadingStep('towers');
    setError(null);
    setTowers([]);
    setUnits([]);
    setSelectedTower(null);
    setSelectedUnit(null);
    try {
      const data = await listTowers(societyId);
      setTowers(data || []);
    } catch (e: any) {
      setError('Failed to load towers');
    } finally {
      setLoadingStep(null);
    }
  };

  const loadUnits = async (towerId: string) => {
    setLoadingStep('units');
    setError(null);
    setUnits([]);
    setSelectedUnit(null);
    try {
      const data = await listUnits(towerId);
      setUnits(data || []);
    } catch (e: any) {
      setError('Failed to load units');
    } finally {
      setLoadingStep(null);
    }
  };

  const verifyActivationCode = async () => {
    if (!activationCode.trim()) {
      setActivationError('Please enter an activation code');
      return;
    }
    
    setVerifyingCode(true);
    setActivationError(null);
    
    try {
      const { data, error } = await supabase
        .from('distributor_activation_codes')
        .select('id, code, used, expires_at')
        .eq('code', activationCode.trim().toUpperCase())
        .maybeSingle();
      
      if (error) {
        setActivationError('Error verifying code');
        setActivationVerified(false);
        return;
      }
      
      if (!data) {
        setActivationError('Invalid activation code');
        setActivationVerified(false);
        return;
      }
      
      if (data.used) {
        setActivationError('This activation code has already been used');
        setActivationVerified(false);
        return;
      }
      
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setActivationError('This activation code has expired');
        setActivationVerified(false);
        return;
      }
      
      setActivationVerified(true);
      setActivationError(null);
      showToast('✅ Activation code verified!', { type: 'success' });
    } catch (e) {
      setActivationError('Failed to verify code. Please try again.');
      setActivationVerified(false);
    } finally {
      setVerifyingCode(false);
    }
  };

  const canProceedToNextStep = () => {
    switch (currentStep) {
      case 'role':
        if (role === 'distributor') {
          return activationVerified;
        }
        return role !== null;
      case 'personal':
        return name.trim() && phone.trim();
      case 'address':
        if (role === 'customer') {
          return selectedSociety && selectedTower && selectedUnit;
        }
        if (role === 'distributor') {
          return idProofType && idProofNumber.trim() && vehicleNumber.trim();
        }
        return false;
      case 'verify':
        return true;
      default:
        return false;
    }
  };

  const handleNextStep = () => {
    slideAnim.setValue(width);
    const steps: OnboardingStep[] = ['role', 'personal', 'address', 'verify'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  };

  const handlePrevStep = () => {
    slideAnim.setValue(-width);
    const steps: OnboardingStep[] = ['role', 'personal', 'address', 'verify'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const normalizedPhone = phone.startsWith('+') ? phone : `+91${phone}`;
      
      if (role === 'customer') {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .upsert({ id: user?.id, name, phone: normalizedPhone, email: user?.email, role: 'customer' }, { onConflict: 'id' })
          .select('id')
          .single();
        if (userError) throw userError;

        const { data: customerData, error: customerError} = await supabase
          .from('customers')
          .upsert({ user_id: userData.id }, { onConflict: 'user_id' })
          .select('id')
          .single();
        if (customerError) throw customerError;

        // Insert address with user_id
        const { error: addressError } = await supabase
          .from('addresses')
          .insert({
            user_id: userData.id,
            society_id: selectedSociety,
            tower_id: selectedTower,
            unit_id: selectedUnit,
            is_default: true,
          });
        if (addressError) throw addressError;

        setUser({
          id: userData.id,
          name,
          email: user?.email || '',
          phone: normalizedPhone,
          role: 'customer',
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        showToast('🎉 Welcome to iDaily!', { type: 'success' });
        onComplete?.();
      } else if (role === 'distributor') {
        // Create user and distributor with ID proof
        const { data: userData, error: userError } = await supabase
          .from('users')
          .upsert({ id: user?.id, name, phone: normalizedPhone, email: user?.email, role: 'distributor' }, { onConflict: 'id' })
          .select('id')
          .single();
        if (userError) throw userError;

        const { data: distributorData, error: distributorError } = await supabase
          .from('distributors')
          .insert({
            user_id: userData.id,
            vehicle_number: vehicleNumber,
            id_proof_type: idProofType,
            id_proof_number: idProofNumber,
          })
          .select('id')
          .single();
        if (distributorError) throw distributorError;

        // Mark activation code as used
        if (activationCode) {
          await supabase
            .from('distributor_activation_codes')
            .update({ 
              used: true, 
              used_by: userData.id,
              used_at: new Date().toISOString(),
            })
            .eq('code', activationCode.trim().toUpperCase());
        }

        setUser({
          id: userData.id,
          name,
          email: user?.email || '',
          phone: normalizedPhone,
          role: 'distributor',
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        showToast('🎉 Welcome to iDaily! Awaiting admin approval.', { type: 'success' });
        onComplete?.();
      }
    } catch (e: any) {
      showToast(e.message || 'Setup failed', { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const renderProgressBar = () => {
    const steps: OnboardingStep[] = ['role', 'personal', 'address', 'verify'];
    const currentIndex = steps.indexOf(currentStep);
    const progress = ((currentIndex + 1) / steps.length) * 100;
    const stepLabels = ['Role', 'Info', 'Details', 'Verify'];

    return (
      <LinearGradient
        colors={['#0D9488', '#0F766E']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>
              {currentStep === 'role' ? '👋' : currentStep === 'personal' ? '📝' : currentStep === 'address' ? (role === 'customer' ? '🏠' : '🚚') : '✅'}
            </Text>
          </View>
          <Text style={styles.headerTitle}>
            {currentStep === 'role' ? 'Welcome to iDaily!' : 
             currentStep === 'personal' ? 'Personal Info' :
             currentStep === 'address' ? (role === 'customer' ? 'Your Address' : 'Distributor Details') :
             'Almost Done!'}
          </Text>
          <Text style={styles.headerSubtitle}>Step {currentIndex + 1} of {steps.length}</Text>
        </View>

        {/* Progress Steps */}
        <View style={styles.stepsContainer}>
          {steps.map((step, index) => (
            <View key={step} style={styles.stepItem}>
              <View style={[
                styles.stepDot,
                index <= currentIndex && styles.stepDotActive,
                index < currentIndex && styles.stepDotCompleted,
              ]}>
                {index < currentIndex ? (
                  <Text style={styles.stepCheckmark}>✓</Text>
                ) : (
                  <Text style={[styles.stepNumber, index <= currentIndex && styles.stepNumberActive]}>
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text style={[styles.stepLabel, index <= currentIndex && styles.stepLabelActive]}>
                {stepLabels[index]}
              </Text>
            </View>
          ))}
          <View style={styles.stepsLine}>
            <View style={[styles.stepsLineFill, { width: `${(currentIndex / (steps.length - 1)) * 100}%` }]} />
          </View>
        </View>

        {/* Decorative circles */}
        <View style={styles.decorCircle1} />
        <View style={styles.decorCircle2} />
      </LinearGradient>
    );
  };

  const renderRoleStep = () => (
    <Animated.View style={[styles.stepContainer, { transform: [{ translateX: slideAnim }] }]}>
      <View style={styles.contentCard}>
        <Text style={styles.cardTitle}>Choose Your Role</Text>
        <Text style={styles.cardSubtitle}>Select how you'd like to use iDaily</Text>
        
        <View style={styles.roleCardsContainer}>
          <TouchableOpacity
            style={[styles.roleCard, role === 'customer' && styles.roleCardActive]}
            onPress={() => setRole('customer')}
            activeOpacity={0.7}
          >
            <View style={[styles.roleIconBadge, role === 'customer' && styles.roleIconBadgeActive]}>
              <Text style={styles.roleIcon}>🛍️</Text>
            </View>
            <Text style={[styles.roleTitle, role === 'customer' && styles.roleTextActive]}>Customer</Text>
            <Text style={styles.roleDescription}>Order fresh milk & daily essentials delivered to your door</Text>
            {role === 'customer' && (
              <View style={styles.roleCheckmark}>
                <Text style={styles.roleCheckmarkText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleCard, role === 'distributor' && styles.roleCardActive]}
            onPress={() => {
              setRole('distributor');
              setActivationVerified(false);
              setActivationCode('');
              setActivationError(null);
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.roleIconBadge, role === 'distributor' && styles.roleIconBadgeActive]}>
              <Text style={styles.roleIcon}>🚚</Text>
            </View>
            <Text style={[styles.roleTitle, role === 'distributor' && styles.roleTextActive]}>Distributor</Text>
            <Text style={styles.roleDescription}>Deliver orders in your area and earn daily income</Text>
            {role === 'distributor' && activationVerified && (
              <View style={styles.roleCheckmark}>
                <Text style={styles.roleCheckmarkText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Activation Code for Distributors */}
        {role === 'distributor' && (
          <View style={styles.activationCodeSection}>
            <View style={styles.activationCodeHeader}>
              <Text style={styles.activationCodeIcon}>🔐</Text>
              <Text style={styles.activationCodeTitle}>Admin Activation Required</Text>
            </View>
            <Text style={styles.activationCodeDescription}>
              To register as a distributor, you need an activation code from admin. Contact support if you don't have one.
            </Text>
            
            <View style={styles.activationCodeInputContainer}>
              <TextInput
                style={[
                  styles.activationCodeInput,
                  activationVerified && styles.activationCodeInputVerified,
                  activationError && styles.activationCodeInputError,
                ]}
                value={activationCode}
                onChangeText={(text) => {
                  setActivationCode(text.toUpperCase());
                  setActivationError(null);
                  setActivationVerified(false);
                }}
                placeholder="Enter activation code"
                placeholderTextColor="#94A3B8"
                autoCapitalize="characters"
                editable={!activationVerified}
              />
              
              {activationVerified ? (
                <View style={styles.activationVerifiedBadge}>
                  <Text style={styles.activationVerifiedText}>✓ Verified</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.activationVerifyButton,
                    (!activationCode.trim() || verifyingCode) && styles.activationVerifyButtonDisabled,
                  ]}
                  onPress={verifyActivationCode}
                  disabled={!activationCode.trim() || verifyingCode}
                >
                  {verifyingCode ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.activationVerifyButtonText}>Verify</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
            
            {activationError && (
              <View style={styles.activationErrorContainer}>
                <Text style={styles.activationErrorText}>⚠️ {activationError}</Text>
              </View>
            )}
            
            {activationVerified && (
              <View style={styles.activationSuccessContainer}>
                <Text style={styles.activationSuccessText}>🎉 You're approved to register as a distributor!</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </Animated.View>
  );

  const renderPersonalStep = () => (
    <Animated.View style={[styles.stepContainer, { transform: [{ translateX: slideAnim }] }]}>
      <View style={styles.contentCard}>
        <Text style={styles.cardTitle}>Your Details</Text>
        <Text style={styles.cardSubtitle}>Help us personalize your experience</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Full Name</Text>
          <View style={styles.inputWrapper}>
            <Text style={styles.inputIcon}>👤</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Enter your full name"
              placeholderTextColor="#94A3B8"
              autoCapitalize="words"
            />
          </View>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Phone Number</Text>
          <View style={styles.phoneInputWrapper}>
            <View style={styles.countryCodeBox}>
              <Text style={styles.countryFlag}>🇮🇳</Text>
              <Text style={styles.countryCode}>+91</Text>
            </View>
            <View style={styles.phoneInputDivider} />
            <TextInput
              style={styles.phoneInput}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="10-digit number"
              placeholderTextColor="#94A3B8"
              maxLength={10}
            />
          </View>
          <Text style={styles.inputHint}>📱 We'll send order updates to this number</Text>
        </View>
      </View>
    </Animated.View>
  );

  const renderAddressStep = () => {
    if (role === 'distributor') {
      return (
        <Animated.View style={[styles.stepContainer, { transform: [{ translateX: slideAnim }] }]}>
          <View style={styles.contentCard}>
            <Text style={styles.cardTitle}>Distributor Details</Text>
            <Text style={styles.cardSubtitle}>Provide your identification and vehicle information</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>ID Proof Type *</Text>
              <View style={styles.idProofTypeContainer}>
                {[
                  { value: 'aadhar', label: 'Aadhar Card', icon: '🆔' },
                  { value: 'pan', label: 'PAN Card', icon: '💳' },
                  { value: 'driving_license', label: 'Driving License', icon: '🚗' },
                ].map((type) => (
                  <TouchableOpacity
                    key={type.value}
                    style={[styles.idProofChip, idProofType === type.value && styles.idProofChipActive]}
                    onPress={() => setIdProofType(type.value as any)}
                  >
                    <Text style={styles.idProofChipIcon}>{type.icon}</Text>
                    <Text style={[styles.idProofChipText, idProofType === type.value && styles.idProofChipTextActive]}>
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>ID Proof Number *</Text>
              <TextInput
                style={styles.input}
                value={idProofNumber}
                onChangeText={setIdProofNumber}
                placeholder={
                  idProofType === 'aadhar' ? 'e.g. 1234 5678 9012' :
                  idProofType === 'pan' ? 'e.g. ABCDE1234F' :
                  idProofType === 'driving_license' ? 'e.g. DL1420110012345' :
                  'Enter your ID number'
                }
                placeholderTextColor="#94A3B8"
                autoCapitalize="characters"
              />
              <Text style={styles.inputHint}>This will be verified by admin</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Vehicle Number *</Text>
              <TextInput
                style={styles.input}
                value={vehicleNumber}
                onChangeText={setVehicleNumber}
                placeholder="e.g. KA01AB1234"
                placeholderTextColor="#94A3B8"
                autoCapitalize="characters"
              />
              <Text style={styles.inputHint}>Admin will assign delivery areas to you</Text>
            </View>
          </View>
        </Animated.View>
      );
    }

    if (role === 'customer') {
      return (
        <Animated.View style={[styles.stepContainer, { transform: [{ translateX: slideAnim }] }]}>
          <View style={styles.contentCard}>
            <Text style={styles.cardTitle}>Your Address</Text>
            <Text style={styles.cardSubtitle}>Help us locate your delivery address</Text>

            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>⚠️ {error}</Text>
                <TouchableOpacity onPress={loadSocieties}>
                  <Text style={styles.errorRetry}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Society Selection */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>🏘️ Society *</Text>
              <TextInput
                style={styles.input}
                value={searchQuery}
                onChangeText={(q) => {
                  setSearchQuery(q);
                  if (q.length > 2) {
                    loadSocieties();
                  }
                }}
                placeholder="Search for your society..."
                placeholderTextColor="#94A3B8"
              />
              {loadingStep === 'societies' ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color="#0D9488" />
                  <Text style={styles.loadingText}>Searching societies...</Text>
                </View>
              ) : societies.length > 0 ? (
                <ScrollView style={styles.selectionList} horizontal showsHorizontalScrollIndicator={false}>
                  {societies.map(society => (
                    <TouchableOpacity
                      key={society.id}
                      style={[styles.selectionCard, selectedSociety === society.id && styles.selectionCardActive]}
                      onPress={() => {
                        setSelectedSociety(society.id);
                        loadTowers(society.id);
                      }}
                    >
                      <Text style={[styles.selectionCardText, selectedSociety === society.id && styles.selectionCardTextActive]}>
                        {society.name}
                      </Text>
                      {society.area && (
                        <Text style={styles.selectionCardSubtext}>{society.area}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : searchQuery.length > 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyIcon}>🏘️</Text>
                  <Text style={styles.emptyText}>No societies found</Text>
                  <Text style={styles.emptySubtext}>Try a different search</Text>
                </View>
              ) : null}
            </View>

            {/* Tower Selection */}
            {selectedSociety && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>🏢 Tower/Building *</Text>
                {loadingStep === 'towers' ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color="#0D9488" />
                    <Text style={styles.loadingText}>Loading towers...</Text>
                  </View>
                ) : towers.length > 0 ? (
                  <View style={styles.gridContainer}>
                    {towers.map(tower => (
                      <TouchableOpacity
                        key={tower.id}
                        style={[styles.gridItem, selectedTower === tower.id && styles.gridItemActive]}
                        onPress={() => {
                          setSelectedTower(tower.id);
                          loadUnits(tower.id);
                        }}
                      >
                        <Text style={[styles.gridItemText, selectedTower === tower.id && styles.gridItemTextActive]}>
                          Tower {tower.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>🏗️</Text>
                    <Text style={styles.emptyText}>No towers found</Text>
                  </View>
                )}
              </View>
            )}

            {/* Unit Selection */}
            {selectedTower && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>🏠 Unit/Flat *</Text>
                {loadingStep === 'units' ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color="#0D9488" />
                    <Text style={styles.loadingText}>Loading units...</Text>
                  </View>
                ) : units.length > 0 ? (
                  <View style={styles.unitsGrid}>
                    {units.map(unit => (
                      <TouchableOpacity
                        key={unit.id}
                        style={[styles.unitChip, selectedUnit === unit.id && styles.unitChipActive]}
                        onPress={() => setSelectedUnit(unit.id)}
                      >
                        <Text style={[styles.unitChipText, selectedUnit === unit.id && styles.unitChipTextActive]}>
                          {unit.number}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>🏠</Text>
                    <Text style={styles.emptyText}>No units found</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </Animated.View>
      );
    }

    return null;
  };

  const renderVerifyStep = () => {
    const getSocietyName = () => societies.find(s => s.id === selectedSociety)?.name || '';
    const getTowerName = () => towers.find(t => t.id === selectedTower)?.name || '';
    const getUnitName = () => units.find(u => u.id === selectedUnit)?.number || '';

    return (
      <Animated.View style={[styles.stepContainer, { transform: [{ translateX: slideAnim }] }]}>
        <View style={styles.contentCard}>
          <Text style={styles.cardTitle}>Review Your Details</Text>
          <Text style={styles.cardSubtitle}>Make sure everything looks correct</Text>

          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>👤 Role</Text>
              <Text style={styles.summaryValue}>{role === 'customer' ? '🛍️ Customer' : '🚚 Distributor'}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>📝 Name</Text>
              <Text style={styles.summaryValue}>{name}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>📱 Phone</Text>
              <Text style={styles.summaryValue}>+91 {phone}</Text>
            </View>
            
            {role === 'customer' && selectedSociety && (
              <>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>🏘️ Society</Text>
                  <Text style={styles.summaryValue}>{getSocietyName()}</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>🏢 Tower</Text>
                  <Text style={styles.summaryValue}>Tower {getTowerName()}</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>🏠 Unit</Text>
                  <Text style={styles.summaryValue}>{getUnitName()}</Text>
                </View>
              </>
            )}

            {role === 'distributor' && (
              <>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>🆔 ID Type</Text>
                  <Text style={styles.summaryValue}>
                    {idProofType === 'aadhar' ? 'Aadhar Card' : 
                     idProofType === 'pan' ? 'PAN Card' : 
                     idProofType === 'driving_license' ? 'Driving License' : ''}
                  </Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>🔢 ID Number</Text>
                  <Text style={styles.summaryValue}>{idProofNumber}</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>🚗 Vehicle</Text>
                  <Text style={styles.summaryValue}>{vehicleNumber}</Text>
                </View>
              </>
            )}
          </View>

          <Text style={styles.verifyNote}>
            {role === 'distributor' 
              ? '⏳ Your account will be reviewed by admin before activation. You\'ll be notified once approved.' 
              : '✨ Tap "Complete Setup" below to start ordering fresh deliveries!'}
          </Text>
        </View>
      </Animated.View>
    );
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'role':
        return renderRoleStep();
      case 'personal':
        return renderPersonalStep();
      case 'address':
        return renderAddressStep();
      case 'verify':
        return renderVerifyStep();
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {renderProgressBar()}
      
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {renderCurrentStep()}
      </ScrollView>

      {/* Navigation Buttons */}
      <View style={styles.navigationContainer}>
        {currentStep !== 'role' && (
          <TouchableOpacity 
            style={styles.backButton}
            onPress={handlePrevStep}
            activeOpacity={0.7}
          >
            <Text style={styles.backButtonIcon}>←</Text>
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        )}
        
        {currentStep !== 'verify' ? (
          <TouchableOpacity
            style={[styles.nextButton, !canProceedToNextStep() && styles.nextButtonDisabled]}
            onPress={handleNextStep}
            disabled={!canProceedToNextStep()}
            activeOpacity={0.8}
          >
            <Text style={styles.nextButtonText}>Continue</Text>
            <Text style={styles.nextButtonIcon}>→</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.submitButton, (!canProceedToNextStep() || loading) && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!canProceedToNextStep() || loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <>
                <Text style={styles.submitButtonText}>Complete Setup</Text>
                <Text style={styles.submitButtonIcon}>🎉</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  // Header Gradient
  headerGradient: {
    paddingTop: 60,
    paddingBottom: 30,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    position: 'relative',
  },
  headerContent: {
    alignItems: 'center',
    marginBottom: 24,
    zIndex: 1,
  },
  headerBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  headerBadgeText: {
    fontSize: 32,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  decorCircle1: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -40,
    right: -40,
  },
  decorCircle2: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom: -20,
    left: -20,
  },

  // Progress Steps
  stepsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 8,
    position: 'relative',
    zIndex: 1,
  },
  stepItem: {
    alignItems: 'center',
    zIndex: 2,
  },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stepDotActive: {
    backgroundColor: '#FFFFFF',
  },
  stepDotCompleted: {
    backgroundColor: '#10B981',
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
  },
  stepNumberActive: {
    color: '#0D9488',
  },
  stepCheckmark: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  stepLabelActive: {
    color: '#FFFFFF',
  },
  stepsLine: {
    position: 'absolute',
    top: 16,
    left: 40,
    right: 40,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    zIndex: 1,
  },
  stepsLineFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 2,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 100,
  },
  stepContainer: {
    flex: 1,
  },

  // Content Card
  contentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 15,
    color: '#64748B',
    marginBottom: 24,
    lineHeight: 22,
  },

  // Role Cards
  roleCardsContainer: {
    gap: 16,
  },
  roleCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  roleCardActive: {
    borderColor: '#0D9488',
    backgroundColor: '#CCFBF1',
  },
  roleIconBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  roleIconBadgeActive: {
    backgroundColor: '#0D9488',
  },
  roleIcon: {
    fontSize: 28,
  },
  roleTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
  },
  roleTextActive: {
    color: '#0D9488',
  },
  roleDescription: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  roleCheckmark: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleCheckmarkText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Activation Code Styles
  activationCodeSection: {
    marginTop: 24,
    backgroundColor: '#FEF3C7',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  activationCodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  activationCodeIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  activationCodeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#92400E',
  },
  activationCodeDescription: {
    fontSize: 13,
    color: '#A16207',
    lineHeight: 18,
    marginBottom: 16,
  },
  activationCodeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  activationCodeInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    letterSpacing: 2,
    textAlign: 'center',
  },
  activationCodeInputVerified: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  activationCodeInputError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  activationVerifyButton: {
    backgroundColor: '#0D9488',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    minWidth: 80,
    alignItems: 'center',
  },
  activationVerifyButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  activationVerifyButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  activationVerifiedBadge: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  activationVerifiedText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  activationErrorContainer: {
    marginTop: 12,
    backgroundColor: '#FEE2E2',
    padding: 10,
    borderRadius: 8,
  },
  activationErrorText: {
    fontSize: 13,
    color: '#DC2626',
    fontWeight: '500',
  },
  activationSuccessContainer: {
    marginTop: 12,
    backgroundColor: '#DCFCE7',
    padding: 12,
    borderRadius: 8,
  },
  activationSuccessText: {
    fontSize: 13,
    color: '#16A34A',
    fontWeight: '600',
    textAlign: 'center',
  },

  // Input Styles
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 10,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  inputIcon: {
    fontSize: 18,
    marginLeft: 14,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  phoneInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  countryCodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  countryFlag: {
    fontSize: 18,
    marginRight: 6,
  },
  countryCode: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  phoneInputDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#E2E8F0',
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  inputHint: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 8,
  },

  // Selection Cards
  selectionList: {
    marginTop: 12,
    maxHeight: 140,
  },
  selectionCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 16,
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    minWidth: 160,
  },
  selectionCardActive: {
    borderColor: '#0D9488',
    backgroundColor: '#CCFBF1',
  },
  selectionCardText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
  },
  selectionCardTextActive: {
    color: '#0D9488',
  },
  selectionCardSubtext: {
    fontSize: 12,
    color: '#64748B',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  gridItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  gridItemActive: {
    borderColor: '#0D9488',
    backgroundColor: '#CCFBF1',
  },
  gridItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  gridItemTextActive: {
    color: '#0D9488',
  },
  unitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  unitChip: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  unitChipActive: {
    borderColor: '#0D9488',
    backgroundColor: '#CCFBF1',
  },
  unitChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  unitChipTextActive: {
    color: '#0D9488',
  },

  // Summary Card
  summaryCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 4,
  },
  verifyNote: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 18,
    paddingHorizontal: 16,
  },

  // ID Proof
  idProofTypeContainer: {
    gap: 10,
    marginTop: 8,
  },
  idProofChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  idProofChipActive: {
    borderColor: '#0D9488',
    backgroundColor: '#CCFBF1',
  },
  idProofChipIcon: {
    fontSize: 24,
    marginRight: 14,
  },
  idProofChipText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  idProofChipTextActive: {
    color: '#0D9488',
  },

  // Navigation
  navigationContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 32,
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 6,
  },
  backButtonIcon: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748B',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
  },
  nextButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D9488',
    borderRadius: 14,
    paddingVertical: 16,
    gap: 8,
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  nextButtonDisabled: {
    opacity: 0.5,
    shadowOpacity: 0.1,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  nextButtonIcon: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  submitButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 16,
    gap: 8,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    opacity: 0.5,
    shadowOpacity: 0.1,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  submitButtonIcon: {
    fontSize: 16,
  },

  // Input Group (for address step)
  inputGroup: {
    marginBottom: 20,
  },

  // Loading State
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },

  // Error Banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '500',
    flex: 1,
  },
  errorRetry: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0D9488',
    marginLeft: 12,
  },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#94A3B8',
  },
});

export default OnboardingScreen;
