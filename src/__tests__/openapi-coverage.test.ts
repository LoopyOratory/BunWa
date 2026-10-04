import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { createApiRouter } from '../api/index';
import { buildOpenApiSpec } from '../swagger';
import { applyRouteCoverage, openApiPath, undocumentedRoutes } from '../openapi/route-coverage';

/**
 * The OpenAPI reference must describe the API the process actually serves.
 *
 * The spec is hand-written, so it drifts: when this test was added the code had
 * 185 routes and the spec documented 111. Route coverage fills the gap at build
 * time and this test fails if a new route is ever left out, which is the drift
 * check the roadmap asked for.
 */

function mountedRoutes() {
  const app = createApiRouter();
  return (app.routes as Array<{ method: string; path: string }>).filter((route) =>
    ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(route.method.toUpperCase()),
  );
}

describe('OpenAPI route coverage', () => {
  const routes = mountedRoutes();

  it('documents every mounted route', () => {
    const spec = buildOpenApiSpec(routes);
    const missing = undocumentedRoutes(spec, routes);
    expect(missing).toEqual([]);
  });

  it('covers a substantial API rather than a handful of routes', () => {
    const spec = buildOpenApiSpec(routes);
    expect(routes.length).toBeGreaterThan(150);
    expect(Object.keys(spec.paths).length).toBeGreaterThan(120);
  });

  it('keeps the hand-written entries instead of replacing them', () => {
    const spec = buildOpenApiSpec(routes);
    // A route with a hand-written body keeps its curated description and schema.
    const createGroup = spec.paths['/api/{session}/groups']?.post;
    expect(createGroup).toBeDefined();
    expect(createGroup.requestBody).toBeDefined();
  });

  it('fills a missing route with its curated summary', () => {
    const spec = buildOpenApiSpec(routes);
    const revoke = spec.paths['/api/{session}/groups/{id}/invite-code/revoke']?.post;
    expect(revoke.summary).toBe('Revoke the invite code and return the new one');
    expect(revoke.tags).toEqual(['👥 Groups']);
  });

  it('adds the path parameters a route declares', () => {
    const spec = buildOpenApiSpec(routes);
    const promote = spec.paths['/api/{session}/groups/{id}/admin/promote']?.post;
    const names = (promote.parameters ?? []).map((p: any) => p.name);
    expect(names).toEqual(['session', 'id']);
  });

  it('never leaves a route without a summary, a tag or an operationId', () => {
    const spec = buildOpenApiSpec(routes);
    for (const [path, operations] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(operations as Record<string, any>)) {
        if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
        expect(operation.summary, `${method.toUpperCase()} ${path}`).toBeTruthy();
        expect(operation.tags?.length, `${method.toUpperCase()} ${path}`).toBeGreaterThan(0);
        expect(operation.operationId, `${method.toUpperCase()} ${path}`).toBeTruthy();
      }
    }
  });

  it('produces unique operation ids', () => {
    const spec = buildOpenApiSpec(routes);
    const ids: string[] = [];
    for (const operations of Object.values(spec.paths)) {
      for (const [method, operation] of Object.entries(operations as Record<string, any>)) {
        if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
        ids.push(operation.operationId);
      }
    }
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(duplicates).toEqual([]);
  });

  it('converts Hono parameters to OpenAPI braces', () => {
    expect(openApiPath('/api/:session/groups/:id')).toBe('/api/{session}/groups/{id}');
  });

  it('leaves the spec alone when no route table is passed', () => {
    const spec = buildOpenApiSpec();
    expect(spec.paths['/api/{session}/groups/{id}/invite-code/revoke']).toBeUndefined();
  });

  it('does not overwrite an operation that is already documented', () => {
    const spec = { paths: { '/api/ping': { get: { summary: 'Hand written' } } } };
    applyRouteCoverage(spec, [{ method: 'GET', path: '/api/ping' }]);
    expect(spec.paths['/api/ping'].get.summary).toBe('Hand written');
  });
});
