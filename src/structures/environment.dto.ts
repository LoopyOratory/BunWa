export class BUNWAEnvironment {
  version!: string;
  engine!: string;
  tier!: string;
  browser!: string | null;
  platform!: string;
  worker!: {
    id: string | null;
  };
}
