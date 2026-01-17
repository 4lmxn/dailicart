import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const OfflineBar: React.FC = () => {
  const [isOffline, setIsOffline] = useState(false);
  const [slideAnim] = useState(new Animated.Value(-40));
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // Note: @react-native-community/netinfo needs to be installed
    // For now, using a simple implementation
    // TODO: Install and configure @react-native-community/netinfo
    
    // Placeholder implementation - checks navigator.onLine if available
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      setIsOffline(!navigator.onLine);

      const handleOnline = () => setIsOffline(false);
      const handleOffline = () => setIsOffline(true);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  useEffect(() => {
    if (isOffline) {
      // Slide down
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 40,
        friction: 6,
      }).start();
    } else {
      // Slide up
      Animated.timing(slideAnim, {
        toValue: -40,
        duration: 240,
        useNativeDriver: true,
      }).start();
    }
  }, [isOffline]);

  return (
    <Animated.View
      style={[
        styles.container,
        { paddingTop: insets.top + 4 },
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.content}>
        <Text style={styles.icon}>📡</Text>
        <Text style={styles.text}>Offline</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: '#FF6B6B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  icon: {
    fontSize: 14,
    marginRight: 6,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
