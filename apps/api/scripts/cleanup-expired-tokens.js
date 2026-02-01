"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const pg_1 = require("pg");
const adapter_pg_1 = require("@prisma/adapter-pg");
const client_1 = require("../src/generated/prisma/client");
async function main() {
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) {
        throw new Error('DATABASE_URL is not set');
    }
    const pool = new pg_1.Pool({ connectionString });
    const adapter = new adapter_pg_1.PrismaPg(pool);
    const prisma = new client_1.PrismaClient({ adapter });
    try {
        const result = await prisma.authToken.deleteMany({
            where: { expiresAt: { lt: new Date() } },
        });
        console.log(`Deleted ${result.count} expired auth token(s)`);
    }
    finally {
        await prisma.$disconnect();
        await pool.end();
    }
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=cleanup-expired-tokens.js.map