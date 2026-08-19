import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const ignored = new Set([".git", "node_modules", "dist", ".next", ".venv", "coverage"]);
const textExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".py", ".json", ".md", ".yml", ".yaml", ".toml", ".sql", ".example"]);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
  /(?:sk_live_|rk_live_)[0-9a-zA-Z]{16,}/,
  /gh[pousr]_[0-9A-Za-z]{30,}/,
];

async function files(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await files(path)));
    else if (textExtensions.has(extname(entry.name)) || entry.name === "Dockerfile") output.push(path);
  }
  return output;
}

const findings = [];
for (const file of await files(root)) {
  if (file.endsWith("scripts/check-secrets.mjs")) continue;
  const content = await readFile(file, "utf8");
  for (const pattern of patterns) {
    if (pattern.test(content)) findings.push(`${relative(root, file)} matched ${pattern.source}`);
  }
}
if (findings.length > 0) {
  process.stderr.write(`${findings.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Secret pattern scan passed.\n");
}
