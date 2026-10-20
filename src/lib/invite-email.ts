import nodemailer from "nodemailer";
import type { InviteSharePayload } from "@/lib/invite-credentials";

export type InviteEmailResult =
  | { sent: true; provider: "resend" | "smtp" }
  | {
      sent: false;
      reason: "not_configured" | "missing_from" | "send_failed";
      detail?: string;
    };

function resolveInviteFromEmail(): string | undefined {
  return (
    process.env.INVITE_FROM_EMAIL?.trim() ||
    process.env.AUTH_INVITE_FROM?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    undefined
  );
}

function inviteSubject(kind: "create" | "reset"): string {
  return kind === "reset"
    ? "Your IG Lead Suite password was reset"
    : "You're invited to IG Lead Suite";
}

function inviteHtml(invite: InviteSharePayload, kind: "create" | "reset"): string {
  const headline =
    kind === "reset"
      ? "Your temporary password was reset"
      : "You have access to IG Lead Suite";
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  return `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
  <p>${escape(headline)}</p>
  <p><a href="${escape(invite.inviteLink)}">Sign in</a> (email is prefilled)</p>
  <p>
    <strong>Email:</strong> ${escape(invite.email)}<br />
    <strong>Temporary password:</strong> ${escape(invite.temporaryPassword)}
  </p>
  <p style="color: #555; font-size: 14px;">
    Open the link, enter the temporary password, then ask an admin to reset if you need a new one.
  </p>
</body>
</html>`;
}

async function sendViaResend(input: {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
}): Promise<InviteEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { sent: false, reason: "not_configured" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      sent: false,
      reason: "send_failed",
      detail: `Resend ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
    };
  }
  return { sent: true, provider: "resend" };
}

async function sendViaSmtp(input: {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
}): Promise<InviteEmailResult> {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) {
    return { sent: false, reason: "not_configured" };
  }
  const port = Number(process.env.SMTP_PORT?.trim() || "587");
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const secure =
    process.env.SMTP_SECURE?.trim() === "true" || port === 465;

  const transporter = nodemailer.createTransport({
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });

  try {
    await transporter.sendMail({
      from: input.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { sent: true, provider: "smtp" };
  } catch (err) {
    return {
      sent: false,
      reason: "send_failed",
      detail: err instanceof Error ? err.message : "SMTP send failed",
    };
  }
}

/** True when Resend or SMTP is configured enough to attempt a send. */
export function isInviteEmailConfigured(): boolean {
  if (process.env.RESEND_API_KEY?.trim()) return true;
  if (process.env.SMTP_HOST?.trim()) return true;
  return false;
}

/**
 * Optional transactional invite email (not Telnyx / Smartlead).
 * Prefer Resend (`RESEND_API_KEY`) then nodemailer SMTP (`SMTP_HOST`).
 * Without a key/host, returns not_configured — UI still shows the share panel.
 */
export async function sendInviteEmail(input: {
  invite: InviteSharePayload;
  kind?: "create" | "reset";
}): Promise<InviteEmailResult> {
  const kind = input.kind ?? "create";
  const from = resolveInviteFromEmail();
  const configured = isInviteEmailConfigured();
  if (!configured) {
    return { sent: false, reason: "not_configured" };
  }
  if (!from) {
    return {
      sent: false,
      reason: "missing_from",
      detail:
        "Set INVITE_FROM_EMAIL or AUTH_INVITE_FROM (or SMTP_FROM for SMTP)",
    };
  }

  const payload = {
    to: input.invite.email,
    from,
    subject: inviteSubject(kind),
    text: input.invite.shareText,
    html: inviteHtml(input.invite, kind),
  };

  if (process.env.RESEND_API_KEY?.trim()) {
    return sendViaResend(payload);
  }
  return sendViaSmtp(payload);
}
