import assert from "node:assert/strict";
import test from "node:test";
import { hostMatches, parseHostLine, parseHostsText, rowsToHostsText } from "./hosts.js";

test("parseHostLine accepts domains, wildcards, and URLs", () => {
	assert.equal(parseHostLine("api.test.example.com"), "api.test.example.com");
	assert.equal(parseHostLine("*.example.com"), "*.example.com");
	assert.equal(
		parseHostLine("https://api.test.example.com/docs/index.html#/docs"),
		"api.test.example.com",
	);
	assert.equal(parseHostLine("# comment"), null);
	assert.equal(parseHostLine("  "), null);
});

test("hostMatches treats bare and starred entries as suffix matches", () => {
	const list = parseHostsText("*.example.com\ndocs.example.org\n");
	assert.equal(hostMatches("api.test.example.com", list), true);
	assert.equal(hostMatches("example.com", list), true);
	assert.equal(hostMatches("docs.example.org", list), true);
	assert.equal(hostMatches("evil.example", list), false);
});

test("rowsToHostsText de-duplicates", () => {
	assert.equal(rowsToHostsText(["example.com", "EXAMPLE.com", ""]), "example.com");
});
