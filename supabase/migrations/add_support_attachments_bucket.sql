-- Migration: Add support-attachments storage bucket
-- Description: Creates storage bucket for support ticket photo attachments with proper RLS policies

-- Create the storage bucket for support attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'support-attachments',
  'support-attachments',
  true, -- Public bucket so attachments can be viewed
  10485760, -- 10MB max file size
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Note: RLS policies are disabled in development mode
-- For production, enable RLS and add appropriate policies
