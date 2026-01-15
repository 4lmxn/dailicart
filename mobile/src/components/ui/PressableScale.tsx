import React, { useCallback, useRef } from 'react';
import { 
  Animated, 
  Pressable, 
  PressableProps, 
  ViewStyle, 
  StyleProp,
  GestureResponderEvent,
} from 'react-native';

interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  /** Scale factor when pressed (0-1). Default: 0.97 */
  scaleTo?: number;
  /** Animation duration in ms. Default: 100 */
  duration?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * A Pressable component that scales down when pressed for tactile feedback.
 * Use this for buttons, cards, and interactive elements.
 */
export const PressableScale: React.FC<PressableScaleProps> = ({
  scaleTo = 0.97,
  duration = 100,
  style,
  children,
  onPressIn,
  onPressOut,
  disabled,
  ...props
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      Animated.spring(scaleAnim, {
        toValue: scaleTo,
        useNativeDriver: true,
        speed: 50,
        bounciness: 4,
      }).start();
      onPressIn?.(event);
    },
    [scaleTo, onPressIn]
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 50,
        bounciness: 4,
      }).start();
      onPressOut?.(event);
    },
    [onPressOut]
  );

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      {...props}
    >
      <Animated.View
        style={[
          style,
          {
            transform: [{ scale: scaleAnim }],
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
};

/**
 * A card variant with slightly larger scale effect
 */
export const PressableCard: React.FC<PressableScaleProps> = (props) => (
  <PressableScale scaleTo={0.98} duration={150} {...props} />
);

/**
 * A button variant with stronger feedback
 */
export const PressableButton: React.FC<PressableScaleProps> = (props) => (
  <PressableScale scaleTo={0.95} duration={80} {...props} />
);
