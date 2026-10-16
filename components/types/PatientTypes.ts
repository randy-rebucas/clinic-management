import { DEFAULT_PAGE_SIZE } from '@/lib/page-size';

// Patient domain types
export interface Patient {
  _id: string;
  patientCode?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  sex?: string;
  address?: {
    city?: string;
    state?: string;
  };
  active?: boolean;
  createdAt?: string;
  tags?: string[];
  segmentFlags?: Record<string, boolean>;
}

// Sort options - using as const to prevent widening to string
export const PATIENT_SORT_OPTIONS = {
  NAME_ASC: 'name-asc',
  NAME_DESC: 'name-desc',
  DATE_ASC: 'date-asc',
  DATE_DESC: 'date-desc',
  CODE_ASC: 'code-asc',
  CODE_DESC: 'code-desc',
  ADDED_DESC: 'added-desc',
  ADDED_ASC: 'added-asc',
} as const;

export type SortOption = typeof PATIENT_SORT_OPTIONS[keyof typeof PATIENT_SORT_OPTIONS];

// Filter state shape
export interface FilterState {
  sex: string;
  active: string;
  minAge: string;
  maxAge: string;
  city: string;
  state: string;
  /** Any of these tags. */
  tags: string[];
  /** Every one of these segment flags. */
  flags: string[];
}

// Pagination state
export interface PaginationState {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

// API response shape
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  pagination?: PaginationState;
  error?: string;
}

// Sort configuration for API
export interface SortConfig {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

// Map sort UI values to API format
export const SORT_MAP: Record<SortOption, SortConfig> = {
  [PATIENT_SORT_OPTIONS.NAME_ASC]: { sortBy: 'name', sortOrder: 'asc' },
  [PATIENT_SORT_OPTIONS.NAME_DESC]: { sortBy: 'name', sortOrder: 'desc' },
  [PATIENT_SORT_OPTIONS.DATE_ASC]: { sortBy: 'dateOfBirth', sortOrder: 'asc' },
  [PATIENT_SORT_OPTIONS.DATE_DESC]: { sortBy: 'dateOfBirth', sortOrder: 'desc' },
  [PATIENT_SORT_OPTIONS.CODE_ASC]: { sortBy: 'patientCode', sortOrder: 'asc' },
  [PATIENT_SORT_OPTIONS.CODE_DESC]: { sortBy: 'patientCode', sortOrder: 'desc' },
  [PATIENT_SORT_OPTIONS.ADDED_DESC]: { sortBy: 'createdAt', sortOrder: 'desc' },
  [PATIENT_SORT_OPTIONS.ADDED_ASC]: { sortBy: 'createdAt', sortOrder: 'asc' },
} as const;

// Default filter state
export const DEFAULT_FILTERS: FilterState = {
  sex: 'all',
  active: 'all',
  minAge: '',
  maxAge: '',
  city: '',
  state: '',
  tags: [],
  flags: [],
};

// Default pagination
export const DEFAULT_PAGINATION: PaginationState = {
  page: 1,
  limit: DEFAULT_PAGE_SIZE,
  total: 0,
  pages: 0,
};
