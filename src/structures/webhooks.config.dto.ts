import { z } from 'zod';
import { ApiProperty } from '../utils/decorators';
import {
  AllEvents,
  type AllEventType,
  WAHAEvents,
} from './enums.dto';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';

export enum RetryPolicy {
  LINEAR = 'linear',
  EXPONENTIAL = 'exponential',
  CONSTANT = 'constant',
}

export class RetriesConfiguration {
  @ApiProperty({
    example: 2,
  })
  @IsNumber()
  @IsOptional()
  delaySeconds?: number;

  @ApiProperty({
    example: 15,
  })
  @IsNumber()
  @IsOptional()
  attempts?: number;

  @ApiProperty({
    example: RetryPolicy.LINEAR,
  })
  @IsOptional()
  @IsEnum(RetryPolicy)
  policy?: RetryPolicy;
}

export class CustomHeader {
  @ApiProperty({
    example: 'X-My-Custom-Header',
  })
  @IsString()
  name!: string;

  @ApiProperty({
    example: 'Value',
  })
  @IsString()
  value!: string;
}

export class HmacConfiguration {
  @ApiProperty({
    example: 'your-secret-key',
  })
  @IsString()
  @IsOptional()
  key?: string;
}

export class WebhookFilterCondition {
  @ApiProperty({ example: 'sender' })
  @IsString()
  field!: string;

  @ApiProperty({ example: 'is' })
  @IsString()
  operator!: string;

  @ApiProperty({ example: '1234567890@c.us' })
  value!: string | string[] | boolean;

  @ApiProperty({ example: false })
  @IsOptional()
  caseSensitive?: boolean;
}

export class WebhookFilters {
  @ApiProperty({ type: [WebhookFilterCondition] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WebhookFilterCondition)
  @IsOptional()
  conditions?: WebhookFilterCondition[];
}

export class WebhookConfig {
  @ApiProperty({
    example: '01HZXYZ...',
    description: 'Unique webhook identifier (auto-generated)',
  })
  @IsString()
  @IsOptional()
  id?: string;

  @ApiProperty({
    example: true,
    description: 'Whether this webhook is active',
  })
  @IsOptional()
  enabled?: boolean;

  @ApiProperty({
    example: 'POST',
    enum: ['GET', 'POST'],
    description: 'HTTP method for webhook delivery',
  })
  @IsOptional()
  @IsString()
  method?: string;

  @ApiProperty({
    example: 'https://webhook.site/11111111-1111-1111-1111-11111111',
    required: true,
    description:
      'You can use https://docs.webhook.site/ to test webhooks and see the payload',
  })
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  url!: string;

  @ApiProperty({
    example: ['message', 'session.status'],
    required: true,
  })
  @IsIn(AllEvents, { each: true })
  @IsArray()
  events!: AllEventType[];

  @ApiProperty({
    example: null,
  })
  @ValidateNested()
  @Type(() => HmacConfiguration)
  @IsOptional()
  hmac?: HmacConfiguration;

  @ApiProperty({
    example: null,
  })
  @ValidateNested()
  @Type(() => RetriesConfiguration)
  @IsOptional()
  retries?: RetriesConfiguration;

  @ApiProperty({
    example: null,
  })
  @ValidateNested()
  @Type(() => CustomHeader)
  @IsArray()
  @IsOptional()
  customHeaders?: CustomHeader[];

  @ApiProperty({
    example: null,
    description: 'Webhook filter conditions (AND logic)',
  })
  @ValidateNested()
  @Type(() => WebhookFilters)
  @IsOptional()
  filters?: WebhookFilters;
}

// ---- Zod schemas for webhook create / update ----

export const WebhookCreateSchema = z.object({
  url: z.string().url(),
  events: z.string().array(),
  enabled: z.boolean().optional(),
  hmac: z.object({ key: z.string() }).optional(),
  retries: z.object({
    attempts: z.number(),
    delaySeconds: z.number(),
  }).optional(),
  customHeaders: z.array(z.object({
    name: z.string(),
    value: z.string(),
  })).optional(),
  filters: z.any().optional(),
});

export type WebhookCreateInput = z.infer<typeof WebhookCreateSchema>;

export const WebhookUpdateSchema = z.object({
  url: z.string().url().optional(),
  events: z.string().array().optional(),
  enabled: z.boolean().optional(),
  hmac: z.object({ key: z.string() }).optional(),
  retries: z.object({
    attempts: z.number().optional(),
    delaySeconds: z.number().optional(),
  }).optional(),
  customHeaders: z.array(z.object({
    name: z.string(),
    value: z.string(),
  })).optional(),
  filters: z.any().optional(),
});

export type WebhookUpdateInput = z.infer<typeof WebhookUpdateSchema>;