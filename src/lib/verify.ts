import type { Lead, VerifyStatus } from "@/lib/types";

const DISPOSABLE = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "tempmail.com",
  "10minutemail.com",
  "yopmail.com",
  "trashmail.com",
  "sharklasers.com",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type VerifyResult = {
  emailStatus: VerifyStatus;
  phoneStatus: VerifyStatus;
  verifyNotes: string;
};

/** Built-in verifier. Swap in NeverBounce / Twilio Lookup later via env keys. */
export function verifyContact(input: {
  email?: string;
  phone?: string;
}): VerifyResult {
  const notes: string[] = [];
  let emailStatus: VerifyStatus = "unverified";
  let phoneStatus: VerifyStatus = "unverified";

  if (input.email) {
    const email = input.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      emailStatus = "invalid";
      notes.push("email: bad format");
    } else {
      const domain = email.split("@")[1] || "";
      if (DISPOSABLE.has(domain)) {
        emailStatus = "invalid";
        notes.push("email: disposable domain");
      } else if (
        domain.endsWith(".test") ||
        domain.includes("example.") ||
        email.includes("+test")
      ) {
        emailStatus = "risky";
        notes.push("email: test/risky pattern");
      } else {
        emailStatus = "valid";
        notes.push("email: format ok (local check)");
      }
    }
  }

  if (input.phone) {
    const digits = input.phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) {
      phoneStatus = "invalid";
      notes.push("phone: bad length");
    } else if (/^(\d)\1{9,}$/.test(digits) || digits.startsWith("000")) {
      phoneStatus = "invalid";
      notes.push("phone: fake pattern");
    } else if (digits.length === 10 || (digits.length === 11 && digits.startsWith("1"))) {
      phoneStatus = "valid";
      notes.push("phone: format ok (local check)");
    } else {
      phoneStatus = "risky";
      notes.push("phone: unusual length");
    }
  }

  return {
    emailStatus,
    phoneStatus,
    verifyNotes: notes.join("; ") || "no contacts to verify",
  };
}

export function applyVerification(lead: Lead): Lead {
  const result = verifyContact({ email: lead.email, phone: lead.phone });
  return {
    ...lead,
    emailStatus: result.emailStatus,
    phoneStatus: result.phoneStatus,
    verifyNotes: result.verifyNotes,
    verifiedAt: new Date().toISOString(),
  };
}

export function contactOkForChannel(
  lead: Lead,
  channel: "sms" | "email",
  preferVerified: boolean,
): boolean {
  if (!preferVerified) return true;
  if (channel === "email") {
    if (!lead.email) return false;
    return lead.emailStatus === "valid" || lead.emailStatus === "risky";
  }
  if (!lead.phone) return false;
  return lead.phoneStatus === "valid" || lead.phoneStatus === "risky";
}
