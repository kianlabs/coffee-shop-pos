// Memeriksa CHANGELOG.md berformat Keep a Changelog (Req 23.10, 23.13).
//   node scripts/check-changelog.mjs [folder-repo]
//       -> validasi format saja
//   node scripts/check-changelog.mjs --tag=vX.Y.Z [folder-repo]
//       -> juga gagal bila tidak ada entri [X.Y.Z] yang berisi catatan
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const tagArg = args.find((a) => a.startsWith("--tag="));
const root = path.resolve(args.find((a) => !a.startsWith("--")) ?? process.cwd());

const SEMVER = "\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?";
const TAG_RE = new RegExp(`^v(${SEMVER})$`);
const VERSION_HEADING = new RegExp(`^## \\[(${SEMVER})\\] - (\\d{4}-\\d{2}-\\d{2})\\s*$`);
const CATEGORIES = new Set(["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"]);

const errors = [];
const file = path.join(root, "CHANGELOG.md");

function isRealDate(text) {
  const [y, m, d] = text.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Bandingkan X.Y.Z (abaikan pra-rilis); hasil > 0 bila a lebih baru dari b. */
function compare(a, b) {
  const pa = a.split("-")[0].split(".").map(Number);
  const pb = b.split("-")[0].split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) {
      return pa[i] - pb[i];
    }
  }
  return 0;
}

function parseSections(lines) {
  const sections = [];
  for (const [index, line] of lines.entries()) {
    if (line.startsWith("## ")) {
      sections.push({ heading: line, line: index + 1, body: [] });
    } else if (sections.length > 0) {
      sections[sections.length - 1].body.push(line);
    }
  }
  return sections;
}

function checkCategories(section) {
  for (const line of section.body) {
    if (!line.startsWith("### ")) {
      continue;
    }
    const name = line.slice(4).trim();
    if (!CATEGORIES.has(name)) {
      errors.push(
        `kategori "${name}" tidak valid di ${section.heading} (boleh: ${[...CATEGORIES].join(", ")})`,
      );
    }
  }
}

function hasNotes(section) {
  return section.body.some((l) => /^\s*[-*]\s+\S/.test(l));
}

function checkVersions(sections) {
  const seen = new Set();
  let previous = null;
  for (const section of sections) {
    if (/^## \[Unreleased\]\s*$/.test(section.heading)) {
      continue;
    }
    const match = VERSION_HEADING.exec(section.heading);
    if (!match) {
      errors.push(`baris ${section.line}: judul harus "## [X.Y.Z] - YYYY-MM-DD", ditemukan "${section.heading}"`);
      continue;
    }
    const [, version, date] = match;
    if (!isRealDate(date)) {
      errors.push(`baris ${section.line}: tanggal ${date} bukan tanggal yang valid`);
    }
    if (seen.has(version)) {
      errors.push(`versi ${version} muncul lebih dari sekali`);
    }
    seen.add(version);
    if (previous !== null && compare(version, previous) >= 0) {
      errors.push(`versi ${version} harus lebih lama dari ${previous} (urutan terbaru di atas)`);
    }
    previous = version;
  }
  return seen;
}

function checkTag(sections, versions) {
  const match = TAG_RE.exec(tagArg.slice("--tag=".length));
  if (!match) {
    errors.push(`tag "${tagArg.slice("--tag=".length)}" bukan format vX.Y.Z`);
    return;
  }
  const version = match[1];
  if (!versions.has(version)) {
    errors.push(`tidak ada entri [${version}] di CHANGELOG.md untuk tag v${version}`);
    return;
  }
  const section = sections.find((s) => s.heading.startsWith(`## [${version}]`));
  if (section && !hasNotes(section)) {
    errors.push(`entri [${version}] kosong: tambahkan catatan perubahan`);
  }
}

if (!existsSync(file)) {
  errors.push("CHANGELOG.md tidak ada");
} else {
  const lines = readFileSync(file, "utf8").replaceAll("\r\n", "\n").split("\n");
  const sections = parseSections(lines);
  if (sections.length === 0 || !/^## \[Unreleased\]\s*$/.test(sections[0].heading)) {
    errors.push('bagian "## [Unreleased]" harus menjadi judul "##" pertama');
  }
  const versions = checkVersions(sections);
  for (const section of sections) {
    checkCategories(section);
  }
  if (tagArg) {
    checkTag(sections, versions);
  }
}

if (errors.length > 0) {
  console.error(`check-changelog GAGAL: ${errors.length} masalah:`);
  for (const e of errors) {
    console.error(`  ${e}`);
  }
  process.exit(1);
}
console.log(
  tagArg
    ? `check-changelog lulus: ${tagArg.slice("--tag=".length)} punya entri dan format valid.`
    : "check-changelog lulus: format Keep a Changelog valid.",
);
