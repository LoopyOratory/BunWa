import { WhatsappConfigService } from '../../config.service';
import { SessionManager } from './manager.abc';
import pino from 'pino';

export class HealthCheckResult {
  status!: string;
  details?: Record<string, any>;
}

export abstract class WAHAHealthCheckService {
  protected logger: any;
  constructor(
    protected sessionManager: SessionManager,
    protected health: any,
    protected config: WhatsappConfigService,
  ) {
    this.logger = pino({ name: 'HealthCheck' });
  }

  abstract check(): Promise<HealthCheckResult>;
}