// Cross-checks every route the node calls against the BunWa server source.
//
// The server mounts routers in src/api/index.ts under path prefixes, and each
// router file registers relative paths with Hono (`router.get('/:session/...')`).
// This test rebuilds the full server route table from that source text and then
// asserts that every entry of every built `*Routes` map maps to a real route.
// Path parameters are normalised (`{param}` and `:param` both become `*`) and
// compared segment by segment, so a typo in a literal path segment fails.

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverApiDir = resolve(packageRoot, '../../src/api');

/** Reads router mounts from src/api/index.ts, e.g. `/api` -> createChatsRouter. */
function readMounts() {
	const source = readFileSync(join(serverApiDir, 'index.ts'), 'utf8');
	const imports = new Map();
	for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*'\.\/([^']+)'/g)) {
		for (const name of match[1]
			.split(',')
			.map((part) => part.trim())
			.filter(Boolean)) {
			imports.set(name, match[2]);
		}
	}

	const mounts = [];
	for (const match of source.matchAll(/router\.route\(\s*'([^']+)'\s*,\s*(\w+)\(\)\s*\)/g)) {
		mounts.push({ prefix: match[1], create: match[2], file: imports.get(match[2]) });
	}
	return mounts;
}

/** Extracts the `router.<method>('<path>'` registrations of one router factory. */
function routesInFunction(source, createName) {
	const start = source.indexOf(`export function ${createName}(`);
	assert.notEqual(start, -1, `could not find ${createName} in the server source`);
	const next = source.indexOf('\nexport function ', start + 1);
	const body = source.slice(start, next === -1 ? source.length : next);

	const routes = [];
	for (const match of body.matchAll(/router\.(get|post|put|delete|patch|all)\(\s*['"]([^'"]+)['"]/g)) {
		routes.push({ method: match[1].toUpperCase(), path: match[2] });
	}
	return routes;
}

/** Builds the complete server route table as `METHOD /path` strings. */
function readServerRoutes() {
	assert.ok(existsSync(serverApiDir), `BunWa server source not found at ${serverApiDir}`);

	const routes = [];
	for (const mount of readMounts()) {
		assert.ok(mount.file, `src/api/index.ts mounts ${mount.create} but does not import it`);
		const source = readFileSync(join(serverApiDir, `${mount.file}.ts`), 'utf8');
		for (const route of routesInFunction(source, mount.create)) {
			routes.push({
				method: route.method,
				path: route.path === '/' ? mount.prefix : `${mount.prefix}${route.path}`,
				source: `${mount.file}.ts`,
			});
		}
	}
	return routes;
}

/** Turns `{session}` and `:session` into `*` so only the path shape is compared. */
function normalisePath(path) {
	return path
		.split('/')
		.map((segment) => (segment.startsWith(':') || /^\{.+\}$/.test(segment) ? '*' : segment))
		.join('/');
}

function levenshtein(a, b) {
	let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
	for (let i = 1; i <= a.length; i += 1) {
		const current = [i];
		for (let j = 1; j <= b.length; j += 1) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
		}
		previous = current;
	}
	return previous[b.length];
}

function closestRoute(needle, candidates) {
	let best = candidates[0];
	let bestDistance = Infinity;
	for (const candidate of candidates) {
		const distance = levenshtein(needle, candidate.norm);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = candidate;
		}
	}
	return best;
}

/** Loads the built resource modules and pairs each `*Resource` with its `*Routes` map. */
async function loadResourceRouteMaps() {
	const resourcesDir = join(packageRoot, 'dist/nodes/BunWa/resources');
	assert.ok(existsSync(resourcesDir), 'dist/nodes/BunWa/resources is missing. Run npm run build before the tests.');

	const files = readdirSync(resourcesDir).filter((file) => file.endsWith('.js') && file !== 'index.js');
	return Promise.all(
		files.map(async (file) => {
			const mod = await import(pathToFileURL(join(resourcesDir, file)).href);
			const merged = { ...(mod.default ?? {}), ...mod };
			const resource = Object.entries(merged).find(
				([name, value]) => name.endsWith('Resource') && value && typeof value === 'object',
			);
			const routes = Object.entries(merged).find(
				([name, value]) => name.endsWith('Routes') && value && typeof value === 'object',
			);
			assert.ok(resource, `${file} must export a *Resource module`);
			assert.ok(routes, `${file} must export a *Routes map`);
			return { file, resource: resource[1], routes: routes[1], routesName: routes[0] };
		}),
	);
}

const serverRoutes = readServerRoutes();

test('the server route table parses into a plausible number of routes', () => {
	assert.ok(
		serverRoutes.length > 50,
		`expected the server source to yield many routes, parsed only ${serverRoutes.length}`,
	);
});

test('every node route exists in the BunWa server source', async () => {
	const maps = await loadResourceRouteMaps();
	const candidates = serverRoutes.map((route) => ({
		...route,
		norm: `${route.method} ${normalisePath(route.path)}`,
	}));

	const failures = [];
	let checked = 0;
	for (const { file, resource, routes, routesName } of maps) {
		for (const [operation, route] of Object.entries(routes)) {
			checked += 1;
			const [method, path] = String(route).split(/\s+/);
			const nodeNorm = `${method.toUpperCase()} ${normalisePath(path)}`;
			if (candidates.some((candidate) => candidate.norm === nodeNorm)) continue;

			const closest = closestRoute(nodeNorm, candidates);
			failures.push(
				`  ${resource.value ?? file} / ${operation} (${routesName}): node route "${route}" has no matching server route.` +
					` Closest server route: "${closest.method} ${closest.path}" (${closest.source}).`,
			);
		}
	}

	if (failures.length > 0) {
		console.error(`\nn8n-nodes-bunwa routes missing from the server (${failures.length}):\n${failures.join('\n')}\n`);
	}
	assert.equal(failures.length, 0, `${failures.length} node route(s) do not exist in the server source`);
	assert.ok(checked > 0, 'no routes were checked, which means no *Routes maps were found in dist');
});
