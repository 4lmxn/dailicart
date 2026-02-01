import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuthStore } from './src/store/authStore';
import { theme } from './src/theme';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { ToastProvider } from './src/components/Toast';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { AuthService } from './src/services/auth/authService';
import { initSentry, setSentryUser, Sentry } from './src/services/sentry';
import { useNotifications } from './src/hooks/useNotifications';

// Initialize Sentry immediately for crash tracking
initSentry();

function AppContent() {
  const { isLoading, loadUserFromStorage } = useAuthStore();
  // Guard to prevent multiple OAuth exchanges causing 429
  const handledOnceRef = useRef(false);
  
  // Initialize push notifications (registers token when user is logged in)
  useNotifications();

  useEffect(() => {
    loadUserFromStorage();
  }, []);

  // Handle OAuth redirect URLs (e.g., milk://auth/callback?...)
  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url) return;
      if (!url.includes('auth/callback')) return;
      // Prevent multiple exchanges causing 429 from Supabase
      if (handledOnceRef.current) return;
      handledOnceRef.current = true;
      const result = await AuthService.handleOAuthRedirect(url);
      if (result.success && result.user && result.session) {
        // Update store with authenticated user
        await useAuthStore.getState().loginWithSupabase(result.user, result.session);
        // Force a quick refresh of user from storage to flip navigator
        await useAuthStore.getState().loadUserFromStorage();
        // Set Sentry user context (supports phone OTP and Google OAuth)
        setSentryUser({ 
          id: result.user.id, 
          phone: result.user.phone,
          email: result.user.email, 
          role: result.user.role 
        });
      } else {
        // Reset guard if failed, allow retry once
        handledOnceRef.current = false;
      }
    };

    // Initial URL when app is opened via deep-link
    // On web, Supabase handles OAuth and updates session without code exchange
    if (Platform.OS !== 'web') {
      Linking.getInitialURL().then(handleUrl);
    }

    // Listen for in-app URL events
    const sub = Linking.addEventListener('url', (event) => {
      if (Platform.OS !== 'web') handleUrl(event.url);
    });
    return () => sub.remove();
  }, []);

  const content = isLoading ? (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    </View>
  ) : (
    <ErrorBoundary>
      <RootNavigator />
    </ErrorBoundary>
  );

  return (
    <SafeAreaProvider>
      <ToastProvider>
        {content}
      </ToastProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
});

// Wrap with Sentry for crash tracking
export default Sentry.wrap(AppContent);
