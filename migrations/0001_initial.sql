PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS paws_brew_orders (
  id TEXT PRIMARY KEY,
  order_reference TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  method TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  items_json TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
  delivery_fee INTEGER NOT NULL,
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_confirmation',
  payment_method TEXT NOT NULL DEFAULT 'GCash',
  payment_status TEXT NOT NULL DEFAULT 'awaiting_reference',
  gcash_reference_number TEXT NOT NULL DEFAULT '',
  payment_reference_submitted_at TEXT,
  payment_verified_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON paws_brew_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON paws_brew_orders(status);
CREATE TABLE IF NOT EXISTS paws_brew_reservations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  guests INTEGER NOT NULL,
  pets INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON paws_brew_reservations(date);
