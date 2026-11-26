export const MAX_UPLOAD_FILE_SIZE = 50 * 1024 * 1024;         // 50 MB general
export const MAX_PROPERTY_IMAGE_SIZE = 10 * 1024 * 1024;      // 10 MB per image
export const MAX_PROFILE_IMAGE_SIZE = 2 * 1024 * 1024;         // 2 MB avatar
export const MAX_PROPERTY_VIDEO_SIZE = 100 * 1024 * 1024;     // 100 MB per video
export const MAX_PROPERTY_PDF_SIZE   = 20 * 1024 * 1024;      // 20 MB per PDF  [PDF_FUTURE]
export const MAX_PROPERTY_IMAGES = 5;
export const MAX_PROPERTY_VIDEOS = 2;
export const MAX_PROJECT_IMAGES = 8;
export const MAX_PROJECT_IMAGE_SIZE = 10 * 1024 * 1024;
export const MAX_PROPERTY_PDFS   = 3;                         // [PDF_FUTURE]

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
// [PDF_FUTURE] Uncomment when PDF uploads are enabled:
// export const ALLOWED_PDF_MIME_TYPES = ['application/pdf'];

/** All currently accepted MIME types for property media uploads. */
export const ALLOWED_PROPERTY_MIME_TYPES = [
  ...ALLOWED_IMAGE_MIME_TYPES,
  ...ALLOWED_VIDEO_MIME_TYPES,
  // ...ALLOWED_PDF_MIME_TYPES,   // [PDF_FUTURE] add here
];
