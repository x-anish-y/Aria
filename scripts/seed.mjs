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

import { DEFAULT_AURA_POLICIES, KAVERI_COFFEE_POLICIES } from '../lib/brands.js';

loadEnvLocal();

const seedBrands = [
  {
    id: 'aura',
    name: 'Aura Skincare',
    tagline: 'Clean, conscious skincare crafted from Ayurvedic botanicals',
    theme: { primary: '#f2ca50', accent: '#e5b838', font: 'var(--font-geist-sans)' },
    persona_name: 'Aria',
    voice: 'Aoede',
    policies: DEFAULT_AURA_POLICIES,
    orders_prefix: 'ORD-',
  },
  {
    id: 'kaveri',
    name: 'Kaveri Coffee Roasters',
    tagline: 'Artisanal shade-grown specialty coffee freshly roasted in Chikmagalur',
    theme: { primary: '#ea580c', accent: '#c2410c', font: 'var(--font-geist-sans)' },
    persona_name: 'Tara',
    voice: 'Puck',
    policies: KAVERI_COFFEE_POLICIES,
    orders_prefix: 'KAV-',
  },
];

const seedOrders = [
  {
    order_id: 'ORD-101',
    brand_id: 'aura',
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
    brand_id: 'aura',
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
    brand_id: 'aura',
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
  {
    order_id: 'KAV-201',
    brand_id: 'kaveri',
    customer_name: 'Siddharth Rao',
    product: 'Monsooned Malabar AAA (Whole Bean, 500g)',
    value_inr: 650,
    status: 'Out for Delivery',
    courier: 'BlueDart Express',
    tracking_id: 'BD-KAV-8812',
    delivered_days_ago: null,
    placed_hours_ago: null,
    expected_delivery: 'Expected by 5 PM today',
    notes: 'Fragile fresh roast packaging',
  },
  {
    order_id: 'KAV-202',
    brand_id: 'kaveri',
    customer_name: 'Divya Krishnan',
    product: 'Estate Peaberry Dark Roast (French Press Grind, 250g)',
    value_inr: 420,
    status: 'Delivered',
    courier: 'Delhivery',
    tracking_id: 'DL-KAV-3301',
    delivered_days_ago: 3,
    placed_hours_ago: null,
    expected_delivery: null,
    notes: 'Delivered 3 days ago. Fresh roast non-returnable food consumable',
  },
  {
    order_id: 'KAV-203',
    brand_id: 'kaveri',
    customer_name: 'Arjun Nair',
    product: 'Attikan Estate Micro-lot (Aeropress Grind, 500g)',
    value_inr: 840,
    status: 'Processing',
    courier: null,
    tracking_id: null,
    delivered_days_ago: null,
    placed_hours_ago: 1,
    expected_delivery: null,
    notes: 'Eligible for cancellation before batch roasting',
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

  // 1. Create brands table
  await sql`
    CREATE TABLE IF NOT EXISTS brands (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tagline TEXT NOT NULL,
      theme JSONB NOT NULL,
      persona_name TEXT NOT NULL,
      voice TEXT NOT NULL,
      policies JSONB NOT NULL,
      orders_prefix TEXT NOT NULL
    );
  `;

  // 2. Seed brands immediately so foreign keys can resolve
  console.log('🌱 Seeding brands idempotently...');
  for (const b of seedBrands) {
    await sql`
      INSERT INTO brands (
        id, name, tagline, theme, persona_name, voice, policies, orders_prefix
      ) VALUES (
        ${b.id}, ${b.name}, ${b.tagline}, ${JSON.stringify(b.theme)}::jsonb,
        ${b.persona_name}, ${b.voice}, ${JSON.stringify(b.policies)}::jsonb, ${b.orders_prefix}
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        tagline = EXCLUDED.tagline,
        theme = EXCLUDED.theme,
        persona_name = EXCLUDED.persona_name,
        voice = EXCLUDED.voice,
        policies = EXCLUDED.policies,
        orders_prefix = EXCLUDED.orders_prefix;
    `;
    console.log(`   - Seeded brand: ${b.name} (${b.id})`);
  }

  // 3. Create remaining tables
  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      order_id TEXT PRIMARY KEY,
      brand_id TEXT REFERENCES brands(id) DEFAULT 'aura',
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

  // Ensure brand_id column exists if orders table was created prior
  await sql`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS brand_id TEXT REFERENCES brands(id) DEFAULT 'aura';
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

  await sql`
    CREATE TABLE IF NOT EXISTS cancel_confirmations (
      session_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      token_hash TEXT NOT NULL PRIMARY KEY,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  console.log('✅ Tables created / verified successfully.');

  // 3. Seed orders idempotently
  console.log(`🌱 Seeding ${seedOrders.length} orders idempotently...`);
  for (const o of seedOrders) {
    await sql`
      INSERT INTO orders (
        order_id, brand_id, customer_name, product, value_inr, status,
        courier, tracking_id, delivered_days_ago, placed_hours_ago, expected_delivery, notes
      ) VALUES (
        ${o.order_id}, ${o.brand_id}, ${o.customer_name}, ${o.product}, ${o.value_inr}, ${o.status},
        ${o.courier}, ${o.tracking_id}, ${o.delivered_days_ago}, ${o.placed_hours_ago}, ${o.expected_delivery}, ${o.notes}
      )
      ON CONFLICT (order_id) DO UPDATE SET
        brand_id = EXCLUDED.brand_id,
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
    console.log(`   - Seeded ${o.order_id} [${o.brand_id}]: ${o.customer_name} (${o.status})`);
  }

  console.log('🎉 Database setup and seeding complete!\n');
}

setupDatabase().catch((err) => {
  console.error('❌ Database setup failed:', err);
  process.exit(1);
});
