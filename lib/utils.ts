/**
 * Escape special regex characters in a user-supplied string to prevent ReDoS attacks.
 * Use this before passing any user input to MongoDB $regex queries or RegExp constructor.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sanitize a search string for safe use in MongoDB $regex queries.
 * Escapes special characters and enforces a maximum length to prevent ReDoS.
 */
export function sanitizeSearch(str: string, maxLength = 100): string {
  return escapeRegex(str.slice(0, maxLength));
}
