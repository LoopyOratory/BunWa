import { WAHAEvents, WAHAEventsWild } from '../structures/enums.dto';

/**
 * Unmask "*" in events list to exact values
 * Remove duplicates if any
 */
export function EventWildUnmask(events: string[] | string): string[] {
  const eventList = Array.isArray(events) ? events : [events];
  const allEvents = WAHAEventsWild;

  const result: string[] = [];

  if (eventList.includes('*')) {
    result.push(...allEvents);
  }

  for (const event of eventList) {
    if (allEvents.includes(event as any)) {
      result.push(event);
    }
  }

  return [...new Set(result)];
}
