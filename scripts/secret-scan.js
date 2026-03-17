/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");

const TEXT_EXTENSIONS = new Set([
  ".env",
  ".example",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".txt",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml"
]);

function isPlaceholder(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return (
    !normalized ||
    normalized.includes("<") ||
    normalized.includes("replace") ||
    normalized.includes("example") ||
    normalized.includes("changeme") ||
    normalized.includes("your-") ||
    normalized === "null" ||
    normalized === "undefined"
  );
}

function isTextCandidate(filePath) {
  const base = path.basename(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();
  return (
    TEXT_EXTENSIONS.has(ext) ||
    base === ".env" ||
    base.startsWith(".env.") ||
    base === "dockerfile"
  );
}

function getCandidateFiles(rootDir, currentDir = "") {
  const absoluteDir = path.join(rootDir, currentDir);
  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
  const files = [];

  entries.forEach((entry) => {
    const relativePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "dist") return;
      files.push(...getCandidateFiles(rootDir, relativePath));
      return;
    }

    files.push(relativePath);
  });

  return files;
}

function scanAssignments(filePath, lines, findings) {
  const assignmentPattern = /\b(DATABASE_URL|JWT_SECRET|ACCESS_CODE)\b\s*[:=]\s*("?[^"\r\n#]+"?|'?[^'\r\n#]+'?)/;

  lines.forEach((line, index) => {
    if (line.includes("process.env.")) return;
    const match = line.match(assignmentPattern);
    if (!match) return;
    const secretName = match[1];
    const rawValue = match[2].trim().replace(/^['"]|['"]$/g, "");
    if (isPlaceholder(rawValue)) return;
    findings.push({
      filePath,
      line: index + 1,
      label: `${secretName} with non-placeholder value`
    });
  });
}

function scanContent(filePath, content, findings) {
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(content)) {
    findings.push({
      filePath,
      line: 1,
      label: "Private key material detected"
    });
  }

  const lines = content.split(/\r?\n/);
  scanAssignments(filePath, lines, findings);

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const hasConnectionString = /(postgres|postgresql):\/\/[^/\s:@]+:[^@\s]+@[^/\s]+\/\S+/i.test(trimmed);
    if (hasConnectionString && !isPlaceholder(trimmed)) {
      findings.push({
        filePath,
        line: index + 1,
        label: "Potential live Postgres connection string"
      });
    }
  });
}

function main() {
  const findings = [];
  const trackedFiles = getCandidateFiles(process.cwd());

  trackedFiles.forEach((filePath) => {
    if (!isTextCandidate(filePath)) return;
    let content;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      return;
    }
    scanContent(filePath, content, findings);
  });

  if (findings.length) {
    console.error("Tracked secret scan failed:");
    findings.forEach((finding) => {
      console.error(`- ${finding.filePath}:${finding.line} ${finding.label}`);
    });
    process.exit(1);
  }

  console.log("Tracked secret scan passed.");
}

main();
