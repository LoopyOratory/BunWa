// Live smoke test against a real BunWa server.
//
// Skipped unless both BUNWA_URL and BUNWA_API_KEY are set. When they are set,
// the tests exercise the real API through the node's own code path: a fake
// IExecuteFunctions context provides the credentials and a `helpers.httpRequest`
// implementation backed by fetch.
//
//   BUNWA_URL=http://localhost:3000 BUNWA_API_KEY=... npm test

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.BUNWA_URL;
const apiKey = process.env.BUNWA_API_KEY;
const enabled = Boolean(baseUrl && apiKey);
const skip = enabled ? false : 'BUNWA_URL and BUNWA_API_KEY are not set';

if (!enabled) {
	console.log('live-smoke: skipped. Set BUNWA_URL and BUNWA_API_KEY to run against a real BunWa server.');
}

async function load(relativePath) {
	const absolutePath = join(packageRoot, relativePath);
	assert.ok(existsSync(absolutePath), `${relativePath} is missing. Run npm run build before the tests.`);
	const mod = await import(pathToFileURL(absolutePath).href);
	return { ...(mod.default ?? {}), ...mod };
}

/** Minimal IExecuteFunctions stand-in backed by a real fetch. */
function buildContext({ url, key, parameters = {} }) {
	const values = { ...parameters };
	return {
		getCredentials: async () => ({ baseUrl: url, apiKey: key }),
		getNodeParameter: (name, _itemIndex, fallback) => (name in values ? values[name] : fallback),
		getNode: () => ({
			id: 'live-smoke',
			name: 'BunWa',
			type: 'n8n-nodes-bunwa.bunWa',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		getInputData: () => [{ json: {} }],
		helpers: {
			httpRequest: async (options) => {
				const requestUrl = new URL(options.url);
				for (const [name, value] of Object.entries(options.qs ?? {})) {
					if (value !== undefined && value !== null) {
						requestUrl.searchParams.set(name, String(value));
					}
				}

				const response = await fetch(requestUrl, {
					method: options.method ?? 'GET',
					headers: options.headers ?? {},
					body: options.body === undefined ? undefined : JSON.stringify(options.body),
				});
				const text = await response.text();
				let body;
				try {
					body = text ? JSON.parse(text) : null;
				} catch {
					body = text;
				}

				if (!response.ok) {
					const error = new Error(`Request failed with status code ${response.status}`);
					error.statusCode = response.status;
					error.httpCode = String(response.status);
					error.response = {
						status: response.status,
						statusText: response.statusText,
						body,
						headers: Object.fromEntries(response.headers),
					};
					throw error;
				}
				return body;
			},
		},
	};
}

test('session list returns an array', { skip }, async () => {
	const { sessionResource } = await load('dist/nodes/BunWa/resources/session.js');
	const ctx = buildContext({ url: baseUrl, key: apiKey, parameters: { returnAll: false, limit: 50 } });

	const result = await sessionResource.execute({ ctx, itemIndex: 0, operation: 'list' });
	assert.ok(Array.isArray(result), `expected an array of sessions, got ${JSON.stringify(result)}`);
});

test('ops version returns an object with a version property', { skip }, async () => {
	const { opsResource } = await load('dist/nodes/BunWa/resources/ops.js');
	const ctx = buildContext({ url: baseUrl, key: apiKey });

	const result = await opsResource.execute({ ctx, itemIndex: 0, operation: 'version' });
	assert.equal(typeof result, 'object', `expected an object, got ${JSON.stringify(result)}`);
	assert.ok(result !== null && 'version' in result, `expected a version property, got ${JSON.stringify(result)}`);
});

test('a wrong API key produces a thrown error', { skip }, async () => {
	const { sessionResource } = await load('dist/nodes/BunWa/resources/session.js');
	const ctx = buildContext({ url: baseUrl, key: `${apiKey}-wrong`, parameters: { returnAll: false, limit: 1 } });

	await assert.rejects(
		() => sessionResource.execute({ ctx, itemIndex: 0, operation: 'list' }),
		(error) => {
			assert.ok(error instanceof Error, 'the rejection must be an Error');
			return true;
		},
	);
});
