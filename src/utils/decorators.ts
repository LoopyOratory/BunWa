export class ApiPropertyOptions {
  description?: string;
  example?: any;
  required?: boolean;
  type?: any;
  isArray?: boolean;
  enum?: any;
  default?: any;
  deprecated?: boolean;
  nullable?: boolean;
  readOnly?: boolean;
  oneOf?: any[];
}

export function ApiProperty(options: ApiPropertyOptions = {}) {
  return function (target: any, propertyKey: string, parameterIndex?: number) {
    // Store metadata for API documentation
    const existingMetadata = Reflect.getMetadata('api:properties', target) || {};
    existingMetadata[propertyKey] = options;
    Reflect.defineMetadata('api:properties', existingMetadata, target);
  };
}

export function ApiPropertyOptional(options: ApiPropertyOptions = {}) {
  return ApiProperty({ ...options, required: false });
}

export function ApiExtraModels(...models: any[]) {
  return function (constructor: Function) {
    // Store extra models for API documentation
    Reflect.defineMetadata('api:extraModels', models, constructor);
  };
}

export function getSchemaPath(model: any): string {
  return `#/components/schemas/${model.name}`;
}