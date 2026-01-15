import React from 'react';
import { View, StyleSheet, StatusBar, ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets, Edge } from 'react-native-safe-area-context';
import { theme } from '../theme';

interface AppLayoutProps {
  children: React.ReactNode;
  /** Background color for the layout */
  backgroundColor?: string;
  /** 
   * Safe area edges to apply padding for.
   * By default handles: bottom (for gesture navigation), left, right (for rounded corners)
   * Top is NOT included by default since AppBar handles that.
   */
  edges?: Edge[];
  /** Additional style for the container */
  style?: ViewStyle;
  /** Whether to use dark status bar icons (for light backgrounds) */
  statusBarStyle?: 'light-content' | 'dark-content';
  /** Status bar background color (Android only) */
  statusBarBackgroundColor?: string;
  /** Whether content should extend behind the status bar */
  noTopSafeArea?: boolean;
}

/**
 * AppLayout - A wrapper component for consistent screen layouts
 * 
 * Handles:
 * - Notches (iPhone X+, Android phones with notches)
 * - Dynamic Island (iPhone 14 Pro+)
 * - Status bar spacing
 * - Rounded corners (modern phones)
 * - Bottom gesture area (iPhone home indicator, Android gesture navigation)
 * - Left/right safe areas (landscape mode)
 * 
 * Usage with AppBar:
 * ```tsx
 * <AppLayout>
 *   <AppBar title="Screen Title" onBack={goBack} />
 *   <ScrollView>
 *     {/* Your content *\/}
 *   </ScrollView>
 * </AppLayout>
 * ```
 * 
 * Usage without AppBar (full screen content):
 * ```tsx
 * <AppLayout edges={['top', 'bottom', 'left', 'right']}>
 *   {/* Full screen content with all safe areas *\/}
 * </AppLayout>
 * ```
 */
export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  backgroundColor = theme.colors.background,
  edges = ['bottom', 'left', 'right'], // Top handled by AppBar
  style,
  statusBarStyle = 'light-content',
  statusBarBackgroundColor,
  noTopSafeArea = true,
}) => {
  const insets = useSafeAreaInsets();
  
  return (
    <SafeAreaView 
      style={[
        styles.container, 
        { backgroundColor },
        style
      ]} 
      edges={edges}
    >
      <StatusBar 
        barStyle={statusBarStyle} 
        backgroundColor={statusBarBackgroundColor || 'transparent'}
        translucent
      />
      {children}
    </SafeAreaView>
  );
};

/**
 * AppLayoutWithoutSafeArea - For screens that need manual control
 * Use this when you need to handle safe areas yourself (e.g., full-bleed images)
 */
export const AppLayoutRaw: React.FC<{
  children: React.ReactNode;
  backgroundColor?: string;
  style?: ViewStyle;
}> = ({ children, backgroundColor = theme.colors.background, style }) => {
  return (
    <View style={[styles.container, { backgroundColor }, style]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {children}
    </View>
  );
};

/**
 * Hook to get safe area insets for custom layouts
 */
export { useSafeAreaInsets };

/**
 * Get the bottom safe area height (useful for absolute positioned elements)
 */
export const useBottomSafeArea = () => {
  const insets = useSafeAreaInsets();
  return insets.bottom;
};

/**
 * Get all safe area insets
 */
export const useSafeAreas = () => {
  const insets = useSafeAreaInsets();
  return {
    top: insets.top,
    bottom: insets.bottom,
    left: insets.left,
    right: insets.right,
    // Common combinations
    horizontal: insets.left + insets.right,
    vertical: insets.top + insets.bottom,
  };
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default AppLayout;
