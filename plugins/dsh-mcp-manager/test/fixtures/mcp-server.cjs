const { createInterface } = require("node:readline");
const { writeFileSync } = require("node:fs");

if (process.argv[2]) writeFileSync(process.argv[2], String(process.pid));
const silent = process.argv.includes("--silent");
createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line);
  if (silent || request.id === undefined) return;
  let response;
  if (request.method === "initialize") response = {
    protocolVersion: request.params.protocolVersion,
    capabilities: { tools: {} },
    serverInfo: { name: "mcp-manager-test", version: "1.0.0" },
  };
  else if (request.method === "tools/list") response = { tools: [{ name: "echo", description: "test echo", inputSchema: { type: "object", properties: {} } }] };
  else if (request.method === "tools/call") response = { content: [{ type: "text", text: "ok" }] };
  else {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } }) + "\n");
    return;
  }
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: response }) + "\n");
});
