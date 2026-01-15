import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { theme } from '../theme';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console
    console.error('❌ Error Boundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    // TODO: Send to error tracking service (Sentry, Crashlytics, etc.)
    // Example: Sentry.captureException(error, { contexts: { react: errorInfo } });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <ScrollView 
            style={styles.scrollView} 
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {/* Error Icon */}
            <Text style={styles.errorIcon}>😕</Text>

            {/* Error Message */}
            <Text style={styles.errorTitle}>Oops! Something went wrong</Text>
            <Text style={styles.errorMessage}>
              We're sorry for the inconvenience. The app has encountered an unexpected error.
            </Text>

            {/* Retry Button */}
            <TouchableOpacity
              style={styles.retryButton}
              onPress={this.handleReset}
              activeOpacity={0.8}
            >
              <Text style={styles.retryButtonText}>🔄 Try Again</Text>
            </TouchableOpacity>

            {/* Development Error Details */}
            {__DEV__ && this.state.error && (
              <View style={styles.devDetails}>
                <Text style={styles.devTitle}>🔧 Development Details:</Text>
                
                <View style={styles.errorDetailsCard}>
                  <Text style={styles.errorDetailsLabel}>Error:</Text>
                  <Text style={styles.errorDetailsText}>
                    {this.state.error.toString()}
                  </Text>
                </View>

                {this.state.errorInfo && (
                  <View style={styles.errorDetailsCard}>
                    <Text style={styles.errorDetailsLabel}>Component Stack:</Text>
                    <ScrollView 
                      style={styles.stackScrollView}
                      nestedScrollEnabled
                    >
                      <Text style={styles.errorDetailsText}>
                        {this.state.errorInfo.componentStack}
                      </Text>
                    </ScrollView>
                  </View>
                )}

                {this.state.error.stack && (
                  <View style={styles.errorDetailsCard}>
                    <Text style={styles.errorDetailsLabel}>Stack Trace:</Text>
                    <ScrollView 
                      style={styles.stackScrollView}
                      nestedScrollEnabled
                    >
                      <Text style={styles.errorDetailsText}>
                        {this.state.error.stack}
                      </Text>
                    </ScrollView>
                  </View>
                )}
              </View>
            )}

            {/* Support Message */}
            <Text style={styles.supportText}>
              If the problem persists, please contact our support team.
            </Text>
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    paddingTop: 60,
  },
  errorIcon: {
    fontSize: 80,
    marginBottom: 24,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 24,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  supportText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 16,
  },
  // Development Details Styles
  devDetails: {
    width: '100%',
    marginTop: 32,
    padding: 16,
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFA500',
    borderStyle: 'dashed',
  },
  devTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF6B00',
    marginBottom: 16,
  },
  errorDetailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorDetailsLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  errorDetailsText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  stackScrollView: {
    maxHeight: 200,
  },
});
