import type { ICredentialType, INodeProperties, ICredentialTestRequest } from 'n8n-workflow';

/**
 * BunWa API credential.
 *
 * `baseUrl` is the address of the BunWa server (the same process that serves
 * its dashboard, default port 3000). `apiKey` is the value of WAHA_API_KEY.
 */
export class BunWaApi implements ICredentialType {
	name = 'bunWaApi';

	displayName = 'BunWa API';

	documentationUrl = 'https://github.com/LoopyOratory/BunWa#authentication';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'http://localhost:3000',
			placeholder: 'https://bunwa.example.com',
			description: 'Base URL of the BunWa server, without a trailing slash',
			required: true,
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'The WAHA_API_KEY configured on the BunWa server (sent as the x-api-key header)',
			required: true,
		},
	];

	/**
	 * Uses an authenticated endpoint: /api/version is public, so it would pass
	 * even with a wrong key.
	 */
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/api/sessions',
			method: 'GET',
			headers: {
				'x-api-key': '={{$credentials.apiKey}}',
			},
		},
	};
}
