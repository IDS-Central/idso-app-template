// DATABASE: Prisma client singleton.
//
// Prevents multiple Prisma Client instances during Next.js hot reload in development.
// In production, a single instance is created and reused for the process lifetime.
//
// Usage:
//   import { prisma } from '@/lib/db';
//   const users = await prisma.user.findMany();

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
