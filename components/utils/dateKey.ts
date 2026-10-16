import { format } from 'date-fns';

/** Local calendar date as YYYY-MM-DD (unlike toISOString(), which shifts to the UTC date). */
export function toDateKey(date: Date | string | number): string {
  return format(new Date(date), 'yyyy-MM-dd');
}
