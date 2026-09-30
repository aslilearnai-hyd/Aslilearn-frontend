/**
 * One-shot codemod: replace localStorage auth token reads with getAuthToken().
 * Ensures cookie-first sessions work across student / admin / teacher / super-admin.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'src');

const TOKEN_READ_RE =
  /localStorage\.getItem\(\s*['"](?:authToken|superAdminToken|token)['"]\s*\)/g;

const IMPORT_FROM_AUTH = /import\s*\{([^}]*)\}\s*from\s*['"]@\/lib\/auth-utils['"]\s*;?/;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'dist') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(full);
  }
  return out;
}

function ensureGetAuthTokenImport(src) {
  if (IMPORT_FROM_AUTH.test(src)) {
    return src.replace(IMPORT_FROM_AUTH, (m, names) => {
      if (/\bgetAuthToken\b/.test(names)) return m.endsWith(';') ? m : `${m};`;
      const trimmed = names.trim().replace(/,\s*$/, '');
      return `import { ${trimmed ? `${trimmed}, ` : ''}getAuthToken } from '@/lib/auth-utils';`;
    });
  }

  const lines = src.split('\n');
  let lastImport = -1;
  for (let i = 0; i < Math.min(lines.length, 80); i++) {
    const line = lines[i];
    if (/^import\s/.test(line) || /^\/\/ @ts-nocheck/.test(line)) {
      if (/^import\s/.test(line)) lastImport = i;
      continue;
    }
    if (lastImport >= 0 && line.trim() !== '' && !line.startsWith('//')) break;
  }
  const stmt = "import { getAuthToken } from '@/lib/auth-utils';";
  if (lastImport >= 0) {
    lines.splice(lastImport + 1, 0, stmt);
    return lines.join('\n');
  }
  return `${stmt}\n${src}`;
}

const files = walk(ROOT);
let changed = 0;
const report = [];

for (const file of files) {
  if (file.replace(/\\/g, '/').endsWith('/lib/auth-utils.ts')) continue;

  const src = fs.readFileSync(file, 'utf8');
  if (!TOKEN_READ_RE.test(src)) continue;
  TOKEN_READ_RE.lastIndex = 0;

  let next = src.replace(TOKEN_READ_RE, 'getAuthToken()');
  if (next === src) continue;

  next = ensureGetAuthTokenImport(next);

  fs.writeFileSync(file, next);
  changed++;
  report.push(path.relative(ROOT, file).replace(/\\/g, '/'));
}

console.log(`Updated ${changed} files`);
for (const r of report.sort((a, b) => a.localeCompare(b))) console.log(' -', r);
