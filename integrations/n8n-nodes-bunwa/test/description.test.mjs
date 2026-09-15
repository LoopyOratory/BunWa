// Validates the compiled node descriptions: structure, resource/operation
// selectors, consistency between operation values and the `*Routes` maps, and
// the trigger's webhook declaration. Requires `npm run build` first.

import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function load(relativePath) {
	const absolutePath = join(packageRoot, relativePath);
	assert.ok(existsSync(absolutePath), `${relativePath} is missing. Run npm run build before the tests.`);
	const mod = await import(pathToFileURL(absolutePath).href);
	return { ...(mod.default ?? {}), ...mod };
}

const actionModule = await load('dist/nodes/BunWa/BunWa.node.js');
const triggerModule = await load('dist/nodes/BunWaTrigger/BunWaTrigger.node.js');
const { RESOURCES } = await load('dist/nodes/BunWa/resources/index.js');

/** Collects the `*Routes` map of every built resource module, keyed by resource value. */
async function loadResourceRouteMaps() {
	const resourcesDir = join(packageRoot, 'dist/nodes/BunWa/resources');
	const files = readdirSync(resourcesDir).filter((file) => file.endsWith('.js') && file !== 'index.js');
	const maps = new Map();
	for (const file of files) {
		const mod = await load(`dist/nodes/BunWa/resources/${file}`);
		for (const [name, value] of Object.entries(mod)) {
			if (!name.endsWith('Routes') || !value || typeof value !== 'object') continue;
			const base = name.slice(0, -'Routes'.length);
			maps.set(mod[`${base}Resource`]?.value ?? base, value);
		}
	}
	return maps;
}

function assertBaseDescription(description, label) {
	assert.equal(typeof description.name, 'string', `${label} description.name must be a string`);
	assert.ok(description.name, `${label} description.name must not be empty`);
	assert.equal(typeof description.displayName, 'string', `${label} description.displayName must be a string`);
	assert.ok(description.displayName, `${label} description.displayName must not be empty`);
	assert.ok(description.icon, `${label} description.icon must be set`);
	assert.ok(description.version, `${label} description.version must be set`);
	assert.ok(description.defaults && typeof description.defaults.name === 'string', `${label} description.defaults.name must be set`);
	assert.ok(Array.isArray(description.inputs), `${label} description.inputs must be an array`);
	assert.ok(Array.isArray(description.outputs), `${label} description.outputs must be an array`);
	assert.ok(Array.isArray(description.credentials) && description.credentials.length > 0, `${label} must declare credentials`);
	assert.equal(description.credentials[0].name, 'bunWaApi', `${label} must require the bunWaApi credential`);
	assert.equal(description.credentials[0].required, true, `${label} bunWaApi credential must be required`);
}

test('BunWa action node has a complete description', () => {
	const description = new actionModule.BunWa().description;
	assertBaseDescription(description, 'BunWa');
	assert.equal(description.name, 'bunWa');
	assert.deepEqual(description.inputs, ['main']);
	assert.deepEqual(description.outputs, ['main']);
});

test('BunWa Trigger node has a complete description', () => {
	const description = new triggerModule.BunWaTrigger().description;
	assertBaseDescription(description, 'BunWa Trigger');
	assert.equal(description.name, 'bunWaTrigger');
	assert.deepEqual(description.inputs, []);
	assert.deepEqual(description.outputs, ['main']);
});

test('the resource selector lists exactly the resource modules', () => {
	const description = new actionModule.BunWa().description;
	const property = description.properties.find((entry) => entry.name === 'resource');
	assert.ok(property, 'properties must contain a resource selector');
	assert.equal(property.type, 'options');
	assert.ok(Array.isArray(property.options) && property.options.length > 0, 'the resource selector must have options');
	assert.deepEqual(
		property.options.map((option) => option.value),
		RESOURCES.map((resource) => resource.value),
	);
});

test('every resource has a unique value and at least one operation', () => {
	const values = RESOURCES.map((resource) => resource.value);
	assert.equal(new Set(values).size, values.length, 'resource values must be unique');
	for (const resource of RESOURCES) {
		assert.ok(
			Array.isArray(resource.operations) && resource.operations.length > 0,
			`resource "${resource.value}" must declare at least one operation`,
		);
		for (const operation of resource.operations) {
			assert.ok(operation.name, `resource "${resource.value}" has an operation without a name`);
			assert.ok(operation.value, `resource "${resource.value}" has an operation without a value`);
		}
	}
});

test('operations and *Routes maps agree for every resource', async () => {
	const maps = await loadResourceRouteMaps();
	const resourceValues = RESOURCES.map((resource) => resource.value);

	for (const resource of RESOURCES) {
		const routes = maps.get(resource.value);
		assert.ok(routes, `no *Routes map was found for resource "${resource.value}"`);

		const operationValues = resource.operations.map((operation) => operation.value);
		for (const operation of operationValues) {
			assert.ok(
				operation in routes,
				`resource "${resource.value}" operation "${operation}" has no entry in its *Routes map`,
			);
		}
		for (const [operation, route] of Object.entries(routes)) {
			assert.ok(
				operationValues.includes(operation),
				`resource "${resource.value}" *Routes map has "${operation}" but no such operation is declared`,
			);
			assert.match(
				String(route),
				/^(GET|POST|PUT|DELETE|PATCH) \//,
				`resource "${resource.value}" route for "${operation}" must look like "METHOD /path"`,
			);
		}
	}

	for (const value of maps.keys()) {
		assert.ok(resourceValues.includes(value), `a *Routes map exists for "${value}" but it is not in RESOURCES`);
	}
});

test('every property has displayName, name and type', () => {
	for (const node of [new actionModule.BunWa(), new triggerModule.BunWaTrigger()]) {
		for (const property of node.description.properties) {
			assert.equal(typeof property.displayName, 'string', `property ${property.name ?? '?'} must have a displayName`);
			assert.ok(property.displayName, `property ${property.name ?? '?'} displayName must not be empty`);
			assert.equal(typeof property.name, 'string', `property "${property.displayName ?? '?'}" must have a name`);
			assert.ok(property.name, `property "${property.displayName ?? '?'}" name must not be empty`);
			assert.equal(typeof property.type, 'string', `property "${property.name}" must have a type`);
			assert.ok(property.type, `property "${property.name}" type must not be empty`);
		}
	}
});

test('BunWa Trigger declares exactly one POST webhook', () => {
	const description = new triggerModule.BunWaTrigger().description;
	assert.ok(Array.isArray(description.webhooks), 'the trigger must declare webhooks');
	assert.equal(description.webhooks.length, 1);
	assert.equal(description.webhooks[0].httpMethod, 'POST');

	const propertyNames = description.properties.map((property) => property.name);
	assert.ok(propertyNames.includes('session'), 'the trigger must ask for a session');
	assert.ok(propertyNames.includes('events'), 'the trigger must ask which events to subscribe to');
});
