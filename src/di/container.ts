import 'reflect-metadata';
import { container, DependencyContainer } from 'tsyringe';
import { WhatsappConfigService } from '../config.service';
import { DashboardConfigServiceCore } from '../core/config/DashboardConfigServiceCore';
import { SwaggerConfigServiceCore } from '../core/config/SwaggerConfigServiceCore';
import { SessionManager } from '../core/manager.core';
import { setSessionManager } from '../api/websocket';
import { ChatwootAppService } from '../apps/chatwoot/services/ChatwootAppService';
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

  return container;
}
