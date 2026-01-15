import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';

interface SkeletonProps {
  height?: number;
  width?: number | string;
  radius?: number;
  style?: any;
  /** Disable shimmer animation for performance in lists */
  noAnimation?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({ 
  height = 16, 
  width = '100%', 
  radius = 8, 
  style,
  noAnimation = false,
}) => {
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    if (noAnimation) return;
    
    const animation = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    animation.start();
    
    return () => animation.stop();
  }, [noAnimation]);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  });

  return (
    <View style={[styles.base, { height, width, borderRadius: radius }, style]}>
      {!noAnimation && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transform: [{ translateX }] },
          ]}
        >
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.4)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
};

export const SkeletonLineGroup: React.FC<{ lines?: number }> = ({ lines=3 }) => (
  <View style={{ gap: 8 }}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} height={14} width={i === 0 ? '80%' : i === lines-1 ? '60%' : '100%'} />
    ))}
  </View>
);

const styles = StyleSheet.create({
  base: {
    backgroundColor: '#E0E0E0',
    overflow: 'hidden'
  }
});

// Consolidated from SkeletonList.tsx
export const SkeletonListItem: React.FC<{
  showAvatar?: boolean;
  showBadges?: boolean;
}> = ({ showAvatar = false, showBadges = false }) => {
  return (
    <View style={listStyles.card}>
      <View style={listStyles.header}>
        {showAvatar && <Skeleton height={42} width={42} radius={21} style={listStyles.avatar} />}
        <View style={listStyles.content}>
          <Skeleton height={16} width="70%" style={listStyles.marginBottom} />
          <Skeleton height={14} width="50%" />
        </View>
      </View>
      {showBadges && (
        <View style={listStyles.badges}>
          <Skeleton height={24} width={80} radius={12} />
          <Skeleton height={24} width={80} radius={12} />
          <Skeleton height={24} width={80} radius={12} />
        </View>
      )}
    </View>
  );
};

export const SkeletonList: React.FC<{ count?: number; showAvatar?: boolean; showBadges?: boolean; style?: any }> = ({
  count = 5,
  showAvatar = false,
  showBadges = false,
  style,
}) => {
  return (
    <View style={[listStyles.container, style]}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonListItem key={index} showAvatar={showAvatar} showBadges={showBadges} />
      ))}
    </View>
  );
};

export const SkeletonProductCard: React.FC = () => {
  return (
    <View style={listStyles.productCard}>
      <Skeleton height={140} width="100%" radius={12} style={listStyles.marginBottom} />
      <Skeleton height={12} width="60%" style={listStyles.marginBottom} />
      <Skeleton height={16} width="90%" style={listStyles.marginBottom} />
      <Skeleton height={14} width="40%" style={listStyles.marginBottom} />
      <View style={listStyles.productFooter}>
        <Skeleton height={20} width={60} />
        <Skeleton height={32} width={32} radius={16} />
      </View>
    </View>
  );
};

export const SkeletonProductGrid: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <View style={listStyles.productGrid}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={listStyles.productCardWrapper}>
          <SkeletonProductCard />
        </View>
      ))}
    </View>
  );
};

const listStyles = StyleSheet.create({
  container: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  avatar: { marginRight: theme.spacing.md },
  content: { flex: 1 },
  marginBottom: { marginBottom: theme.spacing.sm },
  badges: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  productCard: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, padding: theme.spacing.sm },
  productFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
  productCardWrapper: { width: '50%', paddingHorizontal: 6, marginBottom: theme.spacing.md },
});
