import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from './Skeleton';
import { theme } from '../theme';

interface SkeletonListProps {
  count?: number;
  itemHeight?: number;
  showAvatar?: boolean;
  showBadges?: boolean;
  style?: any;
}

export const SkeletonListItem: React.FC<{
  showAvatar?: boolean;
  showBadges?: boolean;
}> = ({ showAvatar = false, showBadges = false }) => {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        {showAvatar && <Skeleton height={42} width={42} radius={21} style={styles.avatar} />}
        <View style={styles.content}>
          <Skeleton height={16} width="70%" style={styles.marginBottom} />
          <Skeleton height={14} width="50%" />
        </View>
      </View>
      {showBadges && (
        <View style={styles.badges}>
          <Skeleton height={24} width={80} radius={12} />
          <Skeleton height={24} width={80} radius={12} />
          <Skeleton height={24} width={80} radius={12} />
        </View>
      )}
    </View>
  );
};

export const SkeletonList: React.FC<SkeletonListProps> = ({
  count = 5,
  showAvatar = false,
  showBadges = false,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonListItem key={index} showAvatar={showAvatar} showBadges={showBadges} />
      ))}
    </View>
  );
};

export const SkeletonProductCard: React.FC = () => {
  return (
    <View style={styles.productCard}>
      <Skeleton height={140} width="100%" radius={12} style={styles.marginBottom} />
      <Skeleton height={12} width="60%" style={styles.marginBottom} />
      <Skeleton height={16} width="90%" style={styles.marginBottom} />
      <Skeleton height={14} width="40%" style={styles.marginBottom} />
      <View style={styles.productFooter}>
        <Skeleton height={20} width={60} />
        <Skeleton height={32} width={32} radius={16} />
      </View>
    </View>
  );
};

export const SkeletonProductGrid: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <View style={styles.productGrid}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.productCardWrapper}>
          <SkeletonProductCard />
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
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
  avatar: {
    marginRight: theme.spacing.md,
  },
  content: {
    flex: 1,
  },
  marginBottom: {
    marginBottom: theme.spacing.sm,
  },
  badges: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  productCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.sm,
  },
  productFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  productCardWrapper: {
    width: '50%',
    paddingHorizontal: 6,
    marginBottom: theme.spacing.md,
  },
});
