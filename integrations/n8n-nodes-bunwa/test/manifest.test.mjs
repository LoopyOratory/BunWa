// Checks the package manifest and that every path the manifest declares exists
// in the build output. `npm test` runs `npm run build` before `node --test test/`,
// so the dist files are expected to be present here.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

test('package.json carries the n8n community node keyword', () => {
	assert.ok(Array.isArray(pkg.keywords), 'package.json must have a keywords array');
	assert.ok(
		pkg.keywords.includes('n8n-community-node-package'),
		'package.json must include the n8n-community-node-package keyword',
	);
});

test('package.json declares n8n API version 1', () => {
	assert.ok(pkg.n8n, 'package.json must have an n8n block');
	assert.equal(pkg.n8n.n8nNodesApiVersion, 1);
});

test('every declared credential and node path exists after the build', () => {
	const declared = [...(pkg.n8n.credentials ?? []), ...(pkg.n8n.nodes ?? [])];
	assert.ok(declared.length > 0, 'the n8n block must declare at least one credential and one node');

	const missing = declared.filter((entry) => !existsSync(join(packageRoot, entry)));
	assert.deepEqual(
		missing,
		[],
		`Missing built files: ${missing.join(', ')}. Run npm run build before the tests.`,
	);
});

test('dist/index.js exports BunWa and BunWaTrigger', async () => {
	const entry = join(packageRoot, 'dist/index.js');
	assert.ok(existsSync(entry), 'dist/index.js is missing. Run npm run build before the tests.');

	const mod = await import(pathToFileURL(entry).href);
	const merged = { ...(mod.default ?? {}), ...mod };
	assert.equal(typeof merged.BunWa, 'function', 'dist/index.js must export the BunWa class');
	assert.equal(typeof merged.BunWaTrigger, 'function', 'dist/index.js must export the BunWaTrigger class');
});
