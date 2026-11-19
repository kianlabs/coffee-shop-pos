// Minimal YAML subset reader for api/openapi.yaml (no YAML package is installed).
// Supports: block maps and lists, flow [..] / {..}, quoted keys and strings, `|` and `>` block
// scalars, full-line comments. Not supported: anchors, tags, multi-line plain scalars.
const KEY = /^(?:"([^"]*)"|'([^']*)'|([^\s"'#\-[{][^:]*?|-[^\s][^:]*?)):(?:\s+(.*))?$/;

function scalar(text) {
  const t = text.trim();
  if (t === "" || t === "null" || t === "~") return null;
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (t.startsWith('"')) return JSON.parse(t);
  if (t.startsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
  return t;
}

function parseFlow(text) {
  let i = 0;
  const ws = () => { while (text[i] === " ") i++; };
  const atom = () => {
    ws();
    if (text[i] === "[") return arr();
    if (text[i] === "{") return obj();
    if (text[i] === '"') {
      let j = i + 1;
      while (text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      const s = JSON.parse(text.slice(i, j + 1));
      i = j + 1;
      return s;
    }
    const start = i;
    while (i < text.length && !",]}:".includes(text[i])) i++;
    return scalar(text.slice(start, i));
  };
  const arr = () => {
    const out = [];
    i++;
    ws();
    while (text[i] !== "]") {
      if (i >= text.length) throw new Error("flow sequence tidak ditutup");
      out.push(atom());
      ws();
      if (text[i] === ",") i++;
      ws();
    }
    i++;
    return out;
  };
  const obj = () => {
    const out = {};
    i++;
    ws();
    while (text[i] !== "}") {
      if (i >= text.length) throw new Error("flow mapping tidak ditutup");
      const k = atom();
      ws();
      if (text[i] !== ":") throw new Error("flow mapping: ':' tidak ditemukan");
      i++;
      out[String(k)] = atom();
      ws();
      if (text[i] === ",") i++;
      ws();
    }
    i++;
    return out;
  };
  const v = atom();
  ws();
  if (i < text.length) throw new Error(`flow: sisa teks tidak terduga "${text.slice(i)}"`);
  return v;
}

function value(text) {
  const t = text.trim();
  return t.startsWith("[") || t.startsWith("{") ? parseFlow(t) : scalar(t);
}

export function parseYaml(source) {
  const lines = source.split(/\r?\n/).map((raw) => {
    const text = raw.trim();
    return { raw, indent: raw.length - raw.trimStart().length, text, skip: text === "" || text.startsWith("#") };
  });
  const next = (i) => { while (i < lines.length && lines[i].skip) i++; return i; };

  function block(i, indent) {
    const j = next(i);
    if (j >= lines.length) return [null, j];
    return lines[j].text === "-" || lines[j].text.startsWith("- ") ? list(j, indent) : map(j, indent);
  }

  function list(i, indent) {
    const out = [];
    let j = next(i);
    while (j < lines.length && lines[j].indent === indent && (lines[j].text === "-" || lines[j].text.startsWith("- "))) {
      const rest = lines[j].text.slice(1).trim();
      if (rest === "") {
        const [v, k] = block(j + 1, lines[next(j + 1)]?.indent ?? indent + 2);
        out.push(v);
        j = next(k);
      } else if (KEY.test(rest)) {
        lines[j] = { ...lines[j], indent: indent + 2, text: rest };
        const [v, k] = map(j, indent + 2);
        out.push(v);
        j = next(k);
      } else {
        out.push(value(rest));
        j = next(j + 1);
      }
    }
    return [out, j];
  }

  function map(i, indent) {
    const out = {};
    let j = next(i);
    while (j < lines.length && lines[j].indent === indent && !lines[j].text.startsWith("- ")) {
      const m = KEY.exec(lines[j].text);
      if (!m) throw new Error(`baris ${j + 1}: bukan "kunci: nilai": ${lines[j].text}`);
      const key = m[1] ?? m[2] ?? m[3];
      const rest = (m[4] ?? "").trim();
      if (rest === "|" || rest === ">" || rest === "|-" || rest === ">-") {
        const parts = [];
        let k = j + 1;
        while (k < lines.length && (lines[k].text === "" || lines[k].indent > indent)) parts.push(lines[k++].raw.trim());
        out[key] = parts.join(rest.startsWith("|") ? "\n" : " ").trim();
        j = k;
      } else if (rest === "") {
        const k = next(j + 1);
        const child = lines[k];
        const nested = child && (child.indent > indent || (child.indent === indent && child.text.startsWith("- ")));
        if (nested) {
          const [v, e] = block(k, child.indent);
          out[key] = v;
          j = next(e);
        } else {
          out[key] = null;
          j = k;
        }
      } else {
        out[key] = value(rest);
        j = next(j + 1);
      }
    }
    return [out, j];
  }

  const [root] = block(0, 0);
  return root;
}
