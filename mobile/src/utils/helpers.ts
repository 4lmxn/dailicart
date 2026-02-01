/**
 * Format currency (Indian Rupees)
 */
export const formatCurrency = (amount: number | undefined): string => {
  try {
    if (amount === undefined || amount === null) {
      return '₹0.00';
    }
    return `₹${amount.toFixed(2)}`;
  } catch (error) {
    console.error('[formatCurrency Error]', error);
    return '₹0.00';
  }
};

/**
 * Get local date string in YYYY-MM-DD format
 * IMPORTANT: Do NOT use new Date().toISOString().split('T')[0] as it returns UTC date!
 * This function returns the LOCAL date which is correct for India timezone.
 */
export const getLocalDateString = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Get date string for N days ago/ahead in local timezone
 */
export const getLocalDateOffsetString = (daysOffset: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return getLocalDateString(date);
};

/**
 * Format quantity with unit for display
 * e.g., quantity=2, unit="1 Litre" → "2 × 1 Litre"
 * e.g., quantity=1, unit="400g Pack" → "400g Pack"
 */
export const formatQuantity = (quantity: number, unit?: string): string => {
  if (!unit) return `${quantity}`;

  // If quantity is 1, just show the unit
  if (quantity === 1) {
    return unit;
  }

  // For quantity > 1, show "2 × 1 Litre" format
  return `${quantity} × ${unit}`;
};

/**
 * Format phone number
 */
export const formatPhone = (phone: string): string => {
  try {
    // Remove any non-digit characters
    const cleaned = phone.replace(/\D/g, '');

    // Format as +91 XXXXX XXXXX
    if (cleaned.length === 10) {
      return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
    }

    if (cleaned.length === 12 && cleaned.startsWith('91')) {
      return `+${cleaned.slice(0, 2)} ${cleaned.slice(2, 7)} ${cleaned.slice(7)}`;
    }

    return phone;
  } catch (error) {
    console.error('[formatPhone Error]', error);
    return phone;
  }
};

/**
 * Validate phone number
 */
export const isValidPhone = (phone: string): boolean => {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned);
};

/**
 * Validate email
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Truncate text
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
};

/**
 * Get time-based greeting
 */
export const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
};

/**
 * Capitalize first letter
 */
export const capitalize = (text: string): string => {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

/**
 * Parse error message
 */
export const parseErrorMessage = (error: any): string => {
  if (typeof error === 'string') return error;
  if (error?.message) return error.message;
  if (error?.error) return error.error;
  return 'Something went wrong. Please try again.';
};

/**
 * Debounce function
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

/**
 * Generate random ID
 */
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Address helpers for society/wing/floor/flat identity
export type SocietyAddress = {
  society: string;
  wing?: string;
  building?: string; // optional alias if wing not used
  floor?: string;
  flat?: string;
};

export const formatSocietyAddress = (addr: Partial<SocietyAddress> | null | undefined): string => {
  if (!addr) return '';
  const parts: string[] = [];
  if (addr.society) parts.push(addr.society);
  const segment: string[] = [];
  if (addr.wing) segment.push(`Wing ${addr.wing}`);
  if (addr.building) segment.push(`Bldg ${addr.building}`);
  if (addr.floor) segment.push(`Floor ${addr.floor}`);
  if (addr.flat) segment.push(`Flat ${addr.flat}`);
  if (segment.length) parts.push(segment.join(', '));
  return parts.join(', ');
};

export const parseAddressJson = (raw: string | null | undefined): Partial<SocietyAddress> | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed as Partial<SocietyAddress>;
  } catch {
    return null;
  }
};

// ============================================================================
// CDN / Image Helpers
// ============================================================================

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

const cdnBase = SUPABASE_URL
  ? `${SUPABASE_URL}/storage/v1/object/public`
  : '';

/**
 * CDN helpers for Supabase Storage public URLs
 */
export const cdn = {
  product: (productId: string, file: string = 'main.jpg') =>
    `${cdnBase}/product-images/products/${productId}/${file}`,
  productThumb: (productId: string) =>
    `${cdnBase}/product-images/products/${productId}/thumb.jpg`,
  brand: (brandId: string, file: string = 'logo.png') =>
    `${cdnBase}/product-images/brands/${brandId}/${file}`,
};

// ============================================================================
// Product Helpers
// ============================================================================

/**
 * Get product-appropriate emoji based on category and name
 * Used across product cards and subscription screens
 */
export const getProductEmoji = (category: string, name: string): string => {
  const c = category?.toLowerCase() || '';
  const n = name?.toLowerCase() || '';
  
  // Milk products
  if (c === 'milk' || n.includes('milk')) return '🥛';
  
  // Dairy products
  if (n.includes('curd') || n.includes('yogurt') || n.includes('dahi')) return '🥄';
  if (n.includes('paneer') || n.includes('cheese')) return '🧀';
  if (n.includes('butter')) return '🧈';
  if (n.includes('ghee')) return '🫙';
  
  // Eggs
  if (c === 'eggs' || n.includes('egg')) return '🥚';
  
  // Bread & Bakery
  if (c === 'bakery' || n.includes('bread') || n.includes('pav')) return '🍞';
  if (n.includes('croissant') || n.includes('bun')) return '🥐';
  
  // Ready to cook
  if (n.includes('batter') || n.includes('dosa') || n.includes('idli')) return '🍛';
  if (n.includes('dough') || n.includes('chapati') || n.includes('roti')) return '🫓';
  
  // Beverages
  if (c === 'beverages' || n.includes('buttermilk') || n.includes('lassi')) return '🥤';
  if (n.includes('coffee')) return '☕';
  if (n.includes('juice')) return '🧃';
  
  // Essentials
  if (n.includes('newspaper')) return '📰';
  if (n.includes('flower')) return '💐';
  
  // Default
  return '📦';
};
