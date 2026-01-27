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
}
