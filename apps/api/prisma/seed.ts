/**
 * Seeds GeoState with Nigerian states (ISO 3166-2:NG two-letter codes).
 * Run with: pnpm exec prisma db seed
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../src/generated/prisma/client';

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) {
  throw new Error('DATABASE_URL is required to run seed');
}
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const NIGERIA_STATES: { code: string; name: string }[] = [
  { code: 'AB', name: 'Abia' },
  { code: 'FC', name: 'Abuja Federal Capital Territory' },
  { code: 'AD', name: 'Adamawa' },
  { code: 'AK', name: 'Akwa Ibom' },
  { code: 'AN', name: 'Anambra' },
  { code: 'BA', name: 'Bauchi' },
  { code: 'BY', name: 'Bayelsa' },
  { code: 'BE', name: 'Benue' },
  { code: 'BO', name: 'Borno' },
  { code: 'CR', name: 'Cross River' },
  { code: 'DE', name: 'Delta' },
  { code: 'EB', name: 'Ebonyi' },
  { code: 'ED', name: 'Edo' },
  { code: 'EK', name: 'Ekiti' },
  { code: 'EN', name: 'Enugu' },
  { code: 'GO', name: 'Gombe' },
  { code: 'IM', name: 'Imo' },
  { code: 'JI', name: 'Jigawa' },
  { code: 'KD', name: 'Kaduna' },
  { code: 'KN', name: 'Kano' },
  { code: 'KT', name: 'Katsina' },
  { code: 'KE', name: 'Kebbi' },
  { code: 'KO', name: 'Kogi' },
  { code: 'KW', name: 'Kwara' },
  { code: 'LA', name: 'Lagos' },
  { code: 'NA', name: 'Nasarawa' },
  { code: 'NI', name: 'Niger' },
  { code: 'OG', name: 'Ogun' },
  { code: 'ON', name: 'Ondo' },
  { code: 'OS', name: 'Osun' },
  { code: 'OY', name: 'Oyo' },
  { code: 'PL', name: 'Plateau' },
  { code: 'RI', name: 'Rivers' },
  { code: 'SO', name: 'Sokoto' },
  { code: 'TA', name: 'Taraba' },
  { code: 'YO', name: 'Yobe' },
  { code: 'ZA', name: 'Zamfara' },
];

type NigeriaLgaSeed = {
  states: Array<{
    code: string;
    name: string;
    lgas: Array<{ name: string }>;
  }>;
};

async function loadNigeriaLgas(): Promise<NigeriaLgaSeed> {
  const filePath = resolve(__dirname, 'nigeria-lgas.curated.json');
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content) as NigeriaLgaSeed;
}

async function main() {
  for (const { code, name } of NIGERIA_STATES) {
    await prisma.geoState.upsert({
      where: { code },
      create: { code, name, isActive: true },
      update: { name, isActive: true },
    });
  }
  const lgaSeed = await loadNigeriaLgas();
  let totalLgas = 0;
  for (const state of lgaSeed.states) {
    for (const lga of state.lgas) {
      await prisma.geoLga.upsert({
        where: {
          stateCode_name: {
            stateCode: state.code,
            name: lga.name,
          },
        },
        create: {
          stateCode: state.code,
          name: lga.name,
          isActive: true,
        },
        update: {
          isActive: true,
        },
      });
      totalLgas += 1;
    }
  }

  console.log(`Seeded ${NIGERIA_STATES.length} Nigerian states (GeoState).`);
  console.log(`Seeded ${totalLgas} Nigerian LGAs (GeoLga).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
