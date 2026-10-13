export function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function compactNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function relativeDay(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function crmLabel(crm: string): string {
  const map: Record<string, string> = {
    hubspot: "HubSpot",
    salesforce: "Salesforce",
    gohighlevel: "GoHighLevel",
    pipedrive: "Pipedrive",
    custom: "Custom CRM",
  };
  return map[crm] || crm;
}

export function statusLabel(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
