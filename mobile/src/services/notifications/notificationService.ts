import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from '../supabase';
import Constants from 'expo-constants';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type NotificationType = 
  | 'delivery_arriving'
  | 'delivery_completed'
  | 'delivery_missed'
  | 'low_balance'
  | 'payment_success'
  | 'payment_failed'
  | 'subscription_paused'
  | 'subscription_resumed'
  | 'order_created'
  | 'support_reply';

interface NotificationData {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export class NotificationService {
  private static expoPushToken: string | null = null;

  /**
   * Register for push notifications and get the Expo push token
   */
  static async registerForPushNotifications(): Promise<string | null> {
    // Only works on physical devices
    if (!Device.isDevice) {
      console.log('Push notifications require a physical device');
      return null;
    }

    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permission if not already granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission not granted');
      return null;
    }

    // Get the Expo push token
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: projectId,
      });
      
      this.expoPushToken = token.data;
      console.log('Expo push token:', this.expoPushToken);
      
      // Configure Android channel
      if (Platform.OS === 'android') {
        await this.setupAndroidChannels();
      }

      return this.expoPushToken;
    } catch (error) {
      console.error('Error getting push token:', error);
      return null;
    }
  }

  /**
   * Setup Android notification channels
   */
  private static async setupAndroidChannels() {
    // Delivery notifications - high priority
    await Notifications.setNotificationChannelAsync('deliveries', {
      name: 'Deliveries',
      description: 'Notifications about your milk deliveries',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0D9488',
      sound: 'default',
    });

    // Payment notifications
    await Notifications.setNotificationChannelAsync('payments', {
      name: 'Payments',
      description: 'Payment and wallet notifications',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });

    // Subscription notifications
    await Notifications.setNotificationChannelAsync('subscriptions', {
      name: 'Subscriptions',
      description: 'Subscription status updates',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    });

    // Support notifications
    await Notifications.setNotificationChannelAsync('support', {
      name: 'Support',
      description: 'Support ticket updates',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    });
  }

  /**
   * Save push token to database for the user
   */
  static async savePushToken(userId: string, token?: string): Promise<boolean> {
    const pushToken = token || this.expoPushToken;
    if (!pushToken) {
      console.log('No push token available');
      return false;
    }

    try {
      const { error } = await supabase
        .from('users')
        .update({ 
          push_token: pushToken,
          push_token_updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error saving push token:', error);
      return false;
    }
  }

  /**
   * Remove push token (on logout)
   */
  static async removePushToken(userId: string): Promise<void> {
    try {
      await supabase
        .from('users')
        .update({ 
          push_token: null,
          push_token_updated_at: new Date().toISOString(),
        })
        .eq('id', userId);
    } catch (error) {
      console.error('Error removing push token:', error);
    }
  }

  /**
   * Schedule a local notification
   */
  static async scheduleLocalNotification(
    notification: NotificationData,
    trigger?: Notifications.NotificationTriggerInput
  ): Promise<string | null> {
    try {
      const channelId = this.getChannelForType(notification.type);
      
      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: {
            type: notification.type,
            ...notification.data,
          },
          sound: 'default',
          ...(Platform.OS === 'android' && { channelId }),
        },
        trigger: trigger || null, // null = immediate
      });

      return identifier;
    } catch (error) {
      console.error('Error scheduling notification:', error);
      return null;
    }
  }

  /**
   * Show immediate notification
   */
  static async showNotification(notification: NotificationData): Promise<void> {
    await this.scheduleLocalNotification(notification, null);
  }

  /**
   * Get the appropriate Android channel for notification type
   */
  private static getChannelForType(type: NotificationType): string {
    switch (type) {
      case 'delivery_arriving':
      case 'delivery_completed':
      case 'delivery_missed':
        return 'deliveries';
      case 'low_balance':
      case 'payment_success':
      case 'payment_failed':
        return 'payments';
      case 'subscription_paused':
      case 'subscription_resumed':
      case 'order_created':
        return 'subscriptions';
      case 'support_reply':
        return 'support';
      default:
        return 'default';
    }
  }

  /**
   * Add notification response listener (for handling taps)
   */
  static addNotificationResponseListener(
    handler: (response: Notifications.NotificationResponse) => void
  ): Notifications.Subscription {
    return Notifications.addNotificationResponseReceivedListener(handler);
  }

  /**
   * Add notification received listener (for foreground notifications)
   */
  static addNotificationReceivedListener(
    handler: (notification: Notifications.Notification) => void
  ): Notifications.Subscription {
    return Notifications.addNotificationReceivedListener(handler);
  }

  /**
   * Cancel all scheduled notifications
   */
  static async cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  /**
   * Get badge count
   */
  static async getBadgeCount(): Promise<number> {
    return await Notifications.getBadgeCountAsync();
  }

  /**
   * Set badge count
   */
  static async setBadgeCount(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
  }

  // ============================================
  // CONVENIENCE METHODS FOR SPECIFIC NOTIFICATIONS
  // ============================================

  static async notifyDeliveryArriving(productName: string, quantity: number): Promise<void> {
    await this.showNotification({
      type: 'delivery_arriving',
      title: '🚚 Delivery On The Way!',
      body: `Your ${quantity}x ${productName} is being delivered now`,
      data: { screen: 'CustomerHome' },
    });
  }

  static async notifyDeliveryCompleted(productName: string, quantity: number): Promise<void> {
    await this.showNotification({
      type: 'delivery_completed',
      title: '✅ Delivery Complete',
      body: `${quantity}x ${productName} has been delivered`,
      data: { screen: 'OrderHistory' },
    });
  }

  static async notifyDeliveryMissed(reason?: string): Promise<void> {
    await this.showNotification({
      type: 'delivery_missed',
      title: '❌ Delivery Missed',
      body: reason || 'Your delivery could not be completed today',
      data: { screen: 'Support' },
    });
  }

  static async notifyLowBalance(currentBalance: number, minimumRequired: number): Promise<void> {
    await this.showNotification({
      type: 'low_balance',
      title: '⚠️ Low Wallet Balance',
      body: `Balance ₹${currentBalance.toFixed(0)} is below minimum ₹${minimumRequired}. Recharge to avoid subscription pause.`,
      data: { screen: 'Wallet' },
    });
  }

  static async notifyPaymentSuccess(amount: number, newBalance: number): Promise<void> {
    await this.showNotification({
      type: 'payment_success',
      title: '💰 Payment Successful',
      body: `₹${amount} added to wallet. New balance: ₹${newBalance.toFixed(0)}`,
      data: { screen: 'Wallet' },
    });
  }

  static async notifySubscriptionPaused(reason: string): Promise<void> {
    await this.showNotification({
      type: 'subscription_paused',
      title: '⏸️ Subscription Paused',
      body: reason,
      data: { screen: 'MySubscriptions' },
    });
  }

  static async notifySubscriptionResumed(): Promise<void> {
    await this.showNotification({
      type: 'subscription_resumed',
      title: '▶️ Subscription Resumed',
      body: 'Your subscriptions are now active again!',
      data: { screen: 'MySubscriptions' },
    });
  }

  static async notifySupportReply(ticketNumber: string): Promise<void> {
    await this.showNotification({
      type: 'support_reply',
      title: '💬 Support Update',
      body: `New reply on ticket ${ticketNumber}`,
      data: { screen: 'Support' },
    });
  }
}
