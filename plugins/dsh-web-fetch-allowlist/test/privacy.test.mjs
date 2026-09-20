import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("distributed configuration starts with an empty allowlist", () => {
  const patch = read("../cordis.patch.yml");
  assert.match(patch, /^        hosts: ""$/m);
  assert.equal((patch.match(/^\s*hosts:/gm) ?? []).length, 1);
  assert.doesNotMatch(patch, /https?:\/\/|\*\./);
  assert.match(read("../lib/index.js"), /hosts: z\.string\(\)\.default\(""\)/);
});

test("UI placeholder uses a reserved example domain", () => {
  const client = read("../lib/client.js");
  const placeholders = [...client.matchAll(/placeholder:\s*index === 0 \? "([^"\n]+)" : ""/g)];
  assert.equal(placeholders.length, 1);
  assert.equal(placeholders[0][1], "example.com");
});

test("hostname fixtures only use reserved example domains", () => {
  const fixtures = read("../lib/hosts.test.js");
  const domains = fixtures.match(/(?:[a-z0-9-]+\.)+(?:com|net|org|cn)\b/gi) ?? [];
  assert.ok(domains.length > 0);
  for (const domain of domains) {
    assert.match(domain, /^(?:[a-z0-9-]+\.)*example\.(?:com|net|org)$/i,
      "Use reserved example domains, not personal or organization hosts");
  }
});
