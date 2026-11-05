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

test("apply tolerates 0.2.1 network.resolve and 0.2.2-rc.1+ resolve-free http providers", async () => {
  const { registerHooks } = await import("node:module");
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "@deepseek-ai/schemastery") {
        return {
          url: "data:text/javascript,export default { object: (s) => s, string: () => ({ default: () => ({ volatile: () => ({}) }) }) };",
          shortCircuit: true,
        };
      }
      if (specifier === "@deepseek-ai/dsh-web") {
        return {
          url: "data:text/javascript,export class WebError extends Error { constructor(m, c) { super(m); this.code = c; } }",
          shortCircuit: true,
        };
      }
      return nextResolve(specifier, context);
    },
  });
  const { apply } = await import("../lib/index.js");
  const cleanups = [];
  const providers = new Map();
  const ctx = {
    web: {
      fetchProviders: providers,
      registerFetchProvider(provider) {
        providers.set(provider.id, provider);
        return () => providers.delete(provider.id);
      },
    },
    effect(fn) {
      cleanups.push(fn());
    },
  };
  const config = { hosts: { get: () => "example.com" } };

  const provider022 = { id: "http", fetch: async () => ({}) };
  providers.set("http", provider022);
  assert.doesNotThrow(() => apply(ctx, config));
  assert.equal(provider022.__dshFetchAllowlist, true);

  let fallbackCalls = 0;
  const provider021 = {
    id: "http",
    network: {
      resolve: async (hostname) => {
        fallbackCalls += 1;
        return [{ address: "93.184.216.34", family: 4, hostname }];
      },
    },
  };
  ctx.web.registerFetchProvider(provider021);
  assert.equal(provider021.__dshFetchAllowlist, true);
  await provider021.network.resolve("other.example.org");
  assert.equal(fallbackCalls, 1);

  for (const cleanup of cleanups) cleanup?.();
});
