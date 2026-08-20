import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * PrismaService provides a singleton instance of PrismaClient
 * configured with the PostgreSQL adapter for Prisma 7.
 *
 * The service implements OnModuleInit and OnModuleDestroy to ensure
 * proper connection lifecycle management in NestJS.
 *
 * @see https://www.prisma.io/docs/getting-started/prisma-orm/quickstart/prisma-postgres
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private pool: Pool;

  constructor(private configService: ConfigService) {
    const connectionString = configService.get<string>('DATABASE_URL');

    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    // Create a PostgreSQL connection pool
    const pool = new Pool({ connectionString });

    // Create the Prisma adapter with the pool
    // PrismaPg accepts the pool directly, not wrapped in an object
    const adapter = new PrismaPg(pool);

    // Initialize PrismaClient with the adapter
    // super() must be called before accessing 'this'
    super({ adapter });

    // Assign pool to instance property after super() call
    this.pool = pool;
  }

  /**
   * Called when the module is initialized.
   * Connects to the database.
   */
  async onModuleInit() {
    await this.$connect();
  }

  /**
   * Called when the module is destroyed.
   * Disconnects from the database and closes the connection pool.
   */
  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }

  /**
   * Run `fn` while holding a PostgreSQL session advisory lock on a single
   * pooled connection (acquire + release must share one backend PID).
   * Returns `null` when the lock is already held elsewhere.
   */
  async withSessionAdvisoryLock<T>(
    lockKey: string,
    fn: () => Promise<T>,
  ): Promise<T | null> {
    const client = await this.pool.connect();
    try {
      const acquired = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
        [lockKey],
      );
      if (!acquired.rows[0]?.locked) {
        return null;
      }
      try {
        return await fn();
      } finally {
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [
          lockKey,
        ]);
      }
    } finally {
      client.release();
    }
  }
}
