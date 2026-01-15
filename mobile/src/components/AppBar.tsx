import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

interface AppBarAction {
  label?: string;
  onPress: () => void;
  icon?: string;
  accessibilityLabel?: string;
}

interface AppBarProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: AppBarAction[];
  variant?: 'gradient' | 'blur' | 'solid' | 'transparent' | 'primary' | 'surface';
  showProfileIcon?: boolean;
  onProfilePress?: () => void;
  elevation?: boolean;
}

export const AppBar: React.FC<AppBarProps> = ({
  title,
  subtitle,
  onBack,
  actions,
  variant = 'gradient',
  showProfileIcon = false,
  onProfilePress,
  elevation = true,
}) => {
  const insets = useSafeAreaInsets();
  const appBarHeight = 56;
  const totalHeight = appBarHeight + insets.top;
  
  // Determine if using light or dark theme
  const isLightVariant = variant === 'surface' || variant === 'transparent';

  const renderContent = () => (
    <View style={[styles.container, { paddingTop: insets.top, height: totalHeight }]}>
      <StatusBar barStyle={isLightVariant ? 'dark-content' : 'light-content'} />
      <View style={[
        styles.content, 
        elevation && !isLightVariant && styles.elevated,
      ]}>
        {/* Left Section */}
        <View style={styles.leftSection}>
          {onBack && (
            <TouchableOpacity
              accessibilityLabel="Back"
              onPress={onBack}
              style={[
                styles.backButton,
                isLightVariant && styles.backButtonLight,
              ]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={[styles.backIcon, isLightVariant && styles.backIconLight]}>←</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Center Section */}
        <View style={styles.centerSection}>
          <Text 
            numberOfLines={1} 
            style={[styles.title, isLightVariant && styles.titleLight]}
          >
            {title}
          </Text>
          {subtitle && (
            <Text 
              numberOfLines={1} 
              style={[styles.subtitle, isLightVariant && styles.subtitleLight]}
            >
              {subtitle}
            </Text>
          )}
        </View>

        {/* Right Section */}
        <View style={styles.rightSection}>
          {actions?.map((action, index) => (
            <TouchableOpacity
              key={index}
              onPress={action.onPress}
              style={[
                styles.actionButton,
                isLightVariant && styles.actionButtonLight,
              ]}
              accessibilityLabel={action.accessibilityLabel || action.label}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              {action.icon ? (
                <Text style={styles.actionIcon}>{action.icon}</Text>
              ) : (
                <Text style={[styles.actionText, isLightVariant && styles.actionTextLight]}>
                  {action.label}
                </Text>
              )}
            </TouchableOpacity>
          ))}
          {showProfileIcon && (
            <TouchableOpacity
              onPress={onProfilePress}
              style={styles.profileButton}
              accessibilityLabel="Profile"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <View style={[
                styles.profileIconContainer,
                isLightVariant && styles.profileIconContainerLight,
              ]}>
                <Text style={styles.profileIcon}>👤</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

  // Gradient variant (blue gradient header)
  if (variant === 'gradient' || variant === 'primary') {
    return (
      <LinearGradient
        colors={['#2196F3', '#ff0000ff', '#1565C0']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {renderContent()}
      </LinearGradient>
    );
  }

  // Blur variant
  if (variant === 'blur') {
    return (
      <View style={styles.gradient}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill}>
            {renderContent()}
          </BlurView>
        ) : (
          <View style={[styles.gradient, { backgroundColor: 'rgba(33, 150, 243, 0.95)' }]}>
            {renderContent()}
          </View>
        )}
      </View>
    );
  }

  // Solid variant (solid blue)
  if (variant === 'solid') {
    return (
      <View style={[styles.gradient, { backgroundColor: theme.colors.primary }]}>
        {renderContent()}
      </View>
    );
  }

  // Surface variant (white background - modern theme)
  if (variant === 'surface') {
    return (
      <View style={[styles.gradient, styles.surfaceContainer]}>
        {renderContent()}
      </View>
    );
  }

  // Transparent variant
  return (
    <View style={[styles.gradient, { backgroundColor: 'transparent' }]}>
      {renderContent()}
    </View>
  );
};

const styles = StyleSheet.create({
  gradient: {
    width: '100%',
  },
  surfaceContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  container: {
    width: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    paddingHorizontal: 16,
  },
  elevated: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
      },
    }),
  },
  leftSection: {
    width: 50,
    alignItems: 'flex-start',
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  rightSection: {
    minWidth: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  // Dark theme (gradient/solid/blur) styles
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  backIcon: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    marginTop: 2,
  },
  actionButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionIcon: {
    fontSize: 22,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  profileButton: {
    marginLeft: 4,
  },
  profileIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  profileIcon: {
    fontSize: 18,
  },
  // Light theme (surface/transparent) styles
  backButtonLight: {
    backgroundColor: '#F1F5F9',
  },
  backIconLight: {
    color: '#1E293B',
  },
  titleLight: {
    color: '#1E293B',
  },
  subtitleLight: {
    color: '#64748B',
  },
  actionButtonLight: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  actionTextLight: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  profileIconContainerLight: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
});

export default AppBar;
