import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { container } from 'tsyringe';
import { configureContainer } from '../di/container';
import { AuditService } from '../core/audit/audit.service';
import { TemplateService } from '../core/templates/template.service';

/**
 * Regression: AuditService and TemplateService take an optional
 * `dbOrPath?: Database | string` constructor param. That union emits `Object`
 * design-type metadata, so registerSingleton(Service) made tsyringe throw
 * "TypeInfo not known for Object" on every container.resolve() — turning the
 * Audit Logs and Templates routes into hard 500s. The container now registers
 * them as explicit instances instead.
 */
describe('DI container — services with non-injectable constructor params', () => {
  it('resolves AuditService and TemplateService without a TypeInfo error', () => {
    configureContainer();

    expect(() => container.resolve(AuditService)).not.toThrow();
    expect(() => container.resolve(TemplateService)).not.toThrow();

    expect(container.resolve(AuditService)).toBeInstanceOf(AuditService);
    expect(container.resolve(TemplateService)).toBeInstanceOf(TemplateService);
  });
});
