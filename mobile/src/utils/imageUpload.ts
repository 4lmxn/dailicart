import { supabase } from '../services/supabase';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

export interface UploadResult {
  url: string;
  path: string;
  size: number;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

/**
 * Upload product image to Supabase Storage
 * Automatically optimizes image before upload
 */
export async function uploadProductImage(
  uri: string,
  fileName: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  try {
    // Step 1: Optimize image
    const optimizedImage = await optimizeImage(uri);

    // Step 2: Generate unique filename
    const timestamp = Date.now();
    const sanitizedName = fileName
      .replace(/[^a-zA-Z0-9.-]/g, '-')
      .toLowerCase();
    const uniqueFileName = `products/${timestamp}-${sanitizedName}`;

    // Step 3: Read file as base64
    const base64 = await FileSystem.readAsStringAsync(optimizedImage.uri, {
      encoding: 'base64' as any,
    });

    // Step 4: Convert base64 to blob
    const blob = base64ToBlob(base64, 'image/jpeg');

    // Step 5: Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(uniqueFileName, blob, {
        contentType: 'image/jpeg',
        cacheControl: '31536000', // 1 year cache
        upsert: false,
      });

    if (error) throw error;

    // Step 6: Get public URL
    const { data: urlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(data.path);

    // Step 7: Get file info
    const fileInfo = await FileSystem.getInfoAsync(optimizedImage.uri);

    return {
      url: urlData.publicUrl,
      path: data.path,
      size: fileInfo.exists ? fileInfo.size || 0 : 0,
    };
  } catch (error) {
    console.error('Upload error:', error);
    throw new Error('Failed to upload image');
  }
}

/**
 * Delete image from Supabase Storage
 */
export async function deleteProductImage(path: string): Promise<void> {
  try {
    const { error } = await supabase.storage
      .from('product-images')
      .remove([path]);

    if (error) throw error;
  } catch (error) {
    console.error('Delete error:', error);
    throw new Error('Failed to delete image');
  }
}

/**
 * Update product image (delete old, upload new)
 */
export async function updateProductImage(
  oldPath: string,
  newUri: string,
  fileName: string
): Promise<UploadResult> {
  try {
    // Delete old image first
    await deleteProductImage(oldPath);

    // Upload new image
    return await uploadProductImage(newUri, fileName);
  } catch (error) {
    console.error('Update error:', error);
    throw new Error('Failed to update image');
  }
}

/**
 * Optimize image for upload
 * - Resize to 800x800
 * - Compress to JPEG
 * - Target quality: 85%
 */
async function optimizeImage(uri: string): Promise<{ uri: string }> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [
        {
          resize: {
            width: 800,
            height: 800,
          },
        },
      ],
      {
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    return result;
  } catch (error) {
    console.error('Optimization error:', error);
    // If optimization fails, return original
    return { uri };
  }
}

/**
 * Convert base64 string to Blob
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);

    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }

  return new Blob(byteArrays, { type: mimeType });
}

/**
 * Get image dimensions
 */
export async function getImageDimensions(
  uri: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.width, height: image.height });
    };
    image.onerror = reject;
    image.src = uri;
  });
}

/**
 * Validate image file
 */
export async function validateImageFile(uri: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);

    if (!fileInfo.exists) {
      return { valid: false, error: 'File does not exist' };
    }

    // Check file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (fileInfo.size && fileInfo.size > maxSize) {
      return {
        valid: false,
        error: `File too large. Max size: ${maxSize / (1024 * 1024)}MB`,
      };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Failed to validate file' };
  }
}

/**
 * Get storage bucket info
 */
export async function getBucketInfo(): Promise<{
  size: number;
  fileCount: number;
}> {
  try {
    const { data, error } = await supabase.storage
      .from('product-images')
      .list('products', {
        limit: 1000,
      });

    if (error) throw error;

    const size = data.reduce((acc, file) => acc + (file.metadata?.size || 0), 0);

    return {
      size,
      fileCount: data.length,
    };
  } catch (error) {
    console.error('Bucket info error:', error);
    return { size: 0, fileCount: 0 };
  }
}

/**
 * Batch upload multiple images
 */
export async function batchUploadImages(
  images: Array<{ uri: string; fileName: string }>,
  onProgress?: (completed: number, total: number) => void
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];
  let completed = 0;

  for (const image of images) {
    try {
      const result = await uploadProductImage(image.uri, image.fileName);
      results.push(result);
      completed++;
      onProgress?.(completed, images.length);
    } catch (error) {
      console.error(`Failed to upload ${image.fileName}:`, error);
      // Continue with next image
    }
  }

  return results;
}

/**
 * Save main product image at deterministic path: products/<productId>/main.jpg
 * Uses upsert to overwrite existing image and sets long cache headers.
 */
export async function saveProductMainImage(
  productId: string,
  uri: string
): Promise<UploadResult> {
  return uploadToDeterministicPath(productId, uri, 'main');
}

/**
 * Save thumbnail image at deterministic path: products/<productId>/thumb.jpg
 * Resizes for thumbnail and upserts.
 */
export async function saveProductThumbImage(
  productId: string,
  uri: string
): Promise<UploadResult> {
  return uploadToDeterministicPath(productId, uri, 'thumb');
}

async function uploadToDeterministicPath(
  productId: string,
  uri: string,
  kind: 'main' | 'thumb'
): Promise<UploadResult> {
  try {
    const optimized =
      kind === 'thumb' ? await optimizeThumbImage(uri) : await optimizeImage(uri);

    const base64 = await FileSystem.readAsStringAsync(optimized.uri, {
      encoding: 'base64' as any,
    });
    const blob = base64ToBlob(base64, 'image/jpeg');

    const path = `products/${productId}/${kind === 'thumb' ? 'thumb.jpg' : 'main.jpg'}`;

    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(path, blob, {
        contentType: 'image/jpeg',
        cacheControl: '31536000',
        upsert: true,
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(path);

    const fileInfo = await FileSystem.getInfoAsync(optimized.uri);

    return {
      url: urlData.publicUrl,
      path: data?.path || path,
      size: fileInfo.exists ? fileInfo.size || 0 : 0,
    };
  } catch (error) {
    console.error('Deterministic upload error:', error);
    throw new Error('Failed to upload image to deterministic path');
  }
}

// Create a smaller thumbnail variant
async function optimizeThumbImage(uri: string): Promise<{ uri: string }> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [
        {
          resize: {
            width: 300,
            height: 300,
          },
        },
      ],
      {
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    return result;
  } catch (error) {
    console.error('Thumb optimization error:', error);
    return { uri };
  }
}

/**
 * Upload support ticket attachment
 * Optimizes and uploads image to support-attachments bucket
 */
export async function uploadTicketAttachment(
  uri: string,
  fileName: string,
  ticketId: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  try {
    // Step 1: Optimize image (smaller size for attachments)
    const optimizedImage = await optimizeTicketImage(uri);

    // Step 2: Generate unique filename
    const timestamp = Date.now();
    const sanitizedName = fileName
      .replace(/[^a-zA-Z0-9.-]/g, '-')
      .toLowerCase();
    const uniqueFileName = `tickets/${ticketId}/${timestamp}-${sanitizedName}`;

    // Step 3: Read file as base64
    const base64 = await FileSystem.readAsStringAsync(optimizedImage.uri, {
      encoding: 'base64' as any,
    });

    // Step 4: Convert base64 to blob
    const blob = base64ToBlob(base64, 'image/jpeg');

    // Step 5: Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('support-attachments')
      .upload(uniqueFileName, blob, {
        contentType: 'image/jpeg',
        cacheControl: '31536000',
        upsert: false,
      });

    if (error) throw error;

    // Step 6: Get public URL
    const { data: urlData } = supabase.storage
      .from('support-attachments')
      .getPublicUrl(data.path);

    // Step 7: Get file info
    const fileInfo = await FileSystem.getInfoAsync(optimizedImage.uri);

    return {
      url: urlData.publicUrl,
      path: data.path,
      size: fileInfo.exists ? fileInfo.size || 0 : 0,
    };
  } catch (error) {
    console.error('Upload attachment error:', error);
    throw new Error('Failed to upload attachment');
  }
}

/**
 * Optimize image for support ticket attachment
 * - Resize to max 1200x1200
 * - Compress to JPEG
 * - Target quality: 80%
 */
async function optimizeTicketImage(uri: string): Promise<{ uri: string }> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [
        {
          resize: {
            width: 1200,
            height: 1200,
          },
        },
      ],
      {
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    return result;
  } catch (error) {
    console.error('Ticket image optimization error:', error);
    // If optimization fails, return original
    return { uri };
  }
}

/**
 * Delete support ticket attachment
 */
export async function deleteTicketAttachment(path: string): Promise<void> {
  try {
    const { error } = await supabase.storage
      .from('support-attachments')
      .remove([path]);

    if (error) throw error;
  } catch (error) {
    console.error('Delete attachment error:', error);
    throw new Error('Failed to delete attachment');
  }
}
