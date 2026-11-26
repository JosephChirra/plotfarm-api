import sanitizeHtml from 'sanitize-html';

/**
 * Strip all HTML/script tags from a string value.
 * Used as a class-transformer @Transform decorator on free-text DTO fields.
 *
 * Usage:
 *   @Transform(sanitizeString)
 *   @IsString()
 *   title: string;
 */
export const sanitizeString = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).trim();
};
