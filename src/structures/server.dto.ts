export class EnvironmentQuery {
  // placeholder
}

export class StopRequest {
  exitCode?: number;
}

export class StopResponse {
  result!: boolean;
}

export class ServerStatusResponse {
  uptime!: number;
  worker?: string;
}

export class WorkerInfo {
  id!: string;
}
