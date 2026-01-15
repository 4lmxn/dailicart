import { Platform } from 'react-native';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

// Base path to public storage objects
export const cdnBase = SUPABASE_URL
  ? `${SUPABASE_URL}/storage/v1/object/public`
  : '';

export const cdn = {
  // Product images live under bucket `product-images`
  // Convention: products/{productId}/main.jpg and products/{productId}/thumb.jpg
  product: (productId: string, file: string = 'main.jpg') =>
    `${cdnBase}/product-images/products/${productId}/${file}`,
  productThumb: (productId: string) =>
    `${cdnBase}/product-images/products/${productId}/thumb.jpg`,
  // Optional brand logo helper if needed later
  brand: (brandId: string, file: string = 'logo.png') =>
    `${cdnBase}/product-images/brands/${brandId}/${file}`,
};

export type CDN = typeof cdn;
