/**
 * One-shot: align sole AppUser admin with AUTH_ADMIN_EMAIL / AUTH_ADMIN_PASSWORD.
 * Safe to re-run. Uses the same scrypt format as src/lib/auth.ts.
 */
import { randomBytes, scryptSync } from "crypto";
import { readFileSync } from "fs";
import { Pool } from "pg";

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2];
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  if (!(m[1] in process.env)) process.env[m[1]] = v;
}

// Prefer explicit CLI overrides (production values) over local .env.
const email = (
  process.argv[2] ||
  process.env.AUTH_ADMIN_EMAIL ||
  ""
)
  .trim()
  .toLowerCase();
const password = (process.argv[3] || process.env.AUTH_ADMIN_PASSWORD || "").trim();

if (!email || !password) {
  console.error("Usage: node scripts/fix-admin-from-env.mjs <email> <password>");
  process.exit(1);
}

function hashPassword(pw) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const admins = await pool.query(
  `SELECT id, email, role FROM "AppUser" WHERE role = 'admin' ORDER BY "createdAt" ASC`,
);
console.log(
  "admins before:",
  admins.rows.map((r) => ({ id: r.id, email: r.email })),
);

const passwordHash = hashPassword(password);

if (admins.rows.length === 1) {
  const id = admins.rows[0].id;
  await pool.query(
    `UPDATE "AppUser"
     SET email = $1, "passwordHash" = $2, name = COALESCE(NULLIF(name, ''), 'IG Lead Suite Admin'), "updatedAt" = NOW()
     WHERE id = $3`,
    [email, passwordHash, id],
  );
  console.log("migrated sole admin ->", email);
} else {
  const existing = await pool.query(
    `SELECT id FROM "AppUser" WHERE email = $1`,
    [email],
  );
  if (existing.rows[0]) {
    await pool.query(
      `UPDATE "AppUser" SET "passwordHash" = $1, role = 'admin', "updatedAt" = NOW() WHERE id = $2`,
      [passwordHash, existing.rows[0].id],
    );
    console.log("updated password for", email);
  } else {
    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await pool.query(
      `INSERT INTO "AppUser" (id, email, name, "passwordHash", role, "allowedEntityIds", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'admin', '{}', NOW(), NOW())`,
      [id, email, "IG Lead Suite Admin", passwordHash],
    );
    console.log("created admin", email, id);
  }
}

const after = await pool.query(
  `SELECT id, email, role FROM "AppUser" ORDER BY "createdAt" ASC`,
);
console.log(
  "users after:",
  after.rows.map((r) => ({ id: r.id, email: r.email, role: r.role })),
);
await pool.end();
