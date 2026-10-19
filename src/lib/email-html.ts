/**
 * Build personalized plain-text + HTML email bodies for campaign blasts.
 * Images appear only in the HTML part; text stays a clean fallback.
 */

export type EmailTemplateVars = {
  firstName?: string;
  brand?: string;
};

export type BuildEmailBodiesInput = {
  /** Plain-text message (required). */
  message: string;
  /** Optional HTML override; tokens still replaced. */
  htmlMessage?: string | null;
  /** Public https image URL for HTML only. */
  imageUrl?: string | null;
  imageAlt?: string | null;
  vars: EmailTemplateVars;
};

export type EmailBodies = {
  text: string;
  html: string;
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Apply {{firstName}} / {{brand}} tokens (plain or HTML templates). */
export function applyEmailTokens(
  template: string,
  vars: EmailTemplateVars,
): string {
  return template
    .replaceAll("{{firstName}}", vars.firstName || "there")
    .replaceAll("{{brand}}", vars.brand || "us");
}

function isSafeImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/** Turn plain text into simple HTML paragraphs (escaped). */
export function plainTextToHtml(text: string): string {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    return "<p></p>";
  }

  return blocks
    .map((block) => {
      const withBreaks = escapeHtml(block).replaceAll("\n", "<br />\n");
      return `<p style="margin:0 0 1em 0;line-height:1.5;">${withBreaks}</p>`;
    })
    .join("\n");
}

function imageBlock(imageUrl: string, imageAlt?: string | null): string {
  const alt = escapeHtml((imageAlt || "").trim() || "Campaign image");
  const src = escapeHtml(imageUrl.trim());
  return `<p style="margin:1.25em 0;">
  <img src="${src}" alt="${alt}" style="max-width:100%;height:auto;border:0;display:block;" />
</p>`;
}

/**
 * Personalized text + HTML. Image is HTML-only when a safe URL is provided.
 * Prefer `htmlMessage` when set; otherwise wrap the plain message.
 */
export function buildEmailBodies(input: BuildEmailBodiesInput): EmailBodies {
  const text = applyEmailTokens(input.message, input.vars);
  const imageUrl = input.imageUrl?.trim() || "";
  const includeImage = Boolean(imageUrl && isSafeImageUrl(imageUrl));

  let htmlInner: string;
  if (input.htmlMessage?.trim()) {
    htmlInner = applyEmailTokens(input.htmlMessage, input.vars);
    if (includeImage && !htmlInner.includes(imageUrl)) {
      htmlInner = `${htmlInner}\n${imageBlock(imageUrl, input.imageAlt)}`;
    }
  } else {
    htmlInner = plainTextToHtml(text);
    if (includeImage) {
      htmlInner = `${htmlInner}\n${imageBlock(imageUrl, input.imageAlt)}`;
    }
  }

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:16px;font-family:Georgia,serif;color:#1a1a1a;background:#ffffff;">
${htmlInner}
</body>
</html>`;

  return { text, html };
}
