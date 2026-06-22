import { injectable } from 'tsyringe';
import { parseBool } from './helpers';
import { WebhookConfig } from './structures/webhooks.config.dto';
import { IgnoreJidConfig } from './core/utils/jids';

@injectable()
export class WhatsappConfigService {
  get schema() {
    return process.env.WHATSAPP_API_SCHEMA || 'http';
  }

  get hostname(): string {
    return process.env.WHATSAPP_API_HOSTNAME || 'localhost';
  }

  get port(): number {
    const port = process.env.PORT || process.env.WHATSAPP_API_PORT || '3000';
    return parseInt(port, 10);
  }

  get baseUrl(): string {
    let baseUrl = process.env.WAHA_BASE_URL || '';
    if (!baseUrl) {
      baseUrl = `${this.schema}://${this.hostname}:${this.port}`;
    }
    return baseUrl.replace(/\/$/, '');
  }

  get workerId(): string {
    return process.env.WAHA_WORKER_ID || '';
  }

  get shouldRestartWorkerSessions(): boolean {
    return parseBool(process.env.WAHA_WORKER_RESTART_SESSIONS || 'true');
  }

  get autoStartDelaySeconds(): number {
    try {
      return parseInt(process.env.WAHA_AUTO_START_DELAY_SECONDS || '0', 10);
    } catch {
      return 0;
    }
  }

  get mimetypes(): string[] {
    if (!this.shouldDownloadMedia) {
      return ['mimetype/ignore-all-media'];
    }
    const types = process.env.WHATSAPP_FILES_MIMETYPES || '';
    return types ? types.split(',') : [];
  }

  get shouldDownloadMedia(): boolean {
    return parseBool(process.env.WHATSAPP_DOWNLOAD_MEDIA || 'true');
  }

  get startSessions(): string[] {
    const value = process.env.WHATSAPP_START_SESSION || '';
    if (!value) {
      return [];
    }
    return value.split(',');
  }

  get shouldRestartAllSessions(): boolean {
    return parseBool(process.env.WHATSAPP_RESTART_ALL_SESSIONS || 'false');
  }

  get proxyServer(): string[] | string | undefined {
    const single = process.env.WHATSAPP_PROXY_SERVER;
    const multipleValues = process.env.WHATSAPP_PROXY_SERVER_LIST;
    const multiple = multipleValues ? multipleValues.split(',') : undefined;
    return single ? single : multiple;
  }

  get proxyServerIndexPrefix(): string | undefined {
    return process.env.WHATSAPP_PROXY_SERVER_INDEX_PREFIX;
  }

  get proxyServerUsername(): string | undefined {
    return process.env.WHATSAPP_PROXY_SERVER_USERNAME;
  }

  get proxyServerPassword(): string | undefined {
    return process.env.WHATSAPP_PROXY_SERVER_PASSWORD;
  }

  getWebhookConfig(): WebhookConfig | undefined {
    return undefined;
  }

  getWebhookUrl(): string | undefined {
    return process.env.WAHA_WEBHOOK_URL;
  }

  getSessionMongoUrl(): string | undefined {
    return process.env.WHATSAPP_SESSIONS_MONGO_URL;
  }

  getSessionPostgresUrl(): string | undefined {
    return process.env.WHATSAPP_SESSIONS_POSTGRESQL_URL || process.env.WAHA_DATABASE_URL;
  }

  getDatabaseDriver(): string {
    return process.env.WAHA_DATABASE_DRIVER || 'sqlite';
  }

  getSqlitePath(): string {
    return process.env.WAHA_SQLITE_PATH || '.sessions/waha.db';
  }

  get(name: string, defaultValue: any = undefined): any {
    return process.env[name] || defaultValue;
  }

  getApiKey(): string | undefined {
    return process.env.WAHA_API_KEY;
  }

  getExcludedPaths(): string[] {
    const value = process.env.WHATSAPP_API_KEY_EXCLUDE_PATH || '';
    if (!value) {
      return [];
    }
    return value.split(',').filter(Boolean);
  }

  getExcludedFullPaths(): string[] {
    const paths = this.getExcludedPaths();
    return paths.map((path) => (path.startsWith('/') ? path : `/${path}`));
  }

  getHealthMediaFilesThreshold(): number {
    return parseInt(process.env.WHATSAPP_HEALTH_MEDIA_FILES_THRESHOLD_MB || '100', 10);
  }

  getHealthSessionFilesThreshold(): number {
    return parseInt(process.env.WHATSAPP_HEALTH_SESSION_FILES_THRESHOLD_MB || '100', 10);
  }

  getHealthMongoTimeout(): number {
    return parseInt(process.env.WHATSAPP_HEALTH_MONGO_TIMEOUT_MS || '3000', 10);
  }

  get debugModeEnabled(): boolean {
    return parseBool(process.env.WAHA_DEBUG_MODE || 'false');
  }

  getIgnoreChatsConfig(): IgnoreJidConfig {
    const status = parseBool(process.env.WAHA_SESSION_CONFIG_IGNORE_STATUS || 'false');
    const groups = parseBool(process.env.WAHA_SESSION_CONFIG_IGNORE_GROUPS || 'false');
    const channels = parseBool(process.env.WAHA_SESSION_CONFIG_IGNORE_CHANNELS || 'false');
    const broadcast = parseBool(process.env.WAHA_SESSION_CONFIG_IGNORE_BROADCAST || 'false');
    return { status, groups, channels, broadcast };
  }
}
