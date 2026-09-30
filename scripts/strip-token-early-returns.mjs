/**
 * Remove cookie-blocking `if (!token) return` gates after getAuthToken().
 * Fetch interceptor + cookies authenticate when memory JWT is null.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'src');

const SKIP = new Set([
  'pages/auth/login.tsx',
  'lib/title-case.ts',
  'lib/auth-utils.ts',
]);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(full);
  }
  return out;
}

// Simple: const token = getAuthToken();\n      if (!token) return;
const SIMPLE =
  /(const\s+token\s*=\s*getAuthToken\(\)\s*;)\s*\n(\s*)if\s*\(\s*!token\s*\)\s*return\s*;/g;

// Redirect-to-signin blocks (keep attempting /api/auth/me with cookies)
const REDIRECT_BLOCK =
  /(const\s+token\s*=\s*getAuthToken\(\)\s*;)\s*\n(\s*)if\s*\(\s*!token\s*\)\s*\{[\s\S]*?(?:location\.href\s*=\s*['"]\/signin['"]|setLocation\(\s*['"]\/signin['"]\s*\)|window\.location[^\n]*signin)[\s\S]*?return\s*;\s*\}/g;

// "No auth token" early exit that skips fetch (not redirect)
const NO_TOKEN_LOG_RETURN =
  /(const\s+token\s*=\s*getAuthToken\(\)\s*;)\s*\n(\s*)if\s*\(\s*!token\s*\)\s*\{[\s\S]{0,400}?return\s*;\s*\}/g;

let changed = 0;
const report = [];

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (SKIP.has(rel) || rel.endsWith('/auth-utils.ts')) continue;

  let src = fs.readFileSync(file, 'utf8');
  if (!src.includes('getAuthToken()')) continue;
  const before = src;

  src = src.replace(SIMPLE, '$1');

  src = src.replace(REDIRECT_BLOCK, '$1');

  // Only strip no-token blocks that look like auth failures (not business logic)
  src = src.replace(NO_TOKEN_LOG_RETURN, (match, decl) => {
    if (/No auth token|sign.?in again|redirecting to signin|Token found/i.test(match)) {
      return decl;
    }
    // Keep short loading resets that still skip fetch — convert those that only set loading false
    if (/setIsLoading|setLoading|setIsLoadingUser|setIsLoadingEduott/i.test(match) && /return\s*;/.test(match)) {
      return decl;
    }
    return match;
  });

  // Collapse duplicated token fallbacks
  src = src.replace(
    /getAuthToken\(\)(\s*\|\|\s*getAuthToken\(\))+/g,
    'getAuthToken()',
  );

  if (src !== before) {
    fs.writeFileSync(file, src);
    changed++;
    report.push(rel);
  }
}

console.log(`Updated ${changed} files`);
for (const r of report.sort((a, b) => a.localeCompare(b))) console.log(' -', r);
