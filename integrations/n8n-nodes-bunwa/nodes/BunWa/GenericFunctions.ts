import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	INodeProperties,
	INodePropertyOptions,
	JsonObject,
	NodeApiError as NodeApiErrorType,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export const BUNWA_CREDENTIAL = 'bunWaApi';

/**
 * Performs one request against the BunWa HTTP API.
 *
 * The URL is built explicitly from the credential rather than relying on a
 * credential-level baseURL, so the node works the same in the editor, in the
 * credential test and in tests that mock the HTTP layer.
 */
export async function bunwaApiRequest(
	this: IExecuteFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject,
	qs?: IDataObject,
): Promise<any> {
	const credentials = await this.getCredentials(BUNWA_CREDENTIAL);
	const baseUrl = String(credentials.baseUrl ?? '').replace(/\/+$/, '');
	if (!baseUrl) {
		throw new NodeApiError(this.getNode(), { message: 'BunWa base URL is not configured' } as JsonObject);
	}

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${endpoint}`,
		headers: {
			'x-api-key': String(credentials.apiKey ?? ''),
			Accept: 'application/json',
		},
		json: true,
	};
	if (body && Object.keys(body).length > 0) {
		options.body = body;
	}
	if (qs && Object.keys(qs).length > 0) {
		options.qs = qs;
	}

	try {
		return await this.helpers.httpRequest(options);
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

/** Builds a comma separated query value from a comma separated user input. */
export function splitList(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.map(String).map((v) => v.trim()).filter(Boolean);
	}
	return String(value ?? '')
		.split(',')
		.map((v) => v.trim())
		.filter(Boolean);
}

/** Returns undefined instead of an empty string, so optional fields are omitted. */
export function optional<T>(value: T): T | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	return value;
}

/* ── Reusable field builders ─────────────────────────────────────────── */

export function sessionField(description = 'Name of the BunWa session to use'): INodeProperties {
	return {
		displayName: 'Session Name or ID',
		name: 'session',
		type: 'string',
		default: '',
		required: true,
		description: `${description}. The session must exist on the BunWa server.`,
	};
}

export function chatIdField(description = 'Chat ID, for example 15551234567@c.us or a group ID ending in @g.us'): INodeProperties {
	return {
		displayName: 'Chat ID',
		name: 'chatId',
		type: 'string',
		default: '',
		required: true,
		placeholder: '15551234567@c.us',
		description,
	};
}

export function messageIdField(): INodeProperties {
	return {
		displayName: 'Message ID',
		name: 'messageId',
		type: 'string',
		default: '',
		required: true,
		description: 'Full message ID, for example false_15551234567@c.us_3EB0...',
	};
}

export function booleanField(
	name: string,
	displayName: string,
	description: string,
	defaultValue = false,
	operation?: string,
): INodeProperties {
	return {
		displayName,
		name,
		type: 'boolean',
		default: defaultValue,
		description,
		...(operation ? { displayOptions: { show: { operation: [operation] } } } : {}),
	};
}

/* ── Resource module contract ────────────────────────────────────────── */

export interface ExecuteArgs {
	ctx: IExecuteFunctions;
	itemIndex: number;
	operation: string;
}

export interface ResourceModule {
	/** Machine value used in the `resource` parameter. */
	value: string;
	/** Label shown in the editor. */
	name: string;
	/** Operation selected when the resource is picked. */
	defaultOperation: string;
	/** Short line shown under the resource selector. */
	description: string;
	operations: INodePropertyOptions[];
	/** Fields for every operation of this resource. */
	properties: INodeProperties[];
	/** Returns the payload for one input item (an object, or an array of them). */
	execute(args: ExecuteArgs): Promise<any>;
}

/** Wraps operation-specific fields so only the matching operation shows them. */
export function forOperations(
	properties: INodeProperties[],
	operations: string[],
): INodeProperties[] {
	return properties.map((property) => ({
		...property,
		displayOptions: { show: { operation: operations } },
	}));
}

export type { NodeApiErrorType };
