-- scripts/schema.sql — Aura Skincare Aria Database Schema
-- Run via: npm run db:setup or psql

-- Enable UUID extension if not already available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Brands table
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

-- 2. Orders table
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

-- 2. Session overrides (per-visitor order state so one evaluator's cancellation never affects another)
CREATE TABLE IF NOT EXISTS session_overrides (
  session_id TEXT NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, order_id)
);

-- 3. Support tickets
CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  order_id TEXT,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Voice call logs & evaluation metrics
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

-- 5. Rate limiting for token / API protection
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  count INT NOT NULL DEFAULT 1
);

-- 6. Cancel confirmations for two-step destructive action confirmation
CREATE TABLE IF NOT EXISTS cancel_confirmations (
  session_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  token_hash TEXT NOT NULL PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
