/**
 * scripts/seed.mjs — Database setup and idempotent seed script
 * Run with: npm run db:setup
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Helper to manually read .env.local if present
function loadEnvLocal() {
  const envLocalPath = path.join(rootDir, '.env.local');
  if (fs.existsSync(envLocalPath)) {
    const lines = fs.readFileSync(envLocalPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvLocal();

const seedOrders = [
  {
    order_id: 'ORD-101',
    customer_name: 'Priya Sharma',
    product: 'Vitamin C Serum (30ml)',
    value_inr: 699,
    status: 'Out for Delivery',
    courier: 'BlueDart',
    tracking_id: 'BD-982103',
    delivered_days_ago: null,
    placed_hours_ago: null,
    expected_delivery: 'Expected by 6 PM today',
    notes: null,
  },
  {
    order_id: 'ORD-102',
    customer_name: 'Rahul Verma',
    product: 'Hydrating Sunscreen SPF 50',
    value_inr: 499,
    status: 'Delivered',
    courier: 'Delhivery',
    tracking_id: 'DL-441029',
    delivered_days_ago: 14,
    placed_hours_ago: null,
    expected_delivery: null,
    notes: null,
  },
  {
    order_id: 'ORD-103',
    customer_name: 'Ananya Patel',
    product: 'Green Tea Face Wash + Toner',
    value_inr: 850,
    status: 'Processing',
    courier: null,
    tracking_id: null,
    delivered_days_ago: null,
    placed_hours_ago: 3,
    expected_delivery: null,
    notes: 'Eligible for cancellation',
  },
];

async function setupDatabase() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    console.warn('\n⚠️  DATABASE_URL is not set.');
    console.warn('   The app will automatically run in degraded mode using the in-memory seed data.');
    console.warn('   To connect a live Neon database, copy env.example to .env.local and set DATABASE_URL.\n');
    process.exit(0);
  }

  console.log('🚀 Initializing database schema on Neon...');
  const sql = neon(url);

  // 1. Create tables
  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      order_id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      product TEXT NOT NULL,
      value_inr INT NOT NULL,
      status TEXT NOT NULL,
      courier TEXT,
      tracking_id TEXT,
      delivered_days_ago INT,
      placed_hours_ago INT,
      expected_delivery TEXT,
      notes TEXT
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS session_overrides (
      session_id TEXT NOT NULL,
      order_id TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (session_id, order_id)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      order_id TEXT,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS calls (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      duration_s INT,
      transcript JSONB,
      tool_events JSONB,
      summary JSONB,
      metrics JSONB
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      window_start TIMESTAMPTZ NOT NULL,
      count INT NOT NULL DEFAULT 1
    );
  `;

  console.log('✅ Tables created / verified successfully.');

  // 2. Seed orders idempotently
  console.log('🌱 Seeding 3 orders idempotently...');
  for (const o of seedOrders) {
    await sql`
      INSERT INTO orders (
        order_id, customer_name, product, value_inr, status,
        courier, tracking_id, delivered_days_ago, placed_hours_ago, expected_delivery, notes
      ) VALUES (
        ${o.order_id}, ${o.customer_name}, ${o.product}, ${o.value_inr}, ${o.status},
        ${o.courier}, ${o.tracking_id}, ${o.delivered_days_ago}, ${o.placed_hours_ago}, ${o.expected_delivery}, ${o.notes}
      )
      ON CONFLICT (order_id) DO UPDATE SET
        customer_name = EXCLUDED.customer_name,
        product = EXCLUDED.product,
        value_inr = EXCLUDED.value_inr,
        status = EXCLUDED.status,
        courier = EXCLUDED.courier,
        tracking_id = EXCLUDED.tracking_id,
        delivered_days_ago = EXCLUDED.delivered_days_ago,
        placed_hours_ago = EXCLUDED.placed_hours_ago,
        expected_delivery = EXCLUDED.expected_delivery,
        notes = EXCLUDED.notes;
    `;
    console.log(`   - Seeded ${o.order_id}: ${o.customer_name} (${o.status})`);
  }

  console.log('🎉 Database setup and seeding complete!\n');
}

setupDatabase().catch((err) => {
  console.error('❌ Database setup failed:', err);
  process.exit(1);
});
