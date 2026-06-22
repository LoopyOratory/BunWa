export class ApiKeyRequest {
  key?: string;
  isActive?: boolean;
  isAdmin?: boolean;
  session?: string;
  actions?: Record<string, boolean>;
}

export class ApiKeyDTO {
  id: string;
  key: string;
  isActive: boolean;
  isAdmin: boolean;
  session?: string;
  actions?: Record<string, boolean>;
}
