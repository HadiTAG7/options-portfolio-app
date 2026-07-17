// Full Supabase data backup → ./backup-output/*.json + manifest.
//
// Used by the "Backup Supabase" GitHub Actions workflow, which uploads
// the folder as a downloadable artifact. Pure Node (no dependencies).
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Note: auth passwords are NOT here — they only exist as bcrypt hashes,
// exportable via scripts/export-auth-users.sql (keep that output safe
// locally; it doubles as the login backup).

import { mkdirSync, writeFileSync } from "node:fs";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("✗ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}

const TABLES = ["partners", "trades", "active_stocks", "transactions"];
const OUT = "backup-output";
mkdirSync(OUT, { recursive: true });

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const money = (v) => Math.round(v * 100) / 100;

const manifest = { generatedAt: new Date().toISOString(), tables: {} };

for (const table of TABLES) {
  const res = await fetch(
    `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${table}?select=*`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Range: "0-9999",
      },
    }
  );
  if (!res.ok) {
    console.error(`✗ ${table}: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const rows = await res.json();
  writeFileSync(`${OUT}/${table}.json`, JSON.stringify(rows, null, 2));
  manifest.tables[table] = { rows: rows.length };
  console.log(`✓ ${table}: ${rows.length} rows`);
}

// Integrity figures for future restore verification.
const partners = JSON.parse(
  (await import("node:fs")).readFileSync(`${OUT}/partners.json`, "utf8")
);
const trades = JSON.parse(
  (await import("node:fs")).readFileSync(`${OUT}/trades.json`, "utf8")
);
manifest.totals = {
  sumCurrentBalance: money(
    partners.reduce((s, p) => s + num(p.currentBalance), 0)
  ),
  sumTradeResults: money(trades.reduce((s, t) => s + num(t.result), 0)),
  linkedAuthUsers: partners.filter((p) => p.auth_user_id).length,
};
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(
  `✓ manifest: Σ currentBalance $${manifest.totals.sumCurrentBalance}, Σ results $${manifest.totals.sumTradeResults}`
);
console.log("✓ BACKUP COMPLETE");
