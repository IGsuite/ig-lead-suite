/**
 * Cold-email delivery stub.
 *
 * For cold / marketing lead outreach, prefer Instantly or Smartlead
 * (warmup + deliverability) over Amazon SES or SendGrid.
 * Wire INSTANTLY_API_KEY (or SMARTLEAD_API_KEY) later; until then, mock.
 */

export type EmailSendResult = {
  ok: boolean;
  mode: "live" | "mock";
  provider: "instantly" | "smartlead" | "mock";
  providerId?: string;
  error?: string;
};

export function emailProviderName(): "instantly" | "smartlead" | "mock" {
  if (process.env.INSTANTLY_API_KEY?.trim()) return "instantly";
  if (process.env.SMARTLEAD_API_KEY?.trim()) return "smartlead";
  return "mock";
}

export async function sendColdEmail(input: {
  to: string;
  subject: string;
  body: string;
  fromName?: string;
}): Promise<EmailSendResult> {
  const provider = emailProviderName();
  if (provider === "mock") {
    return {
      ok: true,
      mode: "mock",
      provider: "mock",
      providerId: `mock-email-${Date.now()}`,
    };
  }

  // Live Instantly / Smartlead API hooks land here once keys + campaign IDs exist.
  void input;
  return {
    ok: false,
    mode: "live",
    provider,
    error: `${provider} API wiring pending — set campaign mapping in Settings`,
  };
}

export function renderEmailTemplate(
  template: string,
  vars: { firstName?: string; brand?: string },
): string {
  return template
    .replaceAll("{{firstName}}", vars.firstName || "there")
    .replaceAll("{{brand}}", vars.brand || "us");
}
