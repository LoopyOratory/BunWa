import type { IDataObject, INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import { bunwaApiRequest, forOperations, optional, sessionField, type ResourceModule } from '../GenericFunctions';

const operations: INodePropertyOptions[] = [
	{ name: 'Create', value: 'create', action: 'Create a session', description: 'Registers a new session' },
	{ name: 'Delete', value: 'delete', action: 'Delete a session', description: 'Removes the session and its stored credentials' },
	{ name: 'Force Kill', value: 'forceKill', action: 'Force kill a session', description: 'Hard stop without a graceful drain' },
	{ name: 'Get', value: 'get', action: 'Get a session', description: 'Returns one session with its status' },
	{ name: 'Get Config', value: 'getConfig', action: 'Get the session config' },
	{ name: 'Get QR', value: 'getQr', action: 'Get the pairing QR code', description: 'Base64 PNG, optionally with a phone pairing code' },
	{ name: 'Get Screenshot', value: 'getScreenshot', action: 'Get a session screenshot', description: 'WEBJS engine only' },
	{ name: 'List', value: 'list', action: 'List sessions' },
	{ name: 'Log Out', value: 'logout', action: 'Log out a session', description: 'Unpairs the account, then deletes the session' },
	{ name: 'Restart', value: 'restart', action: 'Restart a session' },
	{ name: 'Start', value: 'start', action: 'Start a session' },
	{ name: 'Stop', value: 'stop', action: 'Stop a session' },
	{ name: 'Update Config', value: 'updateConfig', action: 'Update the session config' },
];

const scopedOperations = [
	'delete',
	'forceKill',
	'get',
	'getConfig',
	'getQr',
	'getScreenshot',
	'logout',
	'restart',
	'start',
	'stop',
	'updateConfig',
];

const properties: INodeProperties[] = [
	{
		...sessionField('Session to act on'),
		displayOptions: { show: { operation: scopedOperations } },
	},
	{
		displayName: 'Session Name',
		name: 'newSessionName',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'support-line',
		description:
			'Name for the new session: up to 64 characters, no spaces and none of . / \\ : * ? " < > |',
		displayOptions: { show: { operation: ['create'] } },
	},
	{
		displayName: 'Start After Creating',
		name: 'start',
		type: 'boolean',
		default: true,
		description: 'Whether to start the session right away, which produces a QR code to scan',
		displayOptions: { show: { operation: ['create'] } },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { operation: ['list'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { operation: ['list'], returnAll: [false] } },
	},
	...forOperations(
		[
			{
				displayName: 'Config (JSON)',
				name: 'config',
				type: 'json',
				default: '{\n  "metadata": {}\n}',
				description: 'Session config to merge. Fields that are not sent are left unchanged.',
			},
		],
		['updateConfig'],
	),
	...forOperations(
		[
			{
				displayName: 'Phone Number',
				name: 'phoneNumber',
				type: 'string',
				default: '',
				placeholder: '15551234567',
				description:
					'When set, the response also carries a pairing code for this number instead of requiring a QR scan',
			},
		],
		['getQr'],
	),
];

export const sessionResource: ResourceModule = {
	value: 'session',
	name: 'Session',
	defaultOperation: 'list',
	description: 'Create, start, stop and inspect WhatsApp sessions',
	operations,
	properties,
	async execute({ ctx, itemIndex, operation }) {
		const session = optional(ctx.getNodeParameter('session', itemIndex, '')) as string | undefined;

		switch (operation) {
			case 'list': {
				const sessions = await bunwaApiRequest.call(ctx, 'GET', '/api/sessions', undefined, { all: true });
				const returnAll = ctx.getNodeParameter('returnAll', itemIndex, false) as boolean;
				if (returnAll || !Array.isArray(sessions)) {
					return sessions;
				}
				const limit = ctx.getNodeParameter('limit', itemIndex, 50) as number;
				return sessions.slice(0, limit);
			}
			case 'get':
				return bunwaApiRequest.call(ctx, 'GET', `/api/sessions/${session}`);
			case 'create': {
				const name = ctx.getNodeParameter('newSessionName', itemIndex) as string;
				const start = ctx.getNodeParameter('start', itemIndex, true) as boolean;
				return bunwaApiRequest.call(ctx, 'POST', '/api/sessions', { name, start });
			}
			case 'start':
				return bunwaApiRequest.call(ctx, 'POST', `/api/sessions/${session}/start`);
			case 'stop':
				return bunwaApiRequest.call(ctx, 'POST', `/api/sessions/${session}/stop`);
			case 'restart':
				return bunwaApiRequest.call(ctx, 'POST', `/api/sessions/${session}/restart`);
			case 'logout':
				return bunwaApiRequest.call(ctx, 'POST', `/api/sessions/${session}/logout`);
			case 'forceKill':
				return bunwaApiRequest.call(ctx, 'POST', `/api/sessions/${session}/force-kill`);
			case 'delete':
				return bunwaApiRequest.call(ctx, 'DELETE', `/api/sessions/${session}`);
			case 'getConfig':
				return bunwaApiRequest.call(ctx, 'GET', `/api/sessions/${session}/config`);
			case 'updateConfig': {
				const raw = ctx.getNodeParameter('config', itemIndex, '{}') as string | IDataObject;
				const config = typeof raw === 'string' ? (JSON.parse(raw || '{}') as IDataObject) : raw;
				return bunwaApiRequest.call(ctx, 'PATCH', `/api/sessions/${session}/config`, config);
			}
			case 'getQr': {
				const phoneNumber = optional(ctx.getNodeParameter('phoneNumber', itemIndex, '')) as string | undefined;
				return bunwaApiRequest.call(
					ctx,
					'GET',
					`/api/${session}/auth/qr`,
					undefined,
					phoneNumber ? { phoneNumber } : undefined,
				);
			}
			case 'getScreenshot':
				return bunwaApiRequest.call(ctx, 'GET', `/api/${session}/screenshot`);
			default:
				throw new Error(`Unsupported session operation: ${operation}`);
		}
	},
};

/** The HTTP route each operation calls. Used by the docs and by test/routes.test.mjs. */
export const sessionRoutes: Record<string, string> = {
	list: 'GET /api/sessions',
	get: 'GET /api/sessions/{session}',
	create: 'POST /api/sessions',
	start: 'POST /api/sessions/{session}/start',
	stop: 'POST /api/sessions/{session}/stop',
	restart: 'POST /api/sessions/{session}/restart',
	logout: 'POST /api/sessions/{session}/logout',
	forceKill: 'POST /api/sessions/{session}/force-kill',
	delete: 'DELETE /api/sessions/{session}',
	getConfig: 'GET /api/sessions/{session}/config',
	updateConfig: 'PATCH /api/sessions/{session}/config',
	getQr: 'GET /api/{session}/auth/qr',
	getScreenshot: 'GET /api/{session}/screenshot',
};
