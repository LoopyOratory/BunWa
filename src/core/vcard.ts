export function toVcardV3(contacts: any[]): string {
  let vcard = '';
  for (const contact of contacts) {
    vcard += `BEGIN:VCARD\nVERSION:3.0\nFN:${contact.name || ''}\nTEL;TYPE=CELL:${contact.phone || ''}\nEND:VCARD\n`;
  }
  return vcard;
}
