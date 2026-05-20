declare module "mammoth" {
  interface ConversionInput {
    buffer: Buffer | ArrayBuffer | Uint8Array;
  }
  interface ConversionResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  export function convertToHtml(input: ConversionInput): Promise<ConversionResult>;
  export function convertToMarkdown(input: ConversionInput): Promise<ConversionResult>;
  export function extractRawText(input: ConversionInput): Promise<ConversionResult>;
}
