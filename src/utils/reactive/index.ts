export { complete } from './complete';
export { SwitchObservable } from './SwitchObservable';

export class DistinctMessages {
  static filter(messages: any[]): any[] {
    const seen = new Set();
    return messages.filter(m => {
      const key = m.key?.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

export class DistinctAck {
  static filter(acks: any[]): any[] {
    const seen = new Set();
    return acks.filter(a => {
      const key = a.key?.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

export function onlyEvent<T>(event: string) {
  return (source: any) => source.pipe(
    (source as any).filter((value: any) => value.event === event),
    (source as any).map((value: any) => value.data)
  );
}

export function exclude<T>(predicate: (value: T) => boolean) {
  return (source: any) => source.pipe(
    (source as any).filter((value: T) => !predicate(value))
  );
}
