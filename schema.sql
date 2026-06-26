-- werkhervattingskas.nl database schema
-- Uitvoeren via Railway → PostgreSQL → Data → Query

-- Hoofd key-value opslag tabel
CREATE TABLE IF NOT EXISTS kv_store (
  key        VARCHAR(255) PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index voor snelle lookups
CREATE INDEX IF NOT EXISTS idx_kv_store_key ON kv_store(key);
CREATE INDEX IF NOT EXISTS idx_kv_store_updated ON kv_store(updated_at DESC);

-- Klaar! De server vult de rest automatisch in.
SELECT 'Schema aangemaakt op ' || NOW() AS status;
