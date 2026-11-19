// Tes skrip penjaga repositori (check-brand, check-no-apk, check-no-ai-files)
// dengan repo git sementara: fixture lulus dan gagal. Dipakai `npm test`.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const BRAND_WORD = ["Rahar", "djo"].join("");

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  if (actual === expected) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${name} :: dapat ${actual}, harusnya ${expected}`);
  }
}

function git(cwd, args) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

/** Buat repo sementara; `tracked` di-commit, `untracked` hanya di disk, `staged` di-add tanpa commit. */
function makeRepo({ tracked = {}, untracked = {}, staged = {} }) {
  const dir = mkdtempSync(path.join(tmpdir(), "pos-guard-"));
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "t@example.com"]);
  git(dir, ["config", "user.name", "tester"]);
  const write = (files) => {
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      writeFileSync(path.join(dir, file), content);
    }
  };
  write({ "README.md": "ok\n", ...tracked });
  git(dir, ["add", "-f", "."]);
  git(dir, ["-c", "core.hooksPath=/dev/null", "commit", "-q", "-m", "init"]);
  write(untracked);
  write(staged);
  if (Object.keys(staged).length > 0) {
    git(dir, ["add", "-f", ...Object.keys(staged)]);
  }
  return dir;
}

function run(script, dir, extra = []) {
  const res = spawnSync("node", [path.join(ROOT, "scripts", script), ...extra, dir], {
    encoding: "utf8",
  });
  return res.status;
}

function withRepo(spec, fn) {
  const dir = makeRepo(spec);
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("\n[Guard] check-brand");
withRepo({ tracked: { "src/a.ts": "const x = 1;\n" } }, (d) =>
  check("repo bersih lulus", run("check-brand.mjs", d), 0));
withRepo({ tracked: { "src/a.ts": `const n = "${BRAND_WORD} Coffee";\n` } }, (d) =>
  check("isi file memuat identitas klien gagal", run("check-brand.mjs", d), 1));
withRepo({ tracked: { [`docs/${BRAND_WORD.toLowerCase()}.md`]: "x\n" } }, (d) =>
  check("nama file memuat identitas klien gagal", run("check-brand.mjs", d), 1));
withRepo({ tracked: { "src/a.ts": "ok\n" }, untracked: { "notes.txt": BRAND_WORD } }, (d) =>
  check("file tak terlacak diabaikan", run("check-brand.mjs", d), 0));
withRepo({ tracked: { ".kiro/specs/r.md": `${BRAND_WORD}\n` } }, (d) =>
  check("folder spesifikasi dikecualikan", run("check-brand.mjs", d), 0));

console.log("\n[Guard] check-no-apk");
withRepo({ tracked: { "src/a.ts": "x\n" } }, (d) =>
  check("tanpa APK lulus", run("check-no-apk.mjs", d), 0));
withRepo({ tracked: { "release/app.apk": "bin\n" } }, (d) =>
  check("APK terlacak gagal", run("check-no-apk.mjs", d), 1));
withRepo({ tracked: { "RELEASE/APP.APK": "bin\n" } }, (d) =>
  check("ekstensi huruf besar gagal", run("check-no-apk.mjs", d), 1));
withRepo({ tracked: { "src/a.ts": "x\n" }, untracked: { "app.apk": "bin\n" } }, (d) =>
  check("APK tak terlacak lulus", run("check-no-apk.mjs", d), 0));

console.log("\n[Guard] check-no-ai-files");
withRepo({ tracked: { "src/a.ts": "x\n", ".github/workflows/ci.yml": "name: CI\n" } }, (d) =>
  check("repo normal lulus", run("check-no-ai-files.mjs", d), 0));
withRepo({ tracked: { ".kiro/specs/x/requirements.md": "x\n" } }, (d) =>
  check(".kiro terlacak gagal", run("check-no-ai-files.mjs", d), 1));
withRepo({ tracked: { "CLAUDE.md": "x\n" } }, (d) =>
  check("CLAUDE.md terlacak gagal", run("check-no-ai-files.mjs", d), 1));
withRepo({ tracked: { "packages/app/AGENTS.md": "x\n" } }, (d) =>
  check("AGENTS.md di subfolder gagal", run("check-no-ai-files.mjs", d), 1));
withRepo({ tracked: { "web/.cursor/rules/a.mdc": "x\n" } }, (d) =>
  check(".cursor bersarang gagal", run("check-no-ai-files.mjs", d), 1));
withRepo({ tracked: { ".github/copilot-instructions.md": "x\n" } }, (d) =>
  check("copilot-instructions gagal", run("check-no-ai-files.mjs", d), 1));
withRepo({ tracked: { ".aider.chat.history.md": "x\n" } }, (d) =>
  check("berkas aider gagal", run("check-no-ai-files.mjs", d), 1));
withRepo({ tracked: { "docs/agents-guide.md": "x\n" } }, (d) =>
  check("nama mirip tapi bukan instruksi AI lulus", run("check-no-ai-files.mjs", d), 0));
withRepo({ tracked: { "src/a.ts": "x\n" }, untracked: { ".kiro/a.md": "x\n" } }, (d) =>
  check("file AI tak terlacak lulus", run("check-no-ai-files.mjs", d), 0));
withRepo({ tracked: { "src/a.ts": "x\n" }, staged: { ".kiro/a.md": "x\n" } }, (d) =>
  check("--staged menolak file AI yang di-add paksa", run("check-no-ai-files.mjs", d, ["--staged"]), 1));
withRepo({ tracked: { "src/a.ts": "x\n" }, staged: { "src/b.ts": "y\n" } }, (d) =>
  check("--staged dengan file biasa lulus", run("check-no-ai-files.mjs", d, ["--staged"]), 0));

console.log("\n[Guard] check-changelog");
const GOOD_LOG = [
  "# Changelog", "", "## [Unreleased]", "", "### Added", "- next thing", "",
  "## [1.1.0] - 2026-02-01", "", "### Fixed", "- a bug", "",
  "## [1.0.0] - 2026-01-01", "", "### Added", "- first release", "",
].join("\n");
withRepo({ tracked: { "CHANGELOG.md": GOOD_LOG } }, (d) => {
  check("format valid lulus", run("check-changelog.mjs", d), 0);
  check("tag dengan entri lulus", run("check-changelog.mjs", d, ["--tag=v1.1.0"]), 0);
  check("tag tanpa entri gagal", run("check-changelog.mjs", d, ["--tag=v2.0.0"]), 1);
  check("tag salah format gagal", run("check-changelog.mjs", d, ["--tag=1.1.0"]), 1);
  check("tag berisi karakter shell gagal", run("check-changelog.mjs", d, ["--tag=v1.1.0$(id)"]), 1);
});
withRepo({ tracked: { "CHANGELOG.md": GOOD_LOG.replace("## [Unreleased]", "## [Next]") } }, (d) =>
  check("tanpa [Unreleased] gagal", run("check-changelog.mjs", d), 1));
withRepo({ tracked: { "CHANGELOG.md": GOOD_LOG.replace("### Fixed", "### Tested") } }, (d) =>
  check("kategori tidak valid gagal", run("check-changelog.mjs", d), 1));
withRepo({ tracked: { "CHANGELOG.md": GOOD_LOG.replace("2026-02-01", "2026-02-30") } }, (d) =>
  check("tanggal mustahil gagal", run("check-changelog.mjs", d), 1));
withRepo({ tracked: { "CHANGELOG.md": GOOD_LOG.replace("- a bug", "") } }, (d) =>
  check("entri rilis kosong gagal untuk tag", run("check-changelog.mjs", d, ["--tag=v1.1.0"]), 1));
withRepo({ tracked: { "CHANGELOG.md": GOOD_LOG.replace("## [1.1.0] - 2026-02-01", "## [0.9.0] - 2026-02-01") } }, (d) =>
  check("urutan versi salah gagal", run("check-changelog.mjs", d), 1));
withRepo({ tracked: { "src/a.ts": "x\n" } }, (d) =>
  check("tanpa CHANGELOG gagal", run("check-changelog.mjs", d), 1));

console.log(`\n=== GUARD ${fail === 0 ? `LULUS (${pass})` : `${fail} GAGAL dari ${pass + fail}`} ===`);
process.exit(fail === 0 ? 0 : 1);
