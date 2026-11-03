// Read-only artifact audit. First build with: npx vite build --configLoader native --manifest
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const manifest = JSON.parse(
  readFileSync(new URL('../dist/.vite/manifest.json', import.meta.url), 'utf8'),
);
const visited = new Set();
function visit(key) {
  if (visited.has(key)) return;
  if (!manifest[key]) throw new Error('Missing expected build entry');
  visited.add(key);
  // Dynamic imports are intentionally excluded: they are separate route entry points.
  for (const dependency of manifest[key].imports ?? []) visit(dependency);
}
visit('index.html');
visit('src/pages/public/LandingPage.tsx');
if (
  [...visited].some((key) =>
    /AuthenticatedLayout|AppShell|DashboardPage|practice-|puzzles-|query-/u.test(key),
  )
)
  throw new Error('Personal application code leaked into public static imports');
const files = [...visited].map((key) => manifest[key].file);
let bytes = 0,
  gzipBytes = 0;
for (const file of files) {
  const data = readFileSync(new URL(`../dist/${file}`, import.meta.url));
  bytes += data.length;
  gzipBytes += gzipSync(data).length;
}
console.log(
  JSON.stringify(
    { publicStaticImportFiles: files, bytes, gzipBytes, privateRoutesIncluded: false },
    null,
    2,
  ),
);
