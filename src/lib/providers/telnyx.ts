import { isProductionDeploy } from "@/lib/auth";
/**
 * Telnyx Messaging API — SMS backend for SignalDesk campaigns.
 * Without TELNYX_API_KEY, sends are mocked so Autopilot still demos locally.
 */

export type TelnyxSendResult = {
  ok: boolean;
  mode: "live" | "mock";
  providerId?: string;
  error?: string;
  uncertain?: boolean;
};

export function isTelnyxConfigured(): boolean {
  return Boolean(process.env.TELNYX_API_KEY?.trim());
}

function e164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.startsWith("+")) return phone;
  return `+${digits}`;
}

export async function sendTelnyxSms(input: {
  to: string;
  from: string;
  text: string;
}): Promise<TelnyxSendResult> {
  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) {
    return { ok: !isProductionDeploy(), mode: "mock", error: isProductionDeploy() ? "Telnyx is not configured" : undefined };
  }

  try {
    const res = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: e164(input.from),
        to: e164(input.to),
        text: input.text,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      data?: { id?: string };
      errors?: Array<{ detail?: string; title?: string }>;
    };

    if (!res.ok) {
      const detail =
        json.errors?.[0]?.detail ||
        json.errors?.[0]?.title ||
        `Telnyx HTTP ${res.status}`;
      return { ok: false, mode: "live", error: detail };
    }

    return {
      ok: Boolean(json.data?.id),
      uncertain: !json.data?.id,
      mode: "live",
      providerId: json.data?.id,
    };
  } catch (err) {
    return {
      ok: false,
      mode: "live",
      error: "Telnyx request outcome unknown",
      uncertain: true,
    };
  }
}

/** Render simple {{firstName}} / {{brand}} tokens for SMS. */
export function renderSmsTemplate(
  template: string,
  vars: { firstName?: string; brand?: string },
): string {
  return template
    .replaceAll("{{firstName}}", vars.firstName || "there")
    .replaceAll("{{brand}}", vars.brand || "us");
}
