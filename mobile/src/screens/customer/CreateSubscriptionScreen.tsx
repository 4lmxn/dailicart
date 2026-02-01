import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  Dimensions,
} from 'react-native';
import { AppLayout } from '../../components/AppLayout';
import { AppBar } from '../../components/AppBar';
import { theme } from '../../theme';
import { formatCurrency, cdn, getLocalDateString, getProductEmoji } from '../../utils/helpers';
import { WEEK_DAYS_PICKER } from '../../constants';
import { SubscriptionService } from '../../services/api/subscriptions';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../services/supabase';
import { getDefaultAddress } from '../../services/address';

interface CreateSubscriptionScreenProps {
  product: any;
  onBack: () => void;
  onNavigateToWallet: () => void;
  onComplete: () => void;
}

type DeliveryTime = 'morning' | 'evening';
type FrequencyType = 'daily' | 'alternate' | 'custom';

const DELIVERY_TIMES = [
  { id: 'morning', label: 'Morning', time: '6-8 AM', icon: '🌅' },
  { id: 'evening', label: 'Evening', time: '5-7 PM', icon: '🌆' },
];

const FREQUENCIES = [
  { id: 'daily', label: 'Daily', description: 'Every day', icon: '📅' },
  { id: 'alternate', label: 'Alternate Days', description: 'Every other day', icon: '🔄' },
  { id: 'custom', label: 'Custom Days', description: 'Choose specific days', icon: '✨' },
];

// Simple quantity options - just 1 to 5 units
const QUANTITY_OPTIONS = [1, 2, 3, 4, 5];

export const CreateSubscriptionScreen: React.FC<CreateSubscriptionScreenProps> = ({
  product,
  onBack,
  onNavigateToWallet,
  onComplete,
}) => {
  const [step, setStep] = useState(1);
  const [quantity, setQuantity] = useState<number>(1);
  const [deliveryTime, setDeliveryTime] = useState<DeliveryTime>('morning');
  const [frequency, setFrequency] = useState<FrequencyType>('daily');
  const [selectedProduct, setSelectedProduct] = useState(product);
  const [productVariants, setProductVariants] = useState<any[]>([]);
  const [relatedProducts, setRelatedProducts] = useState<any[]>([]);
  const [showVariantPicker, setShowVariantPicker] = useState(false);
  const [customDays, setCustomDays] = useState<number[]>([]);
  
  // Subscriptions created after 5 AM start from next day
  const getInitialStartDate = () => {
    const now = new Date();
    const cutoffHour = 5; // 5 AM cutoff
    if (now.getHours() >= cutoffHour) {
      // Past 5 AM - start from next day
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return tomorrow;
    }
    // Before 5 AM - can start today
    return now;
  };
  
  const [startDate, setStartDate] = useState(getInitialStartDate);
  const [creating, setCreating] = useState(false);
  const [mainImageFailed, setMainImageFailed] = useState(false);
  const user = useAuthStore((state) => state.user);

  // Fetch product variants (same name, different sizes) and related products
  useEffect(() => {
    const fetchProductData = async () => {
      try {
        console.log('Fetching variants for:', product.name);
        
        // Fetch variants - same exact product name, different units/sizes
        const { data: variants, error: variantsError } = await supabase
          .from('products')
          .select('*')
          .eq('name', product.name)
          .eq('is_active', true)
          .order('price', { ascending: true });
        
        console.log('Variants found:', variants?.length, variantsError);
        
        if (!variantsError && variants && variants.length > 0) {
          setProductVariants(variants);
        } else {
          // If no variants found, use the current product
          setProductVariants([product]);
        }

        // Fetch related products - same category & brand, but different names
        const { data: related, error: relatedError } = await supabase
          .from('products')
          .select('*')
          .eq('category', product.category)
          .eq('brand_id', product.brand_id)
          .neq('name', product.name)
          .eq('is_active', true)
          .order('price', { ascending: true });
        
        if (!relatedError && related) {
          // Group by name, take cheapest variant of each
          const uniqueRelated = related.reduce((acc: any[], curr) => {
            if (!acc.find(p => p.name === curr.name)) {
              acc.push(curr);
            }
            return acc;
          }, []);
          setRelatedProducts(uniqueRelated);
        }
      } catch (err) {
        console.error('Error fetching product data:', err);
        // Fallback to current product
        setProductVariants([product]);
      }
    };
    
    fetchProductData();
  }, [product.name, product.category, product.brand_id]);

  const toggleDay = (dayId: number) => {
    setCustomDays(prev =>
      prev.includes(dayId)
        ? prev.filter(d => d !== dayId)
        : [...prev, dayId].sort()
    );
  };

  const calculateMonthlyPrice = () => {
    let daysPerMonth = 30;
    if (frequency === 'alternate') {
      daysPerMonth = 15;
    } else if (frequency === 'custom' && customDays.length > 0) {
      daysPerMonth = (customDays.length / 7) * 30;
    }
    // Simple: quantity × price × days
    return selectedProduct.price * quantity * daysPerMonth;
  };

  const getDailyPrice = () => {
    return selectedProduct.price * quantity;
  };

  const handleCreateSubscription = async () => {
    if (frequency === 'custom' && customDays.length === 0) {
      Alert.alert('Error', 'Please select at least one day for delivery');
      return;
    }

    // Check availability
    if (selectedProduct.stock !== undefined && selectedProduct.stock <= 0) {
      Alert.alert('Out of stock', 'This product is currently unavailable');
      return;
    }

    if (!user?.id) {
      Alert.alert('Error', 'Please login to create a subscription');
      return;
    }

    try {
      setCreating(true);
      
      // Fetch customer wallet balance - use maybeSingle to handle new users
      const { data: customerRow, error: custErr } = await supabase
        .from('customers')
        .select('id, wallet_balance')
        .eq('user_id', user.id)
        .maybeSingle();

      if (custErr) {
        Alert.alert('Error', 'Unable to fetch customer profile. Please try again.');
        setCreating(false);
        return;
      }

      // Handle new users without customer record
      if (!customerRow) {
        Alert.alert(
          'Profile Not Found',
          'Your customer profile is being set up. Please try again in a moment.',
          [{ text: 'OK' }]
        );
        setCreating(false);
        return;
      }

      // Use user.id directly for queries (after migration)
      const userId = user.id;
      const defaultAddr = await getDefaultAddress(userId);
      if (!defaultAddr) {
        Alert.alert(
          '📍 Address Required',
          'Please add a default delivery address in your profile before subscribing.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Go to Profile', onPress: onBack }
          ]
        );
        setCreating(false);
        return;
      }
      
      // CRITICAL: Check wallet balance before creating subscription
      const firstDeliveryCost = quantity * selectedProduct.price;

      if (customerRow.wallet_balance < firstDeliveryCost) {
        Alert.alert(
          '💰 Insufficient Balance',
          `You need ₹${firstDeliveryCost.toFixed(2)} for the first delivery.\n\nCurrent Balance: ₹${(customerRow.wallet_balance || 0).toFixed(2)}\n\nPlease recharge your wallet to continue.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: '💳 Recharge Now', 
              onPress: () => {
                // Navigate directly to wallet screen
                onNavigateToWallet();
              }
            }
          ]
        );
        setCreating(false);
        return;
      }
      
      // Log subscription creation attempt
      console.log('Creating subscription:', {
        customerId: userId, // Use user_id
        addressId: defaultAddr.id,
        productId: selectedProduct.id,
        quantityValue: quantity,
        quantityUnit: selectedProduct.unit,
        frequency,
        walletBalance: customerRow.wallet_balance,
        firstDeliveryCost,
      });
      
      await SubscriptionService.createSubscription({
        customerId: userId, // Use user_id (createSubscription now sets both user_id and customer_id)
        addressId: defaultAddr.id,
        productId: selectedProduct.id,
        quantity: quantity,
        frequency,
        customDays: frequency === 'custom' ? customDays : undefined,
        deliveryTime,
        startDate: getLocalDateString(startDate),
      });

      Alert.alert(
        'Success! 🎉',
        `Your subscription has been created!\n\n${selectedProduct.name} (${selectedProduct.unit})\nQuantity: ${quantity} per day\nFrequency: ${frequency}\nDelivery: ${deliveryTime === 'morning' ? 'Morning (6-8 AM)' : 'Evening (5-7 PM)'}`,
        [{ text: 'OK', onPress: onComplete }]
      );
    } catch (error: any) {
      console.error('Error creating subscription:', error);
      
      // Provide more specific error messages
      let errorMessage = 'Failed to create subscription. Please try again.';
      
      if (error?.message?.includes('violates foreign key')) {
        errorMessage = '⚠️ Database not configured. Please execute FRESH_START schema in Supabase first.';
      } else if (error?.code === '23503') {
        errorMessage = '⚠️ User profile not found. Please logout and login again.';
      } else if (error?.code === '42P01') {
        errorMessage = '⚠️ Database tables not created. Please execute FRESH_START schema in Supabase.';
      } else if (error?.message) {
        errorMessage = `Error: ${error.message}`;
      }
      
      Alert.alert('Error', errorMessage);
    } finally {
      setCreating(false);
    }
  };

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Choose Size & Quantity</Text>

      {/* Tappable Product card - opens size picker */}
      <TouchableOpacity 
        style={styles.productCard}
        onPress={() => setShowVariantPicker(true)}
        activeOpacity={0.8}
      >
        <View style={styles.productCardLeft}>
          <Text style={styles.productCardEmoji}>{getProductEmoji(selectedProduct.category, selectedProduct.name)}</Text>
          <View style={styles.productCardInfo}>
            <Text style={styles.productCardName} numberOfLines={1}>{selectedProduct.name}</Text>
            <View style={styles.productCardSizeRow}>
              <View style={styles.productCardSizeBadge}>
                <Text style={styles.productCardSizeText}>{selectedProduct.unit}</Text>
              </View>
              <Text style={styles.productCardPrice}>{formatCurrency(selectedProduct.price)}</Text>
            </View>
          </View>
        </View>
        <View style={styles.productCardRight}>
          <Text style={styles.productCardChangeText}>Change</Text>
          <Text style={styles.productCardChevron}>›</Text>
        </View>
      </TouchableOpacity>

      {/* Quantity selector */}
      <View style={styles.quantitySection}>
        <Text style={styles.quantitySectionTitle}>How many per delivery?</Text>
        
        <View style={styles.quantityControl}>
          <TouchableOpacity
            style={[styles.quantityBtn, quantity <= 1 && styles.quantityBtnDisabled]}
            onPress={() => setQuantity(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
          >
            <Text style={[styles.quantityBtnText, quantity <= 1 && styles.quantityBtnTextDisabled]}>−</Text>
          </TouchableOpacity>
          
          <View style={styles.quantityDisplay}>
            <Text style={styles.quantityNumber}>{quantity}</Text>
          </View>
          
          <TouchableOpacity
            style={[styles.quantityBtn, quantity >= 10 && styles.quantityBtnDisabled]}
            onPress={() => setQuantity(Math.min(10, quantity + 1))}
            disabled={quantity >= 10}
          >
            <Text style={[styles.quantityBtnText, quantity >= 10 && styles.quantityBtnTextDisabled]}>+</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.quantityDescription}>
          {quantity} × {selectedProduct.unit} = {formatCurrency(getDailyPrice())}/day
        </Text>
      </View>

      {/* Summary card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Daily Cost</Text>
          <Text style={styles.summaryValue}>{formatCurrency(getDailyPrice())}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabelSmall}>Monthly estimate (30 days)</Text>
          <Text style={styles.summaryValueSmall}>{formatCurrency(getDailyPrice() * 30)}</Text>
        </View>
      </View>
    </View>
  );

  // Variant picker modal
  const renderVariantPicker = () => {
    const screenHeight = Dimensions.get('window').height;
    const screenWidth = Dimensions.get('window').width;
    
    return (
      <Modal
        visible={showVariantPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowVariantPicker(false)}
      >
        <View style={[styles.modalOverlay, { height: screenHeight }]}>
          {/* Tap outside to close */}
          <TouchableOpacity 
            style={{ flex: 1 }} 
            activeOpacity={1} 
            onPress={() => setShowVariantPicker(false)} 
          />
          
          <View style={[styles.modalContent, { maxHeight: screenHeight * 0.65 }]}>
            {/* Handle bar */}
            <View style={styles.modalHandle}>
              <View style={styles.modalHandleBar} />
            </View>
            
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Select Size</Text>
                <Text style={styles.modalSubtitle}>{selectedProduct.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowVariantPicker(false)} style={styles.modalClose}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView 
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }}
              showsVerticalScrollIndicator={true}
            >
              {/* Variants section */}
              {productVariants.length > 0 ? (
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.modalSectionTitle}>Available Sizes</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
                    {productVariants.map((variant) => (
                      <TouchableOpacity
                        key={variant.id}
                        style={[
                          {
                            width: (screenWidth - 52) / 2,
                            backgroundColor: selectedProduct.id === variant.id ? '#E8F4FD' : '#F8F9FA',
                            borderRadius: 16,
                            padding: 16,
                            margin: 6,
                            alignItems: 'center',
                            borderWidth: 2,
                            borderColor: selectedProduct.id === variant.id ? theme.colors.primary : 'transparent',
                          },
                        ]}
                        onPress={() => {
                          setSelectedProduct(variant);
                          setShowVariantPicker(false);
                        }}
                        activeOpacity={0.7}
                      >
                        {selectedProduct.id === variant.id && (
                          <View style={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            width: 22,
                            height: 22,
                            backgroundColor: theme.colors.primary,
                            borderRadius: 11,
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFF' }}>✓</Text>
                          </View>
                        )}
                        <Text style={{ fontSize: 32, marginBottom: 8 }}>
                          {getProductEmoji(variant.category, variant.name)}
                        </Text>
                        <Text style={{
                          fontSize: 15,
                          fontWeight: '700',
                          color: selectedProduct.id === variant.id ? theme.colors.primary : theme.colors.text,
                          marginBottom: 4,
                          textAlign: 'center',
                        }}>
                          {variant.unit}
                        </Text>
                        <Text style={{
                          fontSize: 17,
                          fontWeight: '800',
                          color: theme.colors.primary,
                          marginBottom: 4,
                        }}>
                          {formatCurrency(variant.price)}
                        </Text>
                        <Text style={{ fontSize: 11, color: theme.colors.textSecondary }}>
                          {variant.stock_quantity > 0 ? `${variant.stock_quantity} in stock` : 'Out of stock'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: theme.colors.textSecondary }}>Loading sizes...</Text>
                </View>
              )}

              {/* Related products section */}
              {relatedProducts.length > 0 && (
                <View style={{ marginTop: 24 }}>
                  <Text style={styles.modalSectionTitle}>You might also like</Text>
                  {relatedProducts.map((related) => (
                    <TouchableOpacity
                      key={related.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: '#F8F9FA',
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 8,
                      }}
                      onPress={() => {
                        setSelectedProduct(related);
                        supabase
                          .from('products')
                          .select('*')
                          .eq('name', related.name)
                          .eq('is_active', true)
                          .order('price', { ascending: true })
                          .then(({ data }) => {
                            if (data) setProductVariants(data);
                          });
                        setShowVariantPicker(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 28, marginRight: 12 }}>
                        {getProductEmoji(related.category, related.name)}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.text }} numberOfLines={1}>
                          {related.name}
                        </Text>
                        <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                          {related.unit}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.text }}>
                        {formatCurrency(related.price)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Delivery Time</Text>
      <Text style={styles.stepSubtitle}>When should we deliver?</Text>

      <View style={styles.timeGrid}>
        {DELIVERY_TIMES.map((time) => (
          <TouchableOpacity
            key={time.id}
            style={[
              styles.timeCard,
              deliveryTime === time.id && styles.timeCardActive,
            ]}
            onPress={() => setDeliveryTime(time.id as DeliveryTime)}
          >
            <Text style={styles.timeIcon}>{time.icon}</Text>
            <Text
              style={[
                styles.timeLabel,
                deliveryTime === time.id && styles.timeLabelActive,
              ]}
            >
              {time.label}
            </Text>
            <Text
              style={[
                styles.timeText,
                deliveryTime === time.id && styles.timeTextActive,
              ]}
            >
              {time.time}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoIcon}>ℹ️</Text>
        <Text style={styles.infoText}>
          We deliver fresh products daily during your selected time slot
        </Text>
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Delivery Frequency</Text>
      <Text style={styles.stepSubtitle}>How often do you need delivery?</Text>

      {FREQUENCIES.map((freq) => (
        <TouchableOpacity
          key={freq.id}
          style={[
            styles.frequencyCard,
            frequency === freq.id && styles.frequencyCardActive,
          ]}
          onPress={() => setFrequency(freq.id as FrequencyType)}
        >
          <View style={styles.frequencyIcon}>
            <Text style={styles.frequencyIconText}>{freq.icon}</Text>
          </View>
          <View style={styles.frequencyInfo}>
            <Text
              style={[
                styles.frequencyLabel,
                frequency === freq.id && styles.frequencyLabelActive,
              ]}
            >
              {freq.label}
            </Text>
            <Text style={styles.frequencyDescription}>{freq.description}</Text>
          </View>
          <View
            style={[
              styles.radioOuter,
              frequency === freq.id && styles.radioOuterActive,
            ]}
          >
            {frequency === freq.id && <View style={styles.radioInner} />}
          </View>
        </TouchableOpacity>
      ))}

      {frequency === 'custom' && (
        <View style={styles.customDaysSection}>
          <Text style={styles.customDaysTitle}>Select Delivery Days</Text>
          <View style={styles.daysGrid}>
            {WEEK_DAYS_PICKER.map((day) => (
              <TouchableOpacity
                key={day.id}
                style={[
                  styles.dayButton,
                  customDays.includes(day.id) && styles.dayButtonActive,
                ]}
                onPress={() => toggleDay(day.id)}
              >
                <Text
                  style={[
                    styles.dayText,
                    customDays.includes(day.id) && styles.dayTextActive,
                  ]}
                >
                  {day.short}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {customDays.length > 0 && (
            <Text style={styles.selectedDaysText}>
              Delivering on:{' '}
              {customDays.map(id => WEEK_DAYS_PICKER.find(d => d.id === id)?.full).join(', ')}
            </Text>
          )}
        </View>
      )}

      <View style={styles.priceCard}>
        <Text style={styles.priceLabel}>Estimated Monthly Cost</Text>
        <Text style={styles.priceValue}>
          {formatCurrency(calculateMonthlyPrice())}
        </Text>
      </View>
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Review & Confirm</Text>
      <Text style={styles.stepSubtitle}>Check your subscription details</Text>

      <View style={styles.reviewCard}>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Product</Text>
          <Text style={styles.reviewValue}>{selectedProduct.name}</Text>
        </View>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Size</Text>
          <Text style={styles.reviewValue}>{selectedProduct.unit}</Text>
        </View>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Quantity</Text>
          <Text style={styles.reviewValue}>{quantity} per day</Text>
        </View>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Time</Text>
          <Text style={styles.reviewValue}>
            {deliveryTime === 'morning' ? 'Morning (6-8 AM)' : 'Evening (5-7 PM)'}
          </Text>
        </View>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Frequency</Text>
          <Text style={styles.reviewValue}>
            {frequency === 'daily'
              ? 'Daily'
              : frequency === 'alternate'
              ? 'Alternate Days'
              : `Custom (${customDays.length} days/week)`}
          </Text>
        </View>
        <View style={styles.reviewDivider} />
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Daily Cost</Text>
          <Text style={styles.reviewValue}>
            {formatCurrency(selectedProduct.price * quantity)}
          </Text>
        </View>
        <View style={styles.reviewRow}>
          <Text style={[styles.reviewLabel, styles.totalLabel]}>
            Monthly Estimate
          </Text>
          <Text style={[styles.reviewValue, styles.totalValue]}>
            {formatCurrency(calculateMonthlyPrice())}
          </Text>
        </View>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoIcon}>💡</Text>
        <Text style={styles.infoText}>
          Amount will be auto-deducted from your wallet after each delivery
        </Text>
      </View>
    </View>
  );

  return (
    <AppLayout>
      <AppBar 
        title="Create Subscription" 
        subtitle={`Step ${step} of 4`}
        onBack={onBack} 
        variant="surface" 
      />

      {/* Progress Bar */}
      <View style={styles.progressBar}>
        {[1, 2, 3, 4].map((s) => (
          <View
            key={s}
            style={[
              styles.progressStep,
              s <= step && styles.progressStepActive,
            ]}
          />
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        {step > 1 && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setStep(step - 1)}
          >
            <Text style={styles.secondaryButtonText}>Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.primaryButton, step === 1 && styles.primaryButtonFull]}
          onPress={() => {
            if (step < 4) {
              setStep(step + 1);
            } else {
              handleCreateSubscription();
            }
          }}
        >
          <Text style={styles.primaryButtonText}>
            {step === 4 ? 'Create Subscription' : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Variant Picker Modal */}
      {renderVariantPicker()}
    </AppLayout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  progressBar: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: '#FFFFFF',
    gap: 10,
  },
  progressStep: {
    flex: 1,
    height: 6,
    backgroundColor: '#E8EAED',
    borderRadius: 3,
  },
  progressStepActive: {
    backgroundColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  content: {
    flex: 1,
  },
  productHero: {
    height: 180,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 24,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8EAED',
  },
  productHeroImage: {
    width: '100%',
    height: '100%',
  },
  productHeroEmoji: {
    fontSize: 64,
  },
  stepContent: {
    padding: 24,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  stepSubtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginBottom: 28,
    lineHeight: 22,
    fontWeight: '500',
  },
  lowStockBanner: {
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  lowStockIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  lowStockText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#E65100',
  },
  quantityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
    marginBottom: 28,
  },
  quantityCard: {
    width: '50%',
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  quantityCardActive: {
    transform: [{ scale: 1.02 }],
  },
  quantityCardInner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#E8EAED',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  quantityCardInnerActive: {
    borderColor: theme.colors.primary,
    backgroundColor: '#E3F2FD',
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  quantityIcon: {
    fontSize: 56,
    textAlign: 'center',
    marginBottom: 16,
  },
  quantityLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  quantityLabelActive: {
    color: theme.colors.primary,
  },
  quantityPrice: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.primary,
    textAlign: 'center',
  },
  quantityPriceUnit: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  timeGrid: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 28,
  },
  timeCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#E8EAED',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  timeCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: '#E3F2FD',
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  timeIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  timeLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  timeLabelActive: {
    color: theme.colors.primary,
  },
  timeText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  timeTextActive: {
    color: theme.colors.primary,
  },
  frequencyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 3,
    borderColor: '#E8EAED',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  frequencyCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: '#E3F2FD',
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  frequencyIcon: {
    width: 56,
    height: 56,
    backgroundColor: '#F5F7FA',
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  frequencyIconText: {
    fontSize: 28,
  },
  frequencyInfo: {
    flex: 1,
  },
  frequencyLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  frequencyLabelActive: {
    color: theme.colors.primary,
  },
  frequencyDescription: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterActive: {
    borderColor: theme.colors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.primary,
  },
  customDaysSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    marginBottom: 24,
  },
  customDaysTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 12,
  },
  daysGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dayButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  dayButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  dayText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  dayTextActive: {
    color: '#FFFFFF',
  },
  selectedDaysText: {
    fontSize: 13,
    color: theme.colors.primary,
    textAlign: 'center',
  },
  priceCard: {
    backgroundColor: theme.colors.primary,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  priceLabel: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.95)',
    marginBottom: 8,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  priceValue: {
    fontSize: 40,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  reviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E8EAED',
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  reviewLabel: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  reviewValue: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'right',
    flex: 1,
    marginLeft: 20,
    letterSpacing: -0.2,
  },
  reviewDivider: {
    height: 1,
    backgroundColor: '#E8EAED',
    marginVertical: 12,
  },
  totalLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '900',
    color: theme.colors.primary,
  },
  infoBox: {
    backgroundColor: '#E3F2FD',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
  },
  infoIcon: {
    fontSize: 24,
    marginRight: 14,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 20,
    fontWeight: '500',
  },
  bottomActions: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingVertical: 20,
    flexDirection: 'row',
    gap: 14,
    borderTopWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#F5F7FA',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E8EAED',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    letterSpacing: -0.2,
  },
  primaryButton: {
    flex: 2,
    backgroundColor: theme.colors.primary,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonFull: {
    flex: 1,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  // Step 1 - Product card styles
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  productCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  productCardEmoji: {
    fontSize: 40,
    marginRight: 12,
  },
  productCardInfo: {
    flex: 1,
  },
  productCardName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 6,
  },
  productCardSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  productCardSizeBadge: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  productCardSizeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  productCardPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  productCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  productCardChangeText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  productCardChevron: {
    fontSize: 20,
    color: theme.colors.primary,
    fontWeight: '300',
  },
  // Quantity section styles
  quantitySection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E8EAED',
  },
  quantitySectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  quantityBtn: {
    width: 56,
    height: 56,
    backgroundColor: theme.colors.primary,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityBtnDisabled: {
    backgroundColor: '#E8EAED',
  },
  quantityBtnText: {
    fontSize: 28,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  quantityBtnTextDisabled: {
    color: '#999',
  },
  quantityDisplay: {
    minWidth: 60,
    alignItems: 'center',
  },
  quantityNumber: {
    fontSize: 48,
    fontWeight: '800',
    color: theme.colors.text,
  },
  quantityDescription: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 16,
    fontWeight: '500',
  },
  // Summary card styles
  summaryCard: {
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    padding: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginVertical: 12,
  },
  summaryLabelSmall: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
  },
  summaryValueSmall: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  // Old styles for quantity selector (keeping for compatibility)
  quantitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E8EAED',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  quantitySelectorButton: {
    width: 56,
    height: 56,
    backgroundColor: '#F5F7FA',
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantitySelectorButtonText: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  quantitySelectorButtonDisabled: {
    color: '#CCC',
  },
  quantitySelectorDisplay: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  quantitySelectorValue: {
    fontSize: 48,
    fontWeight: '900',
    color: theme.colors.text,
    letterSpacing: -1,
  },
  quantitySelectorUnit: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '500',
    marginTop: 4,
  },
  quickSelectRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 28,
  },
  quickSelectButton: {
    width: 48,
    height: 48,
    backgroundColor: '#F5F7FA',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  quickSelectButtonActive: {
    backgroundColor: '#E3F2FD',
    borderColor: theme.colors.primary,
  },
  quickSelectText: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  quickSelectTextActive: {
    color: theme.colors.primary,
  },
  priceBreakdown: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 8,
    fontWeight: '500',
  },
  // Product info card styles
  productInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  productInfoEmoji: {
    fontSize: 40,
    marginRight: 14,
  },
  productInfoDetails: {
    flex: 1,
  },
  productInfoName: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  productInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  productInfoUnitBadge: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  productInfoUnitBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  productInfoPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  productInfoChevron: {
    width: 28,
    height: 28,
    backgroundColor: '#F5F7FA',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productInfoChevronText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  // Variant chips styles
  variantChipsContainer: {
    marginBottom: 20,
  },
  variantChipsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 10,
  },
  variantChipsScroll: {
    marginHorizontal: -24,
    paddingHorizontal: 24,
  },
  variantChipsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  variantChip: {
    backgroundColor: '#F5F7FA',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  variantChipActive: {
    backgroundColor: '#E3F2FD',
    borderColor: theme.colors.primary,
  },
  variantChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  variantChipTextActive: {
    color: theme.colors.primary,
  },
  variantChipPrice: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  variantChipPriceActive: {
    color: theme.colors.primary,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: Dimensions.get('window').height * 0.7,
    minHeight: 300,
  },
  modalHandle: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  modalHandleBar: {
    width: 40,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 4,
    fontWeight: '500',
  },
  modalClose: {
    width: 36,
    height: 36,
    backgroundColor: '#F5F5F5',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 18,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  modalSection: {
    paddingTop: 20,
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  // Variant grid cards
  variantGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  variantCard: {
    width: (Dimensions.get('window').width - 52) / 2,
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    padding: 16,
    margin: 6,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  variantCardActive: {
    backgroundColor: '#E8F4FD',
    borderColor: theme.colors.primary,
  },
  variantCardCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  variantCardCheckText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  variantCardEmoji: {
    fontSize: 36,
    marginBottom: 10,
  },
  variantCardUnit: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  variantCardUnitActive: {
    color: theme.colors.primary,
  },
  variantCardPrice: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.primary,
    marginBottom: 4,
  },
  variantCardPriceActive: {
    color: theme.colors.primary,
  },
  variantCardStock: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  // Related items
  relatedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  relatedItemEmoji: {
    fontSize: 28,
    marginRight: 12,
  },
  relatedItemInfo: {
    flex: 1,
  },
  relatedItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 2,
  },
  relatedItemUnit: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  relatedItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  relatedItemPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  relatedItemArrow: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  // Keep old variant item styles for compatibility
  variantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8F9FA',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  variantItemActive: {
    backgroundColor: '#E3F2FD',
    borderColor: theme.colors.primary,
  },
  variantItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  variantItemEmoji: {
    fontSize: 32,
  },
  variantItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
  variantItemUnit: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  variantItemUnitActive: {
    color: theme.colors.primary,
  },
  variantItemStock: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  variantItemPrice: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
  },
  variantItemPriceActive: {
    color: theme.colors.primary,
  },
});
