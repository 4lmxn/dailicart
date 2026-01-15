import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../theme';

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  type?: 'error' | 'warning' | 'info';
  style?: any;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  message,
  onRetry,
  type = 'error',
  style,
}) => {
  const getIcon = () => {
    switch (type) {
      case 'error':
        return '⚠️';
      case 'warning':
        return '⚡';
      case 'info':
        return 'ℹ️';
      default:
        return '⚠️';
    }
  };

  const getBackgroundColor = () => {
    switch (type) {
      case 'error':
        return '#FFEBEE';
      case 'warning':
        return '#FFF3E0';
      case 'info':
        return '#E3F2FD';
      default:
        return '#FFEBEE';
    }
  };

  const getBorderColor = () => {
    switch (type) {
      case 'error':
        return theme.colors.error;
      case 'warning':
        return theme.colors.warning;
      case 'info':
        return theme.colors.info;
      default:
        return theme.colors.error;
    }
  };

  const getTextColor = () => {
    switch (type) {
      case 'error':
        return '#C62828';
      case 'warning':
        return '#E65100';
      case 'info':
        return '#1565C0';
      default:
        return '#C62828';
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: getBackgroundColor(),
          borderLeftColor: getBorderColor(),
        },
        style,
      ]}
    >
      <Text style={styles.icon}>{getIcon()}</Text>
      <View style={styles.content}>
        <Text style={[styles.message, { color: getTextColor() }]}>{message}</Text>
        {onRetry && (
          <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.7}>
            <Text style={[styles.retryButtonText, { color: getBorderColor() }]}>
              🔄 Try Again
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderLeftWidth: 4,
    marginHorizontal: theme.spacing.md,
    marginVertical: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  icon: {
    fontSize: 24,
    marginRight: theme.spacing.md,
  },
  content: {
    flex: 1,
  },
  message: {
    ...theme.typography.body,
    lineHeight: 22,
    marginBottom: theme.spacing.sm,
  },
  retryButton: {
    alignSelf: 'flex-start',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    marginTop: theme.spacing.xs,
  },
  retryButtonText: {
    ...theme.typography.caption,
    fontWeight: '600',
  },
});
