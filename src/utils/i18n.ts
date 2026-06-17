import { strings } from '../locales/strings';

/**
 * Type-safe-ish lightweight translation selector.
 * Allows nested object path resolve (e.g., t('common.cancel')) and replacement injection.
 */
export function t(path: string, replacers?: Record<string, string | number>): string {
  const parts = path.split('.');
  let current: any = strings;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return path; // Fallback to path key if not found
    }
  }

  if (typeof current !== 'string') {
    return path;
  }

  let result = current;
  if (replacers) {
    for (const [key, value] of Object.entries(replacers)) {
      result = result.replace(new RegExp(`{${key}}`, 'g'), String(value));
    }
  }

  return result;
}
