/**
 * Build a vCard 3.0 payload for a contact send.
 *
 * The REST API documents contacts as { fullName, phoneNumber, organization? },
 * while older callers pass { name, phone }. Both spellings are accepted so the
 * documented fields are not silently dropped into an empty FN/TEL line.
 */
export function toVcardV3(contacts: any[]): string {
  let vcard = '';
  for (const contact of contacts) {
    const fullName = contact.fullName ?? contact.name ?? '';
    const phone = contact.phoneNumber ?? contact.phone ?? '';
    const organization = contact.organization ?? '';
    vcard += 'BEGIN:VCARD\nVERSION:3.0\n';
    vcard += `FN:${fullName}\n`;
    if (organization) {
      vcard += `ORG:${organization}\n`;
    }
    vcard += `TEL;TYPE=CELL:${phone}\n`;
    vcard += 'END:VCARD\n';
  }
  return vcard;
}
