import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useNavigation } from '@react-navigation/native';
import { NotificationService, NotificationType } from '../services/notifications/notificationService';
import { useAuthStore } from '../store/authStore';

/**
 * Hook to manage push notifications throughout the app
 * Should be used in the root App component
 */
export function useNotifications() {
  const { user, isAuthenticated } = useAuthStore();
  const navigation = useNavigation();
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  // Register for push notifications when user logs in
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      registerNotifications();
    }
    
    return () => {
      // Clean up listeners
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [isAuthenticated, user?.id]);

  const registerNotifications = async () => {
    try {
      const token = await NotificationService.registerForPushNotifications();
      
      if (token && user?.id) {
        await NotificationService.savePushToken(user.id, token);
      }

      // Listen for notifications received while app is foregrounded
      notificationListener.current = NotificationService.addNotificationReceivedListener(
        (notification) => {
          console.log('Notification received:', notification);
          // Could update badge count or show in-app notification here
        }
      );

      // Listen for user tapping on notification
      responseListener.current = NotificationService.addNotificationResponseListener(
        (response) => {
          handleNotificationTap(response);
        }
      );
    } catch (error) {
      console.error('Error registering for notifications:', error);
    }
  };

  const handleNotificationTap = useCallback((response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data as {
      type?: NotificationType;
      screen?: string;
      [key: string]: unknown;
    };

    console.log('Notification tapped:', data);

    // Navigate based on notification type/screen
    const screen = data?.screen;
    if (screen && navigation) {
      try {
        // @ts-ignore - dynamic navigation
        navigation.navigate(screen, data);
      } catch (error) {
        console.error('Error navigating from notification:', error);
      }
    }
  }, [navigation]);

  // Handle app state changes (for badge management)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to foreground - could refresh notification count
        NotificationService.setBadgeCount(0);
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return {
    registerNotifications,
  };
}

/**
 * Hook for checking and requesting notification permissions
 */
export function useNotificationPermissions() {
  const checkPermissions = async (): Promise<boolean> => {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  };

  const requestPermissions = async (): Promise<boolean> => {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  };

  return {
    checkPermissions,
    requestPermissions,
  };
}
