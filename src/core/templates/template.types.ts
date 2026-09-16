export interface TemplateCreateDto {
  name: string;
  body: string;
  header?: string | null;
  footer?: string | null;
}

export interface TemplateUpdateDto {
  name?: string;
  body?: string;
  header?: string | null;
  footer?: string | null;
}

export interface Template {
  id: string;
  sessionId: string;
  name: string;
  body: string;
  header: string | null;
  footer: string | null;
  createdAt: string;
  updatedAt: string;
}
