import 'reflect-metadata';
import { container, DependencyContainer } from 'tsyringe';
import { WhatsappConfigService } from '../config.service';
import { DashboardConfigServiceCore } from '../core/config/DashboardConfigServiceCore';
import { SwaggerConfigServiceCore } from '../core/config/SwaggerConfigServiceCore';
import { SessionManager } from '../core/manager.core';
import { setSessionManager } from '../api/websocket';
import { ChatwootAppService } from '../apps/chatwoot/services/ChatwootAppService';
import { AuditService } from '../core/audit/audit.service';
import { TemplateService } from '../core/templates/template.service';
import pino from 'pino';

export function configureContainer(): DependencyContainer {
  // Register config services first
  container.registerSingleton(WhatsappConfigService);
  container.registerSingleton(DashboardConfigServiceCore);
  container.registerSingleton(SwaggerConfigServiceCore);

  // Register SessionManager with explicit factory
  const config = container.resolve(WhatsappConfigService);
  const sessionManager = new SessionManager(config);
  container.registerInstance(SessionManager, sessionManager);
  setSessionManager(sessionManager);

  // Register ChatwootAppService
  container.registerSingleton(ChatwootAppService);

  // Register AuditService + TemplateService as explicit instances.
  // Their constructors take an optional `dbOrPath?: Database | string` param,
  // which emits `Object` design-type metadata that tsyringe cannot auto-inject
  // (registerSingleton would throw "TypeInfo not known for Object"). Both
  // default to an env-configured SQLite path when constructed with no args.
  container.registerInstance(AuditService, new AuditService());
  container.registerInstance(TemplateService, new TemplateService());

  return container;
}
