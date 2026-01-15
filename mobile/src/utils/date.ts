import { format, parseISO, isValid } from 'date-fns';
import { DATE_FORMAT, TIME_FORMAT, DATETIME_FORMAT } from '../constants';

/**
 * Format date to string
 */
export const formatDate = (date: string | Date, formatStr: string = DATE_FORMAT): string => {
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    if (!isValid(dateObj)) return '-';
    return format(dateObj, formatStr);
  } catch (error) {
    console.error('[formatDate Error]', error);
    return '-';
  }
};

/**
 * Format time to string
 */
export const formatTime = (date: string | Date): string => {
  return formatDate(date, TIME_FORMAT);
};

/**
 * Format datetime to string
 */
export const formatDateTime = (date: string | Date): string => {
  return formatDate(date, DATETIME_FORMAT);
};

/**
 * Get relative time (Today, Yesterday, etc.)
 */
export const getRelativeTime = (date: string | Date): string => {
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    const now = new Date();
    const diffInMs = now.getTime() - dateObj.getTime();
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays} days ago`;
    
    return formatDate(date);
  } catch (error) {
    console.error('[getRelativeTime Error]', error);
    return '-';
  }
};

/**
 * Check if date is today
 */
export const isToday = (date: string | Date): boolean => {
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    const today = new Date();
    return (
      dateObj.getDate() === today.getDate() &&
      dateObj.getMonth() === today.getMonth() &&
      dateObj.getFullYear() === today.getFullYear()
    );
  } catch (error) {
    return false;
  }
};
