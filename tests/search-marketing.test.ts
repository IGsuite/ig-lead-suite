import assert from "node:assert/strict";
import test from "node:test";
import { isMarketingPlatform, readSearchSetup, validateSearchPlan, writeSearchSetup } from "../src/lib/marketing-platforms";
import { filterMarketingPlan, marketingKindLabel, marketingPlanItems } from "../src/lib/calendar-overview";
import type { SocialCampaign } from "../src/lib/types";

test("search plans reject launch, bad dates, unsafe landing links and invalid reported results", () => {
  assert.equal(validateSearchPlan({ status: "draft", scheduleStart: "2026-11-02", scheduleEnd: "2026-11-30", clicks: 23, spendDollars: "12.50", landingUrl: "https://example.com/program" }), null);
  for (const input of [{ status: "active" }, { scheduleStart: "2026-13-01" }, { scheduleStart: "2026-02-30" }, { scheduleStart: "2026-11-30", scheduleEnd: "2026-11-02" }, { impressions: -1 }, { clicks: 1.5 }, { leads: NaN }, { spendDollars: "invalid" }, { landingUrl: "javascript:alert(1)" }]) assert.ok(validateSearchPlan(input), JSON.stringify(input));
  assert.equal(isMarketingPlatform("seo"), true); assert.equal(isMarketingPlatform("google_ads"), true); assert.equal(isMarketingPlatform("constructor"), false); assert.equal(isMarketingPlatform("other"), false);
});

test("company research setup round-trips and preserves legacy notes without trusting non-string properties", () => {
  const setup = { ...readSearchSetup(), website: "https://example.com", competitors: "rival.com", keywords: "business credit", locations: "New York" };
  assert.deepEqual(readSearchSetup(writeSearchSetup(setup)), setup);
  assert.equal(readSearchSetup("Existing setup notes").notes, "Existing setup notes");
  assert.equal(readSearchSetup('{"version":"search-setup-v1","competitors":42}').competitors, "");
});

test("SEO and Google Ads calendar plans remain separate from social and from inaccessible companies", () => {
  const plan = { id: "seo-a", entityId: "abstract", platform: "seo", name: "SEO monthly plan", status: "draft", objective: "HELOC visibility", scheduleStart: "2026-11-02", scheduleEnd: "2026-11-30" } as SocialCampaign;
  const items = marketingPlanItems([{ id: "abstract", shortName: "Abstract" }], [], [plan, { ...plan, id: "ads-a", platform: "google_ads" }, { ...plan, id: "meta-a", platform: "meta" }, { ...plan, id: "other-company", entityId: "other" }], []);
  assert.equal(items.length, 3);
  const filters = { month: "2026-11", brandId: "abstract", kind: "seo", program: "all" };
  assert.deepEqual(filterMarketingPlan(items, filters).map(i => i.id), ["social-seo-a"]);
  assert.deepEqual(filterMarketingPlan(items, { ...filters, kind: "google_ads" }).map(i => i.id), ["social-ads-a"]);
  assert.deepEqual(filterMarketingPlan(items, { ...filters, kind: "social" }).map(i => i.id), ["social-meta-a"]);
  assert.equal(marketingKindLabel.google_ads, "Google Ads");
  assert.equal(marketingKindLabel.seo, "SEO");
  assert.ok(items.every(i => i.planningOnly && i.status === "draft"));
});
