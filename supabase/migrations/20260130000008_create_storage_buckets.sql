-- Migration: Create storage buckets and policies
-- Applied: 2026-01-30
-- Purpose: Create product-images bucket and add policies for storage buckets

-- Create product-images bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images', 
  'product-images', 
  true, 
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for product-images bucket
-- Public read access
CREATE POLICY IF NOT EXISTS "product_images_public_read" ON storage.objects
FOR SELECT USING (bucket_id = 'product-images');

-- Admin can upload/update/delete
CREATE POLICY IF NOT EXISTS "product_images_admin_all" ON storage.objects
FOR ALL USING (
  bucket_id = 'product-images' 
  AND EXISTS (SELECT 1 FROM public.users WHERE id = (select auth.uid()) AND role = 'admin')
)
WITH CHECK (
  bucket_id = 'product-images' 
  AND EXISTS (SELECT 1 FROM public.users WHERE id = (select auth.uid()) AND role = 'admin')
);

-- RLS policies for support-attachments bucket
-- Public read access (since bucket is public)
CREATE POLICY IF NOT EXISTS "support_attachments_public_read" ON storage.objects
FOR SELECT USING (bucket_id = 'support-attachments');

-- Authenticated users can upload their own attachments
CREATE POLICY IF NOT EXISTS "support_attachments_user_insert" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'support-attachments' 
  AND (select auth.uid()) IS NOT NULL
);

-- Admin can delete any attachment
CREATE POLICY IF NOT EXISTS "support_attachments_admin_delete" ON storage.objects
FOR DELETE USING (
  bucket_id = 'support-attachments' 
  AND EXISTS (SELECT 1 FROM public.users WHERE id = (select auth.uid()) AND role = 'admin')
);
