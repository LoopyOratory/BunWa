import type { IDataObject, INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import {
	bunwaApiRequest,
	forOperations,
	optional,
	sessionField,
	splitList,
	type ResourceModule,
} from '../GenericFunctions';

const operations: INodePropertyOptions[] = [
	{
		name: 'Convert Voice Note',
		value: 'convertVoiceNote',
		action: 'Convert a voice note to OGG/Opus',
		description: 'The response carries the converted audio as base64 data with its mimetype',
	},
	{ name: 'Create Template', value: 'createTemplate', action: 'Create a message template' },
	{ name: 'Delete Template', value: 'deleteTemplate', action: 'Delete a message template' },
	{ name: 'Get Audit Logs', value: 'getAuditLogs', action: 'Get the audit log entries' },
	{ name: 'Get MCP Policy', value: 'getMcpPolicy', action: 'Get the MCP policy of a session' },
	{ name: 'Get Server Status', value: 'serverStatus', action: 'Get the status of the server' },
	{ name: 'Get Version', value: 'version', action: 'Get the server version' },
	{ name: 'Get Workers', value: 'getWorkers', action: 'List the workers of the server' },
	{ name: 'Health', value: 'health', action: 'Check whether the server is healthy' },
	{ name: 'List MCP Tools', value: 'listMcpTools', action: 'List the MCP tools of the server' },
	{ name: 'List Templates', value: 'listTemplates', action: 'List the message templates of a session' },
	{ name: 'Ping', value: 'ping', action: 'Ping the server' },
	{ name: 'Update MCP Policy', value: 'updateMcpPolicy', action: 'Update the MCP policy of a session' },
];

/** Operations that act on one session. */
const sessionOperations = [
	'convertVoiceNote',
	'createTemplate',
	'deleteTemplate',
	'getMcpPolicy',
	'listTemplates',
	'updateMcpPolicy',
];

const properties: INodeProperties[] = [
	...forOperations([sessionField('Session the operation acts on')], sessionOperations),
	...forOperations(
		[
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 50,
				description: 'Max number of audit log entries to return',
			},
			{
				displayName: 'Offset',
				name: 'offset',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 0,
				description: 'Number of audit log entries to skip',
			},
			{
				displayName: 'Severity',
				name: 'severity',
				type: 'options',
				default: 'all',
				description: 'Only return audit log entries with this severity',
				options: [
					{ name: 'All', value: 'all' },
					{ name: 'Error', value: 'error' },
					{ name: 'Info', value: 'info' },
					{ name: 'Warn', value: 'warn' },
				],
			},
		],
		['getAuditLogs'],
	),
	...forOperations(
		[
			{
				displayName: 'Name',
				name: 'templateName',
				type: 'string',
				default: '',
				required: true,
				description: 'Name of the template, up to 100 characters',
			},
			{
				displayName: 'Body',
				name: 'templateBody',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				description: 'Body of the template, up to 4096 characters; {{variable}} placeholders are kept as text',
			},
			{
				displayName: 'Header',
				name: 'templateHeader',
				type: 'string',
				default: '',
				description: 'Optional header of the template, up to 1024 characters',
			},
			{
				displayName: 'Footer',
				name: 'templateFooter',
				type: 'string',
				default: '',
				description: 'Optional footer of the template, up to 1024 characters',
			},
		],
		['createTemplate'],
	),
	...forOperations(
		[
			{
				displayName: 'Template ID',
				name: 'templateId',
				type: 'string',
				default: '',
				required: true,
				description: 'ID of the template, as returned by the list operation',
			},
		],
		['deleteTemplate'],
	),
	...forOperations(
		[
			{
				displayName: 'Policy',
				name: 'policy',
				type: 'collection',
				default: {},
				placeholder: 'Add Field',
				description: 'MCP policy fields to change; the fields that are not added are left unchanged',
				options: [
					{
						displayName: 'Allowed Tools',
						name: 'allowedTools',
						type: 'string',
						default: '',
						description: 'Comma-separated tool names to allow; an empty value clears the allow list',
					},
					{
						displayName: 'Denied Tools',
						name: 'deniedTools',
						type: 'string',
						default: '',
						description: 'Comma-separated tool names to deny; an empty value clears the deny list',
					},
					{
						displayName: 'Destructive Ops',
						name: 'destructiveOps',
						type: 'boolean',
						default: false,
						description: 'Whether destructive MCP tools are allowed for the session',
					},
					{
						displayName: 'Enabled',
						name: 'enabled',
						type: 'boolean',
						default: true,
						description: 'Whether the MCP server is enabled for the session',
					},
				],
			},
		],
		['updateMcpPolicy'],
	),
	...forOperations(
		[
			{
				displayName: 'File',
				name: 'file',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'https://example.com/voice.ogg',
				description: 'Voice note to convert: an HTTP URL, a base64 string or a data URL',
			},
		],
		['convertVoiceNote'],
	),
];

export const opsResource: ResourceModule = {
	value: 'ops',
	name: 'Server',
	defaultOperation: 'version',
	description: 'Inspect the BunWa server and manage templates and MCP policy',
	operations,
	properties,
	async execute({ ctx, itemIndex, operation }) {
		const session = optional(ctx.getNodeParameter('session', itemIndex, '')) as string | undefined;

		switch (operation) {
			case 'version':
				return bunwaApiRequest.call(ctx, 'GET', '/api/version');
			case 'health':
				return bunwaApiRequest.call(ctx, 'GET', '/health');
			case 'ping':
				return bunwaApiRequest.call(ctx, 'GET', '/ping');
			case 'serverStatus':
				return bunwaApiRequest.call(ctx, 'GET', '/api/server/status');
			case 'getWorkers':
				return bunwaApiRequest.call(ctx, 'GET', '/api/workers');
			case 'getAuditLogs': {
				const limit = ctx.getNodeParameter('limit', itemIndex, 50) as number;
				const offset = ctx.getNodeParameter('offset', itemIndex, 0) as number;
				const severity = ctx.getNodeParameter('severity', itemIndex, 'all') as string;
				return bunwaApiRequest.call(ctx, 'GET', '/api/audit', undefined, { limit, offset, severity });
			}
			case 'listTemplates':
				return bunwaApiRequest.call(ctx, 'GET', `/api/sessions/${session}/templates`);
			case 'createTemplate': {
				const name = ctx.getNodeParameter('templateName', itemIndex) as string;
				const body = ctx.getNodeParameter('templateBody', itemIndex) as string;
				const header = optional(ctx.getNodeParameter('templateHeader', itemIndex, '')) as string | undefined;
				const footer = optional(ctx.getNodeParameter('templateFooter', itemIndex, '')) as string | undefined;
				return bunwaApiRequest.call(ctx, 'POST', `/api/sessions/${session}/templates`, {
					name,
					body,
					header,
					footer,
				});
			}
			case 'deleteTemplate': {
				const templateId = ctx.getNodeParameter('templateId', itemIndex) as string;
				return bunwaApiRequest.call(ctx, 'DELETE', `/api/sessions/${session}/templates/${templateId}`);
			}
			case 'listMcpTools':
				return bunwaApiRequest.call(ctx, 'GET', '/api/mcp/tools');
			case 'getMcpPolicy':
				return bunwaApiRequest.call(ctx, 'GET', `/api/sessions/${session}/mcp`);
			case 'updateMcpPolicy': {
				const policy = ctx.getNodeParameter('policy', itemIndex, {}) as IDataObject;
				const body: IDataObject = {};
				for (const [key, value] of Object.entries(policy)) {
					body[key] = key === 'allowedTools' || key === 'deniedTools' ? splitList(value) : value;
				}
				return bunwaApiRequest.call(ctx, 'PUT', `/api/sessions/${session}/mcp`, body);
			}
			case 'convertVoiceNote': {
				const file = ctx.getNodeParameter('file', itemIndex) as string;
				return bunwaApiRequest.call(ctx, 'POST', `/api/${session}/media/convert/voice`, { file });
			}
			default:
				throw new Error(`Unsupported server operation: ${operation}`);
		}
	},
};

/** The HTTP route each operation calls. Used by the docs and by test/routes.test.mjs. */
export const opsRoutes: Record<string, string> = {
	version: 'GET /api/version',
	health: 'GET /health',
	ping: 'GET /ping',
	serverStatus: 'GET /api/server/status',
	getWorkers: 'GET /api/workers',
	getAuditLogs: 'GET /api/audit',
	listTemplates: 'GET /api/sessions/{session}/templates',
	createTemplate: 'POST /api/sessions/{session}/templates',
	deleteTemplate: 'DELETE /api/sessions/{session}/templates/{templateId}',
	listMcpTools: 'GET /api/mcp/tools',
	getMcpPolicy: 'GET /api/sessions/{session}/mcp',
	updateMcpPolicy: 'PUT /api/sessions/{session}/mcp',
	convertVoiceNote: 'POST /api/{session}/media/convert/voice',
};
