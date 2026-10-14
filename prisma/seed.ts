import "dotenv/config";
import { resetData } from "../src/lib/neon-store";

async function main() {
  if (!process.env.DATABASE_URL?.startsWith("postgres")) {
    throw new Error(
      "Set DATABASE_URL to your Neon connection string before seeding.",
    );
  }
  const data = await resetData();
  console.log(
    `Seeded Neon: ${data.brands.length} entities, ${data.leads.length} leads, ${data.campaigns.length} campaigns`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
