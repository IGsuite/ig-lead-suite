/**
 * Unit-ish checks for Smartlead CRM-copy helpers (no network).
 * Run: npx tsx scripts/check-smartlead-copy.ts
 */
import {
  toSmartleadEmailHtml,
  toSmartleadTemplate,
} from "../src/lib/providers/email";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const tpl = toSmartleadTemplate(
  "Quick note for {{firstName}}’s business — from {{brand}}",
  "Abstract",
);
assert(
  tpl === "Quick note for {{first_name}}’s business — from Abstract",
  `merge tags: got ${tpl}`,
);

const html = toSmartleadEmailHtml("Hi there,\n\nLine two.\nLine three.");
assert(html.includes("<p>"), "plain → paragraphs");
assert(html.includes("<br>"), "single newlines → br");
assert(!html.includes("Hi there,\n"), "no raw newlines left in outer sense");

const keep = toSmartleadEmailHtml("<div><p>Already HTML {{first_name}}</p></div>");
assert(keep.startsWith("<div>"), "existing HTML preserved");

const escaped = toSmartleadEmailHtml("A < B & C > D");
assert(escaped.includes("&lt;"), "escapes <");
assert(escaped.includes("&amp;"), "escapes &");
assert(escaped.includes("&gt;"), "escapes >");

console.log("check-smartlead-copy: ok");
