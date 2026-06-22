import QRCode from 'qrcode';

export class QR {
  public raw?: string;

  save(raw?: string) {
    this.raw = raw;
  }

  async get(): Promise<Buffer> {
    const url = await QRCode.toDataURL(this.raw);
    const base64 = url.replace(/^data:image\/png;base64,/, '');
    return Buffer.from(base64, 'base64');
  }
}