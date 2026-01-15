import React, { createContext, useContext, useCallback, useState, useEffect } from 'react';
import { Animated, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../theme';

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
  duration?: number; // ms
}

interface ToastContextValue {
  show: (text: string, options?: { type?: ToastMessage['type']; duration?: number }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const show = useCallback((text: string, options?: { type?: ToastMessage['type']; duration?: number }) => {
    const msg: ToastMessage = {
      id: Math.random().toString(36).slice(2),
      text,
      type: options?.type || 'info',
      duration: options?.duration ?? 3500,
    };
    setMessages(prev => [...prev, msg]);
  }, []);

  const remove = useCallback((id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <View pointerEvents="none" style={styles.container}>
        {messages.map(m => (
          <ToastItem key={m.id} message={m} onDone={remove} />
        ))}
      </View>
    </ToastContext.Provider>
  );
};

const ToastItem: React.FC<{ message: ToastMessage; onDone: (id: string) => void }> = ({ message, onDone }) => {
  const opacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => onDone(message.id));
    }, message.duration);
    return () => clearTimeout(timer);
  }, [message, onDone, opacity]);

  const background =
    message.type === 'success'
      ? '#2E7D32'
      : message.type === 'error'
      ? '#C62828'
      : '#37474F';

  return (
    <Animated.View style={[styles.toast, { opacity, backgroundColor: background }]}>
      <Text style={styles.text}>{message.text}</Text>
      <TouchableOpacity
        onPress={() => onDone(message.id)}
        style={styles.closeBtn}
        activeOpacity={0.7}
      >
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 12,
    maxWidth: '92%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 6,
  },
  text: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  closeBtn: {
    marginLeft: 12,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  closeText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default ToastProvider;
