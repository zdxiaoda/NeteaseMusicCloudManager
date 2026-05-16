export interface EmbeddedFile {
  path: string;
  content: Uint8Array;
}

export function getEmbeddedFiles(): EmbeddedFile[];
export function getApiFileName(): string;
