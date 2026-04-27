import { readFileSync } from 'node:fs';
import { PDFParse } from 'pdf-parse';

export interface PdfTextPage {
  pageNumber: number;
  text: string;
}

export interface PdfTextParseResult {
  pageCount: number;
  text: string;
  pages: PdfTextPage[];
}

export async function parsePdfText(pdfPath: string): Promise<PdfTextParseResult> {
  const parser = new PDFParse({ data: readFileSync(pdfPath) });
  try {
    const result = await parser.getText();
    return {
      pageCount: result.total,
      text: result.text,
      pages: result.pages.map((page) => ({
        pageNumber: page.num,
        text: page.text,
      })),
    };
  } finally {
    await parser.destroy();
  }
}