/**
 * Belge modelini (domain/doc.ts) Excel (.xlsx) dosyasına çevirir.
 *
 * Görünüm PDF ile aynı: yeşil başlık şeridi, çerçeveli tablo, alt alta
 * satırlar. Tutarlar metin değil gerçek sayı olarak yazılır; böylece Excel'de
 * toplanabilir ve kullanıcının yerel biçimiyle görünür.
 */
import ExcelJS from 'exceljs';
import type { CellTone, DocCell, DocTable } from '../domain/doc';
import type { Currency } from '../domain/types';

const HEADING_BG = 'FF92D050';
const GRID = 'FF808080';

const TONE_COLORS: Record<CellTone, string | undefined> = {
  normal: undefined,
  paid: 'FF1F7A3D',
  overdue: 'FFC00000',
  muted: GRID,
};

/** Para birimi simgesiyle, binlik ayraçlı sayı biçimi. */
const MONEY_FORMAT: Record<Currency, string> = {
  TRY: '#,##0.00" ₺"',
  USD: '#,##0.00" $"',
  EUR: '#,##0.00" €"',
};

const thin = { style: 'thin' as const, color: { argb: GRID } };
const allBorders = { top: thin, left: thin, bottom: thin, right: thin };

export function excelFileName(doc: DocTable): string {
  return `${doc.fileStem}.xlsx`;
}

function applyCell(target: ExcelJS.Cell, value: DocCell): void {
  target.border = allBorders;
  target.alignment = { horizontal: value.align ?? 'left', vertical: 'middle' };

  const color = TONE_COLORS[value.tone ?? 'normal'];
  if (color || value.bold) {
    target.font = { bold: value.bold ?? false, ...(color ? { color: { argb: color } } : {}) };
  }

  if (typeof value.percent === 'number') {
    target.value = value.percent;
    target.numFmt = '0%';
    return;
  }

  if (typeof value.number === 'number') {
    target.value = value.number;
    if (value.currency) target.numFmt = MONEY_FORMAT[value.currency];
    return;
  }

  target.value = value.text;
}

async function buildWorkbook(doc: DocTable): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Timeless';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Timeless', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    views: [{ state: 'frozen', ySplit: 2 }],
  });

  sheet.columns = doc.columns.map((column, index) => ({
    key: `c${index}`,
    width: column.excelWidth,
  }));

  // 1. satır: yeşil başlık şeridi
  const headingRow = sheet.addRow([doc.heading]);
  sheet.mergeCells(1, 1, 1, doc.columns.length);
  const headingCell = headingRow.getCell(1);
  headingCell.font = { bold: true, size: 13, color: { argb: 'FF000000' } };
  headingCell.alignment = { horizontal: 'center', vertical: 'middle' };
  headingCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADING_BG } };
  headingCell.border = allBorders;
  headingRow.height = 24;

  // 2. satır: sütun başlıkları
  const headerRow = sheet.addRow(doc.columns.map((column) => column.label));
  headerRow.eachCell((cell, index) => {
    cell.font = { bold: true, size: 10 };
    cell.alignment = { horizontal: doc.columns[index - 1].align, vertical: 'middle' };
    cell.border = allBorders;
  });
  headerRow.height = 20;

  if (doc.rows.length === 0) {
    const emptyRow = sheet.addRow([doc.emptyNote ?? 'Kayıt yok.']);
    sheet.mergeCells(emptyRow.number, 1, emptyRow.number, doc.columns.length);
    const cell = emptyRow.getCell(1);
    cell.alignment = { horizontal: 'center' };
    cell.font = { color: { argb: GRID } };
    cell.border = allBorders;
  }

  for (const row of doc.rows) {
    const excelRow = sheet.addRow([]);
    row.forEach((value, index) => applyCell(excelRow.getCell(index + 1), value));
  }

  // Toplam satırları — etiket sondan bir önceki sütunda, değer son sütunda
  const labelColumn = Math.max(1, doc.columns.length - 1);
  for (const total of doc.totals) {
    const totalRow = sheet.addRow([]);
    const labelCell = totalRow.getCell(labelColumn);
    labelCell.value = total.label;
    labelCell.font = { bold: true };
    labelCell.alignment = { horizontal: 'right' };
    labelCell.border = allBorders;

    const valueCell = totalRow.getCell(doc.columns.length);
    if (typeof total.number === 'number') {
      valueCell.value = total.number;
      if (total.currency) valueCell.numFmt = MONEY_FORMAT[total.currency];
    } else {
      valueCell.value = total.value;
    }
    valueCell.font = { bold: true };
    valueCell.alignment = { horizontal: 'right' };
    valueCell.border = allBorders;
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADING_BG } };
  }

  sheet.addRow([]);
  const footerRow = sheet.addRow([doc.footer]);
  footerRow.getCell(1).font = { size: 9, color: { argb: GRID } };

  return workbook.xlsx.writeBuffer();
}

/** Excel dosyasını Blob olarak üretir. */
export async function createExcelBlob(doc: DocTable): Promise<Blob> {
  const buffer = await buildWorkbook(doc);
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** Excel dosyasını base64 olarak üretir (Android paylaşımı için). */
export async function createExcelBase64(doc: DocTable): Promise<string> {
  const buffer = await buildWorkbook(doc);
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // Büyük dosyalarda yığın taşmasını önlemek için parça parça
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
