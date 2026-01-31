/**
 * Shared TypeScript types and enums for Tamiym Workshop
 *
 * Enums are auto-generated from the Prisma schema.
 * @see enums.generated.ts (generated from apps/api/prisma/schema.prisma)
 */

// Re-export all generated enums from Prisma schema
export * from './enums.generated';

// Base types
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
