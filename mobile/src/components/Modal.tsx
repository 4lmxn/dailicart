// Reusable Modal component that handles common patterns
// Reduces ~50 lines per modal instance across screens
import React from 'react';
import {
  Modal as RNModal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme';

interface BottomSheetModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Makes content scrollable with max height */
  scrollable?: boolean;
  /** Custom max height as percentage (default: 90) */
  maxHeightPercent?: number;
  /** Show apply/confirm button at bottom */
  applyButton?: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
  };
}

export function BottomSheetModal({
  visible,
  onClose,
  title,
  children,
  scrollable = false,
  maxHeightPercent = 90,
  applyButton,
}: BottomSheetModalProps) {
  const insets = useSafeAreaInsets();
  const maxHeight = `${maxHeightPercent}%` as const;
  
  const content = (
    <View style={[styles.content, { maxHeight, paddingBottom: Math.max(insets.bottom, 24) }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
      </View>
      
      {/* Body */}
      {scrollable ? (
        <ScrollView 
          style={styles.scrollView} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
          {/* Spacer for apply button */}
          {applyButton && <View style={{ height: 80 }} />}
        </ScrollView>
      ) : (
        <View style={styles.body}>{children}</View>
      )}
      
      {/* Apply Button */}
      {applyButton && (
        <View style={styles.applyButtonContainer}>
          <TouchableOpacity
            style={[
              styles.applyButton,
              applyButton.disabled && styles.applyButtonDisabled,
            ]}
            onPress={applyButton.onPress}
            disabled={applyButton.disabled || applyButton.loading}
          >
            <Text style={styles.applyButtonText}>
              {applyButton.loading ? 'Loading...' : applyButton.label}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <RNModal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <TouchableOpacity 
          style={styles.backdrop} 
          activeOpacity={1} 
          onPress={onClose}
        />
        {content}
      </KeyboardAvoidingView>
    </RNModal>
  );
}

// ─────────────────────────────────────────────────────
// MODAL HELPER COMPONENTS
// ─────────────────────────────────────────────────────

interface ModalSectionProps {
  label?: string;
  children: React.ReactNode;
}

export function ModalSection({ label, children }: ModalSectionProps) {
  return (
    <View style={styles.section}>
      {label && <Text style={styles.label}>{label}</Text>}
      {children}
    </View>
  );
}

interface ModalDescriptionProps {
  children: React.ReactNode;
}

export function ModalDescription({ children }: ModalDescriptionProps) {
  return <Text style={styles.description}>{children}</Text>;
}

interface ModalNoteProps {
  children: React.ReactNode;
  type?: 'info' | 'warning' | 'success';
}

export function ModalNote({ children, type = 'info' }: ModalNoteProps) {
  const bgColor = type === 'warning' 
    ? theme.colors.warning + '20'
    : type === 'success'
    ? theme.colors.success + '20'
    : theme.colors.primary + '10';
  
  return (
    <View style={[styles.note, { backgroundColor: bgColor }]}>
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  content: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  closeButton: {
    fontSize: 24,
    color: theme.colors.textSecondary,
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  body: {
    flexGrow: 1,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 10,
  },
  description: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    marginBottom: 20,
    lineHeight: 22,
  },
  note: {
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    marginBottom: 8,
  },
  noteText: {
    fontSize: 13,
    color: theme.colors.text,
    lineHeight: 20,
  },
  applyButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  applyButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  applyButtonDisabled: {
    backgroundColor: theme.colors.gray[300],
  },
});
