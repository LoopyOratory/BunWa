import * as mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';

export const MAX_KNOWLEDGE_FILE_BYTES = 10 * 1024 * 1024;

export interface ExtractedDocument {
  text: string;
  metadata: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    extension: string;
  };
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export async function extractDocumentText(file: File): Promise<ExtractedDocument> {
  if (file.size > MAX_KNOWLEDGE_FILE_BYTES) {
    throw new Error(`File is too large. Keep uploads under ${MAX_KNOWLEDGE_FILE_BYTES / 1024 / 1024} MB.`);
  }

  const extension = extensionOf(file.name);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text: string;

  if (extension === 'pdf' || file.type === 'application/pdf') {
    const pdf = await getDocumentProxy(bytes);
    const result = await extractText(pdf, { mergePages: true });
    text = Array.isArray(result.text) ? result.text.join('\n\n') : result.text;
    if (!text.trim()) {
      throw new Error('This PDF has no selectable text. Scanned PDFs need OCR, which is not supported yet.');
    }
  } else if (extension === 'docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    text = result.value;
  } else if (extension === 'doc') {
    throw new Error('Legacy .doc files are not supported. Save the document as .docx or PDF first.');
  } else if (
    extension === 'txt' ||
    extension === 'md' ||
    extension === 'markdown' ||
    extension === 'csv' ||
    extension === 'json' ||
    file.type.startsWith('text/')
  ) {
    text = new TextDecoder().decode(bytes);
  } else {
    throw new Error('Unsupported file type. Upload a PDF, DOCX, TXT, Markdown, CSV, or JSON file.');
  }

  const clean = text.replace(/\u0000/g, '').trim();
  if (!clean) throw new Error('The document contains no readable text.');

  return {
    text: clean,
    metadata: {
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      extension,
    },
  };
}
