import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { RESOURCES } from './resources';

export class BunWa implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'BunWa',
		name: 'bunWa',
		icon: 'file:bunwa.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Send WhatsApp messages and manage sessions through the BunWa HTTP API',
		defaults: {
			name: 'BunWa',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'bunWaApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: RESOURCES.map((resource) => ({
					name: resource.name,
					value: resource.value,
					description: resource.description,
				})),
				default: 'message',
			},
			...RESOURCES.flatMap((resource) => [
				{
					displayName: 'Operation',
					name: 'operation',
					type: 'options' as const,
					noDataExpression: true,
					displayOptions: {
						show: {
							resource: [resource.value],
						},
					},
					options: resource.operations,
					default: resource.defaultOperation,
				},
				...resource.properties,
			]),
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const module = RESOURCES.find((candidate) => candidate.value === resource);

		if (!module) {
			throw new NodeOperationError(this.getNode(), `Unsupported resource: ${resource}`);
		}

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			const operation = this.getNodeParameter('operation', itemIndex) as string;
			const result = await module.execute({ ctx: this, itemIndex, operation });
			const rows: IDataObject[] = Array.isArray(result) ? result : [result];

			for (const json of rows) {
				returnData.push({ json, pairedItem: { item: itemIndex } });
			}
		}

		return [returnData];
	}
}
