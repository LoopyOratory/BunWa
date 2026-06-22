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
