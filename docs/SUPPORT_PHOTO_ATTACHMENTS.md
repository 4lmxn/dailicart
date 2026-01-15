# Support Ticket Photo Attachments

## Overview
Users can now upload photos when creating support tickets or replying to existing tickets. This feature helps customers provide visual evidence of issues like damaged products, delivery problems, or other concerns.

## Implementation Details

### 1. Photo Upload Utility (`mobile/src/utils/imageUpload.ts`)
Added three new functions for handling support ticket attachments:

- **`uploadTicketAttachment()`**: Uploads and optimizes images for ticket attachments
  - Resizes images to max 1200x1200px
  - Compresses to 80% quality JPEG
  - Stores in `support-attachments` bucket under `tickets/{ticketId}/` path
  - Returns URL, path, and file size

- **`optimizeTicketImage()`**: Optimizes images specifically for attachments (smaller than product images)

- **`deleteTicketAttachment()`**: Removes attachment from storage

### 2. Support Service Updates (`mobile/src/services/api/support.ts`)

#### New Types
- **`TicketAttachment`**: Interface for attachment metadata
  ```typescript
  {
    id, ticketId, photoProofId, fileUrl, fileName, 
    fileSizeBytes, mimeType, uploadedBy, uploadedByName, createdAt
  }
  ```
- **`CreateTicketInput`**: Now accepts optional `attachments[]` array

#### New Methods
- **`getAttachments(ticketId)`**: Fetches all attachments for a ticket
- **`addAttachments(ticketId, userId, attachments[])`**: Bulk upload attachments
- **`addAttachment(ticketId, userId, uri, fileName)`**: Upload single attachment
- **`createTicket()`**: Updated to support initial attachments

### 3. UI Updates (`mobile/src/screens/customer/SupportScreen.tsx`)

#### New Ticket Creation
- Photo picker button in new ticket modal
- Photo preview grid showing selected images
- Remove photo capability
- Limit of 5 photos per ticket
- Visual hint: "Add up to 5 photos to help explain your issue"

#### Ticket Replies
- Camera icon button next to reply input
- Photo preview thumbnails above reply box
- Limit of 3 photos per reply
- Photos upload automatically when sending reply

#### Ticket Detail View
- Dedicated "Attachments" section showing all ticket photos
- Grid layout with thumbnails
- Tap to view full photo details
- Shows file name below each thumbnail

### 4. Database Migration (`supabase/migrations/add_support_attachments_bucket.sql`)

Created storage bucket configuration:
- **Bucket Name**: `support-attachments`
- **Public**: Yes (for easy viewing)
- **Size Limit**: 10MB per file
- **Allowed Types**: image/jpeg, image/png, image/webp

#### Storage Policies (RLS)
1. **Upload**: Authenticated users can upload to their tickets
2. **View**: All authenticated users can view attachments
3. **Delete**: Users can delete their own attachments
4. **Admin**: Admins can manage all attachments

### 5. Data Flow

#### Creating Ticket with Photos
1. User selects photos from library
2. Photos are previewed in UI
3. On submit, ticket is created
4. Each photo is:
   - Uploaded to storage (`tickets/{ticketId}/{timestamp}-{filename}`)
   - `photo_proofs` record created
   - Linked via `ticket_attachments` table
5. Ticket displays with attachments

#### Adding Photos to Reply
1. User taps camera icon in reply section
2. Select photo from library
3. Photo previews above input
4. On send:
   - Message is created
   - Photos are uploaded and linked
   - UI refreshes to show new attachments

## User Experience

### Creating a Ticket
- Users see a "+ Add Photo" button in the attachments section
- Selected photos show as thumbnails with remove (×) buttons
- Clear visual feedback on photo count (max 5)

### Replying with Photos
- Compact camera button (📷) next to message input
- Mini thumbnails appear above input when photos are selected
- Seamless integration with text replies

### Viewing Attachments
- Clean grid layout in ticket detail
- Photos load from CDN with proper caching
- Tappable for full view (future enhancement: lightbox)

## Technical Considerations

### Image Optimization
- **Ticket attachments**: 1200x1200px max, 80% quality
- **Storage**: Public bucket with 1-year cache headers
- **Performance**: Images compressed before upload to save bandwidth

### Security
- RLS policies ensure users can only upload to valid ticket paths
- File size limited to 10MB to prevent abuse
- Mime type validation (images only)
- Admin override for moderation

### Database Schema
Uses existing tables:
- `photo_proofs`: Stores file metadata
- `ticket_attachments`: Links photos to tickets
- No schema changes needed, fully compatible

## Future Enhancements

Potential improvements:
1. **Image Lightbox**: Full-screen viewer with zoom/pan
2. **Camera Integration**: Take photos directly from app
3. **Multiple Selection**: Pick multiple photos at once
4. **Image Editing**: Crop/annotate before upload
5. **Video Support**: Allow short video clips
6. **Admin Tools**: Batch download attachments for investigation

## Migration Instructions

To deploy to production:

1. Run migration:
   ```bash
   supabase migration up
   # or
   psql -f supabase/migrations/add_support_attachments_bucket.sql
   ```

2. Verify bucket creation in Supabase dashboard:
   - Storage → Buckets → Check `support-attachments` exists
   - Verify policies are active

3. Test upload permissions:
   - Create a test ticket with photo
   - Verify photo appears in storage bucket
   - Confirm photo is visible in ticket detail

## Dependencies

Required packages (already in project):
- `expo-image-picker`: Photo selection from library
- `expo-image-manipulator`: Image optimization/resizing
- `expo-file-system`: File reading for upload

## Related Files

- `mobile/src/utils/imageUpload.ts` - Upload utilities
- `mobile/src/services/api/support.ts` - Support service API
- `mobile/src/screens/customer/SupportScreen.tsx` - UI implementation
- `supabase/migrations/add_support_attachments_bucket.sql` - Storage setup
- `supabase/schema.sql` - Database schema (photo_proofs, ticket_attachments)
