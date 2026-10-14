import { NextResponse } from "next/server";
import Papa from "papaparse";
import { importLeads } from "@/lib/store";

function pick(row: Record<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const found = Object.entries(row).find(
      ([k]) => k.trim().toLowerCase() === key.toLowerCase(),
    );
    if (found?.[1]?.trim()) return found[1].trim();
  }
  return undefined;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const source = String(form.get("source") || "").trim();
  const groupName = String(form.get("groupName") || "General").trim();
  const purchaseDate = String(form.get("purchaseDate") || "").trim();
  const costDollars = Number(form.get("costDollars") || 0);

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
  }
  if (!source || !purchaseDate || !Number.isFinite(costDollars)) {
    return NextResponse.json(
      { error: "Source, purchase date, and cost are required" },
      { status: 400 },
    );
  }

  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length && !parsed.data.length) {
    return NextResponse.json(
      { error: parsed.errors[0]?.message || "Could not parse CSV" },
      { status: 400 },
    );
  }

  const rows = parsed.data.map((row) => ({
    email: pick(row, ["email", "email_address", "e-mail"]),
    phone: pick(row, ["phone", "mobile", "cell", "phone_number"]),
    firstName: pick(row, ["first_name", "firstname", "first", "fname"]),
    lastName: pick(row, ["last_name", "lastname", "last", "lname"]),
  }));

  const result = await importLeads({
    filename: file.name,
    source,
    groupName,
    purchaseDate,
    costCents: Math.round(costDollars * 100),
    rows,
  });

  return NextResponse.json({
    batch: result.batch,
    importedCount: result.imported.length,
    duplicateCount: result.duplicates,
  });
}
