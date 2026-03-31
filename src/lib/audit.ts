// AUDIT: Prisma write wrappers that automatically set audit fields.
//
// Every Prisma model in IDSO apps includes:
//   updated_by  String   — email of the user who last modified the record
//   updated_at  DateTime @updatedAt — auto-set by Prisma
//   created_at  DateTime @default(now()) — auto-set by Prisma
//
// These helpers ensure updated_by is always set on create/update operations.
// Use them instead of calling prisma.model.create() or prisma.model.update() directly.
//
// Usage:
//   import { auditCreate, auditUpdate } from '@/lib/audit';
//   const task = await auditCreate('task', { title: 'New task', status: 'pending' }, 'user@example.com');
//   const updated = await auditUpdate('task', { id: task.id }, { status: 'done' }, 'user@example.com');

import { prisma } from './db';

/**
 * Create a record with the updated_by audit field automatically set.
 *
 * @param model - The Prisma model name (lowercase, e.g., 'task', 'user')
 * @param data - The data to create (without updated_by — it's added automatically)
 * @param userEmail - The authenticated user's email address
 * @returns The created record
 */
export async function auditCreate<T>(
  model: string,
  data: Record<string, unknown>,
  userEmail: string
): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (prisma as any)[model];
  if (!delegate?.create) {
    throw new Error(`Prisma model "${model}" not found. Check the model name.`);
  }
  return delegate.create({
    data: {
      ...data,
      updated_by: userEmail,
    },
  }) as Promise<T>;
}

/**
 * Update a record with the updated_by audit field automatically set.
 *
 * @param model - The Prisma model name (lowercase, e.g., 'task', 'user')
 * @param where - The Prisma where clause to identify the record
 * @param data - The data to update (without updated_by — it's added automatically)
 * @param userEmail - The authenticated user's email address
 * @returns The updated record
 */
export async function auditUpdate<T>(
  model: string,
  where: Record<string, unknown>,
  data: Record<string, unknown>,
  userEmail: string
): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (prisma as any)[model];
  if (!delegate?.update) {
    throw new Error(`Prisma model "${model}" not found. Check the model name.`);
  }
  return delegate.update({
    where,
    data: {
      ...data,
      updated_by: userEmail,
    },
  }) as Promise<T>;
}

/**
 * Upsert a record with the updated_by audit field automatically set.
 *
 * @param model - The Prisma model name (lowercase, e.g., 'task', 'user')
 * @param where - The Prisma where clause to identify the record
 * @param create - The data to use when creating a new record
 * @param update - The data to use when updating an existing record
 * @param userEmail - The authenticated user's email address
 * @returns The created or updated record
 */
export async function auditUpsert<T>(
  model: string,
  where: Record<string, unknown>,
  create: Record<string, unknown>,
  update: Record<string, unknown>,
  userEmail: string
): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (prisma as any)[model];
  if (!delegate?.upsert) {
    throw new Error(`Prisma model "${model}" not found. Check the model name.`);
  }
  return delegate.upsert({
    where,
    create: {
      ...create,
      updated_by: userEmail,
    },
    update: {
      ...update,
      updated_by: userEmail,
    },
  }) as Promise<T>;
}
