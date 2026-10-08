import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
await build({
  entryPoints: ['src/house-3d-card.js'], bundle: true, minify: true, format: 'esm', target: 'es2020',
  outfile: 'dist/house-3d-card.js', legalComments: 'none', define: { __VERSION__: JSON.stringify(version) },
  banner: { js: `/* house-3d-card v${version} — MIT — bundles three.js (MIT) */` },
});
console.log('built dist/house-3d-card.js v' + version);
