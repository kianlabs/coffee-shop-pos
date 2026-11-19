// Gagal bila folder/file instruksi asisten AI ikut terlacak atau masuk staging git.
// Pemakaian:
//   node scripts/check-no-ai-files.mjs [folder-repo]            -> periksa semua file terlacak (CI)
//   node scripts/check-no-ai-files.mjs --staged [folder-repo]   -> periksa file di staging (pre-commit)
import { execFileSync } from "node:child_process";
import path from "node:path";

const args = process.argv.slice(2);
const staged = args.includes("--staged");
const root = path.resolve(args.find((a) => !a.startsWith("--")) ?? process.cwd());

// Nama folder (di level mana pun) milik alat AI.
const AI_DIRS = new Set(
  [
    ".kiro", ".kilo", ".kilocode", ".claude", ".cursor", ".windsurf", ".continue",
    ".gemini", ".codex", ".roo", ".agents", ".agent", ".junie", ".trae", ".amazonq",
    ".copilot", ".cline",
  ],
);

// Nama file instruksi AI (huruf kecil; perbandingan tanpa memandang huruf besar/kecil).
const AI_FILES = new Set([
  "claude.md", "agents.md", "gemini.md", "qwen.md", ".cursorrules", ".windsurfrules",
  ".clinerules", ".roorules", "copilot-instructions.md",
]);

// Folder instruksi Copilot di dalam .github.
const AI_PATH_PREFIXES = [".github/instructions/", ".github/prompts/", ".github/chatmodes/"];

function isAiInstructionPath(file) {
  const normalized = file.replaceAll("\\", "/").toLowerCase();
  const segments = normalized.split("/");
  const base = segments[segments.length - 1];
  if (AI_FILES.has(base) || base.startsWith(".aider")) {
    return true;
  }
  if (AI_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return true;
  }
  return segments.slice(0, -1).some((segment) => AI_DIRS.has(segment));
}

function listFiles() {
  const gitArgs = staged
    ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]
    : ["ls-files", "-z"];
  const out = execFileSync("git", gitArgs, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\0").filter((p) => p !== "");
}

const offenders = listFiles().filter(isAiInstructionPath);
const scope = staged ? "staging" : "file terlacak";

if (offenders.length > 0) {
  console.error(`check-no-ai-files GAGAL: ${offenders.length} file instruksi AI di ${scope}:`);
  for (const file of offenders) {
    console.error(`  ${file}`);
  }
  console.error("Keluarkan dari git: git rm --cached -r <path> (atau git restore --staged <path>).");
  process.exit(1);
}
console.log(`check-no-ai-files lulus: tidak ada file instruksi AI di ${scope}.`);
