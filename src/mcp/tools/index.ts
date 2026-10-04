/**
 * Re-export all tool definition factories.
 */
import type { SessionManager } from '../../core/manager.core';
import type { ToolDescriptor } from '../tool-descriptor';
import { sessionTools } from './session.tools';
import { messageTools } from './message.tools';
import { contactTools } from './contact.tools';
import { chatTools } from './chat.tools';
import { statusTools } from './status.tools';
import { presenceTools } from './presence.tools';
import { policyTools } from './policy.tools';
import { templateTools } from './template.tools';
import { groupTools } from './group.tools';
import { channelTools } from './channel.tools';

export { sessionTools } from './session.tools';
export { messageTools } from './message.tools';
export { contactTools } from './contact.tools';
export { chatTools } from './chat.tools';
export { statusTools } from './status.tools';
export { presenceTools } from './presence.tools';
export { policyTools } from './policy.tools';
export { templateTools } from './template.tools';
export { groupTools } from './group.tools';
export { channelTools } from './channel.tools';

/**
 * The one place that knows every tool family.
 *
 * The MCP server and the dashboard's tool list both build their registry from
 * this, because they used to keep separate lists: a family added to one was
 * silently missing from the other, which is how the group category ended up
 * advertised with no tools in it and the dashboard never showed the channels.
 */
export function buildAllTools(manager: SessionManager): ToolDescriptor[] {
  return [
    ...sessionTools(manager),
    ...messageTools(manager),
    ...contactTools(manager),
    ...chatTools(manager),
    ...statusTools(manager),
    ...presenceTools(manager),
    ...policyTools(manager),
    ...templateTools(manager),
    ...groupTools(manager),
    ...channelTools(manager),
  ];
}
