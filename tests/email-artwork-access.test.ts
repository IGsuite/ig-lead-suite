import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

test("approved recipient artwork is public while neighboring files and CRM data require login", () => {
  const previous = process.env.AUTH_REQUIRED;
  process.env.AUTH_REQUIRED = "true";
  const request = (path: string) => proxy(new NextRequest(`https://www.igleadsuite.com${path}`));
  try {
    for (const slug of ["heloc-business-v3", "sba-7a-v1", "sba-504-v1", "sba-express-v1", "business-line-of-credit-v1", "revenue-based-financing-v1", "term-loans-v1", "equipment-financing-v1", "invoice-factoring-v1", "small-business-loans-v1"]) {
      const path = `/email-assets/abstract/${slug}.png`;
      assert.equal(request(path).headers.get("x-middleware-next"), "1", path);
      for (const privatePath of [path + ".extra", path + "/private.png"]) {
        assert.equal(request(privatePath).status, 307, privatePath);
      }
    }
    for (const path of ["/email-assets/abstract/private.png", "/email-assets/abstract/", "/email-assets/another-brand/sba-7a-v1.png", "/campaigns"]) {
      assert.equal(request(path).status, 307, path);
    }
    for (const path of ["/api/ads/assets/private/file", "/api/leads"]) {
      assert.equal(request(path).status, 401, path);
    }
  } finally {
    if (previous === undefined) delete process.env.AUTH_REQUIRED;
    else process.env.AUTH_REQUIRED = previous;
  }
});
