// migrations/createTables.js
// Run this ONCE to create all tables in PostgreSQL.
// Usage: node migrations/createTables.js

require('dotenv').config();
const { query } = require('../config/db');

async function createTables() {
  console.log('Creating tables...\n');

  // ─── USERS ────────────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name                      TEXT NOT NULL,
      email                     TEXT NOT NULL UNIQUE,
      password                  TEXT,
      google_id                 TEXT UNIQUE,
      avatar                    TEXT DEFAULT '',
      is_verified               BOOLEAN DEFAULT FALSE,
      verification_token        TEXT,
      verification_token_expires TIMESTAMPTZ,
      reset_password_token      TEXT,
      reset_password_expires    TIMESTAMPTZ,
      gsc_access_token          TEXT,
      gsc_refresh_token         TEXT,
      created_at                TIMESTAMPTZ DEFAULT NOW(),
      updated_at                TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✓ users');

  // ─── CAMPAIGNS ────────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      full_name           TEXT NOT NULL,
      business_name       TEXT NOT NULL,
      phone_number        TEXT NOT NULL,
      selected_channels   TEXT[] NOT NULL DEFAULT '{}',
      selected_platforms  JSONB DEFAULT '[]',
      status              TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','contacted','in_progress','completed','cancelled')),
      notes               TEXT,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_campaigns_user_id   ON campaigns(user_id);
    CREATE INDEX IF NOT EXISTS idx_campaigns_status    ON campaigns(status);
    CREATE INDEX IF NOT EXISTS idx_campaigns_created   ON campaigns(created_at DESC);
  `);
  console.log('✓ campaigns');

  // ─── CONVERSATIONS ────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      messages   JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
  `);
  console.log('✓ conversations');

  // ─── WEBSITES ─────────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS websites (
      id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id                  TEXT NOT NULL,
      website_name              TEXT NOT NULL,
      website_link              TEXT NOT NULL UNIQUE,
      image_url                 TEXT,
      business_categories       TEXT[] DEFAULT '{}',
      is_business_categories_selected BOOLEAN DEFAULT FALSE,
      monthly_traffic           INTEGER DEFAULT 0,
      traffic_tier              TEXT DEFAULT 'unverified'
                                  CHECK (traffic_tier IN ('unverified','starter','basic','standard','premium','elite')),
      site_script               TEXT,
      verification_token        TEXT,
      verification_status       TEXT DEFAULT 'pending'
                                  CHECK (verification_status IN ('pending','verified','failed')),
      verified_at               TIMESTAMPTZ,
      gsc_access_token          TEXT,
      gsc_refresh_token         TEXT,
      gsc_site_url              TEXT,
      gsc_connected_at          TIMESTAMPTZ,
      script_installed          BOOLEAN DEFAULT FALSE,
      script_installed_at       TIMESTAMPTZ,
      gsc_verified              BOOLEAN DEFAULT FALSE,
      gsc_verified_at           TIMESTAMPTZ,
      unverified_since          TIMESTAMPTZ,
      grant_window_expires_at   TIMESTAMPTZ,
      granted_traffic_display   INTEGER,
      granted_views_display     INTEGER,
      granted_tier_display      TEXT,
      created_at                TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_websites_owner_id ON websites(owner_id);
  `);
  console.log('✓ websites');

  // ─── AD CATEGORIES ────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS ad_categories (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id             TEXT NOT NULL,
      website_id           UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
      category_name        TEXT NOT NULL,
      description          TEXT,
      price                NUMERIC(12,2) NOT NULL,
      space_type           TEXT NOT NULL,
      user_count           INTEGER DEFAULT 0,
      instructions         TEXT,
      default_language     TEXT DEFAULT 'english'
                             CHECK (default_language IN ('english','french','kinyarwanda','kiswahili','chinese','spanish')),
      custom_attributes    JSONB DEFAULT '{}',
      placement_mode       TEXT DEFAULT 'auto' CHECK (placement_mode IN ('auto','manual')),
      placeholder_div      TEXT,
      api_codes            JSONB DEFAULT '{}',
      selected_ads         UUID[] DEFAULT '{}',
      web_owner_email      TEXT NOT NULL,
      visitor_range_min    INTEGER NOT NULL,
      visitor_range_max    INTEGER NOT NULL,
      tier                 TEXT NOT NULL
                             CHECK (tier IN ('starter','basic','standard','premium','elite','unverified')),
      customization        JSONB,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ad_categories_owner_website ON ad_categories(owner_id, website_id);
  `);
  console.log('✓ ad_categories');

  // ─── IMPORT ADS (WebAdvertiseModel) ──────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS import_ads (
      id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                     TEXT NOT NULL,
      ad_owner_email              TEXT NOT NULL,
      image_url                   TEXT,
      pdf_url                     TEXT,
      video_url                   TEXT,
      business_name               TEXT NOT NULL,
      business_link               TEXT NOT NULL,
      business_location           TEXT NOT NULL,
      ad_description              TEXT NOT NULL,
      website_selections          JSONB DEFAULT '[]',
      available_for_reassignment  BOOLEAN DEFAULT FALSE,
      confirmed                   BOOLEAN DEFAULT FALSE,
      clicks                      INTEGER DEFAULT 0,
      views                       INTEGER DEFAULT 0,
      created_at                  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_import_ads_user_id ON import_ads(user_id);
  `);
  console.log('✓ import_ads');

  // ─── PAYMENTS ─────────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS payments (
      id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      payment_id                TEXT NOT NULL UNIQUE,
      tx_ref                    TEXT NOT NULL UNIQUE,
      base_reference            TEXT,
      ad_id                     UUID REFERENCES import_ads(id),
      advertiser_id             TEXT NOT NULL,
      web_owner_id              TEXT NOT NULL,
      website_id                UUID REFERENCES websites(id),
      category_id               UUID REFERENCES ad_categories(id),
      amount                    NUMERIC(12,2) NOT NULL,
      currency                  TEXT DEFAULT 'RWF',
      status                    TEXT DEFAULT 'pending'
                                  CHECK (status IN ('pending','successful','failed','cancelled','refunded','internally_refunded')),
      xentri_pay_data           JSONB,
      flutterwave_data          JSONB,
      refunded_at               TIMESTAMPTZ,
      refund_reason             TEXT,
      internal_refund_processed BOOLEAN DEFAULT FALSE,
      refund_transaction_ids    UUID[] DEFAULT '{}',
      refund_applied            NUMERIC(12,2) DEFAULT 0,
      wallet_applied            NUMERIC(12,2) DEFAULT 0,
      amount_paid               NUMERIC(12,2),
      payment_method            TEXT DEFAULT 'xentripay'
                                  CHECK (payment_method IN ('xentripay','flutterwave','refund_only','wallet_only','hybrid','wallet_hybrid','refund_hybrid')),
      payment_type              TEXT
                                  CHECK (payment_type IN ('xentripay','flutterwave','wallet','wallet_reassignment','hybrid','hybrid_reassignment','refund_only','wallet_only','wallet_hybrid','refund_hybrid')),
      is_reassignment           BOOLEAN DEFAULT FALSE,
      refund_used               BOOLEAN DEFAULT FALSE,
      refund_used_at            TIMESTAMPTZ,
      refund_used_for_payment   UUID REFERENCES payments(id),
      refund_usage_amount       NUMERIC(12,2) DEFAULT 0,
      refund_sources            JSONB DEFAULT '[]',
      wallet_sources            JSONB DEFAULT '[]',
      notes                     TEXT,
      original_payment_id       UUID REFERENCES payments(id),
      metadata                  JSONB,
      rejection_deadline        TIMESTAMPTZ,
      is_rejectable             BOOLEAN DEFAULT TRUE,
      paid_at                   TIMESTAMPTZ,
      created_at                TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_payments_ad_status       ON payments(ad_id, status);
    CREATE INDEX IF NOT EXISTS idx_payments_advertiser      ON payments(advertiser_id, status);
    CREATE INDEX IF NOT EXISTS idx_payments_webowner        ON payments(web_owner_id, status);
    CREATE INDEX IF NOT EXISTS idx_payments_base_ref        ON payments(base_reference);
    CREATE INDEX IF NOT EXISTS idx_payments_created         ON payments(created_at DESC);
  `);
  console.log('✓ payments');

  // ─── WALLETS ──────────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS wallets (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id        TEXT NOT NULL,
      owner_email     TEXT NOT NULL,
      owner_type      TEXT NOT NULL CHECK (owner_type IN ('webOwner','advertiser')),
      balance         NUMERIC(12,2) DEFAULT 0,
      total_earned    NUMERIC(12,2) DEFAULT 0,
      total_spent     NUMERIC(12,2) DEFAULT 0,
      total_refunded  NUMERIC(12,2) DEFAULT 0,
      last_updated    TIMESTAMPTZ DEFAULT NOW(),
      is_active       BOOLEAN DEFAULT TRUE,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (owner_id, owner_type)
    );
  `);
  console.log('✓ wallets');

  // ─── WALLET TRANSACTIONS ──────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet_id             UUID NOT NULL REFERENCES wallets(id),
      payment_id            UUID REFERENCES payments(id),
      ad_id                 UUID REFERENCES import_ads(id),
      related_transaction_id UUID REFERENCES wallet_transactions(id),
      amount                NUMERIC(12,2) NOT NULL,
      type                  TEXT NOT NULL CHECK (type IN ('credit','debit','refund_credit','refund_debit')),
      description           TEXT NOT NULL,
      status                TEXT DEFAULT 'completed' CHECK (status IN ('pending','completed','failed')),
      transaction_hash      TEXT UNIQUE,
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      updated_at            TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet_id ON wallet_transactions(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_wallet_tx_payment_id ON wallet_transactions(payment_id);
  `);
  console.log('✓ wallet_transactions');

  // ─── WITHDRAWAL REQUESTS ──────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS withdrawal_requests (
      id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet_id               UUID NOT NULL REFERENCES wallets(id),
      user_id                 TEXT NOT NULL,
      user_email              TEXT NOT NULL,
      owner_type              TEXT NOT NULL CHECK (owner_type IN ('webOwner','advertiser')),
      amount                  NUMERIC(12,2) NOT NULL,
      bank_details            JSONB NOT NULL,
      status                  TEXT DEFAULT 'pending'
                                CHECK (status IN ('pending','approved','completed','rejected','cancelled')),
      wallet_balance_at_request NUMERIC(12,2) NOT NULL,
      processed_by            UUID REFERENCES users(id),
      processed_at            TIMESTAMPTZ,
      admin_notes             TEXT DEFAULT '',
      rejection_reason        TEXT DEFAULT '',
      transaction_id          UUID REFERENCES wallet_transactions(id),
      created_at              TIMESTAMPTZ DEFAULT NOW(),
      updated_at              TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawal_requests(user_id);
    CREATE INDEX IF NOT EXISTS idx_withdrawals_status  ON withdrawal_requests(status, created_at DESC);
  `);
  console.log('✓ withdrawal_requests');

  // ─── PAYMENT TRACKERS ─────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS payment_trackers (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id              TEXT NOT NULL,
      ad_id                UUID REFERENCES import_ads(id),
      category_id          UUID REFERENCES ad_categories(id),
      payment_date         TIMESTAMPTZ NOT NULL,
      last_withdrawal_date TIMESTAMPTZ,
      amount               NUMERIC(12,2) NOT NULL,
      views_required       INTEGER NOT NULL,
      current_views        INTEGER DEFAULT 0,
      status               TEXT DEFAULT 'pending' CHECK (status IN ('pending','available','withdrawn')),
      payment_reference    TEXT UNIQUE,
      test_mode            BOOLEAN DEFAULT FALSE,
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      updated_at           TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✓ payment_trackers');

  // ─── WEB OWNER BALANCES ───────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS web_owner_balances (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           TEXT NOT NULL UNIQUE,
      total_earnings    NUMERIC(12,2) DEFAULT 0,
      available_balance NUMERIC(12,2) DEFAULT 0,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✓ web_owner_balances');

  // ─── WEBSITE PAGE VIEWS (analytics) ──────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS website_page_views (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      website_id   TEXT NOT NULL,
      ip           TEXT DEFAULT '',
      country      TEXT DEFAULT 'Unknown',
      country_code TEXT DEFAULT '',
      city         TEXT DEFAULT 'Unknown',
      region       TEXT DEFAULT '',
      lat          NUMERIC(9,6),
      lon          NUMERIC(9,6),
      device       TEXT DEFAULT 'unknown'
                     CHECK (device IN ('desktop','mobile','tablet','bot','unknown')),
      referrer     TEXT DEFAULT '',
      path         TEXT DEFAULT '/',
      is_granted   BOOLEAN DEFAULT FALSE,
      timestamp    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_page_views_website_id  ON website_page_views(website_id);
    CREATE INDEX IF NOT EXISTS idx_page_views_timestamp   ON website_page_views(website_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_page_views_country     ON website_page_views(website_id, country);
    CREATE INDEX IF NOT EXISTS idx_page_views_is_granted  ON website_page_views(is_granted);
  `);
  console.log('✓ website_page_views');

  // ─── TRAFFIC GRANTS ───────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS traffic_grants (
      id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                 UUID REFERENCES users(id) ON DELETE CASCADE,
      website_id              UUID REFERENCES websites(id),
      granted_traffic         INTEGER,
      granted_views           INTEGER,
      access_token            TEXT NOT NULL UNIQUE,
      token_used              BOOLEAN DEFAULT FALSE,
      token_used_at           TIMESTAMPTZ,
      granted_by              TEXT NOT NULL,
      status                  TEXT DEFAULT 'pending'
                                CHECK (status IN ('pending','completed','expired','revoked')),
      expires_at              TIMESTAMPTZ NOT NULL,
      completed_at            TIMESTAMPTZ,
      grant_window_expires_at TIMESTAMPTZ,
      email_sent              BOOLEAN DEFAULT FALSE,
      email_sent_at           TIMESTAMPTZ,
      notes                   TEXT DEFAULT '',
      created_at              TIMESTAMPTZ DEFAULT NOW(),
      updated_at              TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_traffic_grants_user_id ON traffic_grants(user_id);
    CREATE INDEX IF NOT EXISTS idx_traffic_grants_status  ON traffic_grants(status);
  `);
  console.log('✓ traffic_grants');

  console.log('\n✅ All tables created successfully!');
  process.exit(0);
}

createTables().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
