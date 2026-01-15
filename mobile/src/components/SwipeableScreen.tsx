import React from 'react';
import { View, StyleSheet, PanResponder, Animated } from 'react-native';

interface SwipeableScreenProps {
  children: React.ReactNode;
  onSwipeRight?: () => void;
  enabled?: boolean;
  swipeThreshold?: number;
}

export const SwipeableScreen: React.FC<SwipeableScreenProps> = ({
  children,
  onSwipeRight,
  enabled = true,
  swipeThreshold = 100,
}) => {
  const translateX = React.useRef(new Animated.Value(0)).current;

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => enabled,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to horizontal swipes from left edge
        return enabled && gestureState.dx > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow positive dx (swipe right)
        if (gestureState.dx > 0) {
          translateX.setValue(gestureState.dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > swipeThreshold && onSwipeRight) {
          // Animate off screen then call onSwipeRight
          Animated.timing(translateX, {
            toValue: 400,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            translateX.setValue(0);
            onSwipeRight();
          });
        } else {
          // Snap back
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 80,
            friction: 8,
          }).start();
        }
      },
    })
  ).current;

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateX }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      {children}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
