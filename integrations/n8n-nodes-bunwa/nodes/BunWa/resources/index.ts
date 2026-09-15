import type { ResourceModule } from '../GenericFunctions';
import { sessionResource } from './session';
import { messageResource } from './message';
import { chatResource } from './chat';
import { groupResource } from './group';
import { contactResource } from './contact';
import { channelResource } from './channel';
import { labelResource } from './label';
import { presenceResource } from './presence';
import { statusResource } from './status';
import { opsResource } from './ops';

/**
 * Every resource the node exposes, in the order shown in the editor.
 *
 * A resource module exports:
 *   - `<name>Resource`: ResourceModule (operations, properties, execute)
 *   - `<name>Routes`:   Record<operation, 'METHOD /path'> for docs and tests
 */
export const RESOURCES: ResourceModule[] = [
	messageResource,
	sessionResource,
	chatResource,
	groupResource,
	contactResource,
	channelResource,
	labelResource,
	presenceResource,
	statusResource,
	opsResource,
];
