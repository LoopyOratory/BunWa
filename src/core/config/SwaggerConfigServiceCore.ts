import { injectable } from 'tsyringe';
import { parseBool } from '../../helpers';

@injectable()
export class SwaggerConfigServiceCore {
  get enabled(): boolean {
    const value = process.env.WHATSAPP_SWAGGER_ENABLED || 'true';
    return parseBool(value);
  }

  get credentials(): [string, string] | null {
    const user = process.env.WHATSAPP_SWAGGER_USERNAME || '';
    const password = process.env.WHATSAPP_SWAGGER_PASSWORD || '';
    if (!user && !password) {
      return null;
    }
    if ((user && !password) || (!user && password)) {
      console.warn(
        'Set up both WHATSAPP_SWAGGER_USERNAME and WHATSAPP_SWAGGER_PASSWORD ' +
          'to enable swagger authentication.',
      );
      return null;
    }
    return [user, password];
  }

  get title(): string {
    return process.env.WHATSAPP_SWAGGER_TITLE || 'WAHA - WhatsApp HTTP API';
  }

  get description(): string {
    return process.env.WHATSAPP_SWAGGER_DESCRIPTION || '';
  }

  get externalDocUrl(): string {
    return process.env.WHATSAPP_SWAGGER_EXTERNAL_DOC_URL || 'https://waha.devlike.pro/';
  }

  get advancedConfigEnabled(): boolean {
    const value = process.env.WHATSAPP_SWAGGER_CONFIG_ADVANCED || 'false';
    return parseBool(value);
  }
}
