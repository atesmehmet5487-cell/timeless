/**
 * Belge modelini (domain/doc.ts) A4 yatay PDF'e çevirir.
 *
 * Düzen, kullanıcının verdiği Excel örneğini izler: tam genişlikte yeşil
 * başlık şeridi, çerçeveli tablo, alt alta satırlar. Günlük ödeme planı da
 * gider tablosu da aynı işlevden geçer.
 *
 * pdfmake'in gömülü Roboto fontu Türkçe karakterleri (ç ğ ı İ ö ş ü) taşır,
 * bu yüzden ek font yüklemeye gerek yok ve çıktı çevrimdışı da doğru görünür.
 */
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import type { CellTone, DocCell, DocTable } from '../domain/doc';

/** pdfmake sürümleri sanal dosya sistemini farklı yerde tutuyor. */
function installFonts(): void {
  const fonts = pdfFonts as unknown as { pdfMake?: { vfs: unknown }; vfs?: unknown };
  const vfs = fonts.pdfMake?.vfs ?? fonts.vfs;
  if (vfs) (pdfMake as unknown as { vfs: unknown }).vfs = vfs;
}

installFonts();

/* Örnek tablodaki renkler */
const HEADING_BG = '#92d050';
const INK = '#000000';
const GRID = '#808080';

const TONE_COLORS: Record<CellTone, string> = {
  normal: INK,
  paid: '#1f7a3d',
  overdue: '#c00000',
  muted: GRID,
};

const tableLayout = {
  hLineWidth: () => 0.7,
  vLineWidth: () => 0.7,
  hLineColor: () => GRID,
  vLineColor: () => GRID,
  paddingTop: () => 5,
  paddingBottom: () => 5,
  paddingLeft: () => 5,
  paddingRight: () => 5,
};

function cell(value: DocCell) {
  return {
    text: value.text,
    alignment: value.align ?? 'left',
    bold: value.bold ?? false,
    color: TONE_COLORS[value.tone ?? 'normal'],
    // Uzun metinler (IBAN, uzun başlık) sütuna sığsın
    fontSize: value.text.length > 28 ? 8 : 9.5,
  };
}

function buildDefinition(doc: DocTable): TDocumentDefinitions {
  const header = doc.columns.map((column) => ({
    text: column.label,
    alignment: column.align,
    bold: true,
    color: INK,
    fontSize: 9,
  }));

  const body = doc.rows.map((row) => row.map(cell));
  const isEmpty = body.length === 0;

  const emptyNote = {
    table: {
      widths: ['*'],
      body: [
        [
          {
            text: doc.emptyNote ?? 'Kayıt yok.',
            alignment: 'center' as const,
            color: GRID,
            margin: [0, 6, 0, 6] as [number, number, number, number],
          },
        ],
      ],
    },
    layout: tableLayout,
  };

  const totalsTable = {
    table: {
      widths: ['*', 150],
      body: doc.totals.map((total) => [
        { text: total.label, alignment: 'right' as const, bold: true, color: INK },
        {
          text: total.value,
          alignment: 'right' as const,
          bold: true,
          color: INK,
          fillColor: HEADING_BG,
        },
      ]),
    },
    layout: tableLayout,
  };

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [24, 24, 24, 36],
    info: { title: doc.heading, author: 'Timeless' },
    content: [
      // Yeşil başlık şeridi — tablo genişliğinde, ortalanmış
      {
        table: {
          widths: ['*'],
          body: [
            [
              {
                text: doc.heading,
                alignment: 'center' as const,
                bold: true,
                fontSize: 13,
                color: INK,
                fillColor: HEADING_BG,
                margin: [0, 5, 0, 5] as [number, number, number, number],
              },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => INK,
          vLineColor: () => INK,
        },
      },
      {
        table: {
          headerRows: 1,
          widths: doc.columns.map((column) => column.width),
          body: isEmpty ? [header] : [header, ...body],
        },
        layout: tableLayout,
      },
      ...(isEmpty ? [emptyNote] : []),
      totalsTable,
    ],
    defaultStyle: { font: 'Roboto', fontSize: 9.5, color: INK, lineHeight: 1.1 },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: doc.footer, fontSize: 8, color: GRID },
        {
          text: `${currentPage} / ${pageCount}`,
          alignment: 'right' as const,
          fontSize: 8,
          color: GRID,
        },
      ],
      margin: [24, 8, 24, 0] as [number, number, number, number],
    }),
  };
}

/**
 * pdfmake 0.2'nin tip tanımları getBase64/getBlob'u argümansız gösteriyor,
 * ama çalışma zamanı callback olmadan hata veriyor
 * ("getBlob is an async method and needs a callback argument").
 * Bu yüzden gerçek imzayı burada tanımlayıp öyle çağırıyoruz.
 */
interface PdfDocument {
  getBase64(callback: (data: string) => void): void;
  getBlob(callback: (blob: Blob) => void): void;
  open(): void;
}

function createDocument(doc: DocTable): PdfDocument {
  return pdfMake.createPdf(buildDefinition(doc)) as unknown as PdfDocument;
}

export function pdfFileName(doc: DocTable): string {
  return `${doc.fileStem}.pdf`;
}

/** PDF'i base64 olarak üretir (Android paylaşımı ve dosyaya yazma için). */
export function createPdfBase64(doc: DocTable): Promise<string> {
  return new Promise((resolve) => createDocument(doc).getBase64(resolve));
}

/** PDF'i Blob olarak üretir (tarayıcı/masaüstü indirmesi için). */
export function createPdfBlob(doc: DocTable): Promise<Blob> {
  return new Promise((resolve) => createDocument(doc).getBlob(resolve));
}

/** PDF'i yeni sekmede açar. */
export function openPdf(doc: DocTable): void {
  createDocument(doc).open();
}
