/**
 * Belgeleri (günlük ödeme planı, gider tablosu) dışarı çıkarma: PDF ve Excel.
 *
 * Android: dosya Belgeler klasörüne yazılır ve sistem paylaş menüsüyle
 *   WhatsApp'a dosya olarak gider.
 * Masaüstü/tarayıcı: dosya indirilir; WhatsApp Web/uygulaması hazır metinle
 *   açılır. Dürüst sınır: masaüstünde WhatsApp'a dosyayı uygulama iliştiremez,
 *   kullanıcı indirilen dosyayı sohbete sürükler. Android'de böyle bir kısıt yok.
 */
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { whatsappUrl } from '../domain/phone';
import type { DocTable } from '../domain/doc';
import type { DayPlan } from '../domain/schedule';
import { shareText } from '../domain/summary';
import type { Contact, ISODate } from '../domain/types';
import { platformKind } from './platform';

export interface ShareResult {
  /** Kullanıcıya gösterilecek sonuç mesajı. */
  message: string;
  /** Kaydedilen dosyanın yolu (varsa). */
  path?: string;
}

export type DocumentKind = 'pdf' | 'excel';

/**
 * pdfmake ve exceljs birlikte birkaç MB tutuyor. Açılışta yüklenmesinler diye
 * yalnızca belge üretilirken içeri alınırlar.
 */
const loadPdf = () => import('./pdf');
const loadExcel = () => import('./excel');

interface GeneratedDocument {
  fileName: string;
  blob(): Promise<Blob>;
  base64(): Promise<string>;
}

async function makeDocument(kind: DocumentKind, doc: DocTable): Promise<GeneratedDocument> {
  if (kind === 'excel') {
    const { createExcelBase64, createExcelBlob, excelFileName } = await loadExcel();
    return {
      fileName: excelFileName(doc),
      blob: () => createExcelBlob(doc),
      base64: () => createExcelBase64(doc),
    };
  }
  const { createPdfBase64, createPdfBlob, pdfFileName } = await loadPdf();
  return {
    fileName: pdfFileName(doc),
    blob: () => createPdfBlob(doc),
    base64: () => createPdfBase64(doc),
  };
}

function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Blob URL'i hemen serbest bırakmak indirmeyi kesebiliyor
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const KIND_LABELS: Record<DocumentKind, string> = { pdf: 'PDF', excel: 'Excel' };

/**
 * Belgeyi PDF veya Excel olarak paylaşır.
 * Android'de tek dokunuşta WhatsApp'a dosya gider; masaüstünde dosya indirilir
 * ve WhatsApp hazır metinle açılır.
 */
export async function shareDocument(
  kind: DocumentKind,
  doc: DocTable,
  plan: DayPlan,
  todayISO: ISODate,
  contact?: Contact,
): Promise<ShareResult> {
  const generated = await makeDocument(kind, doc);
  const text = shareText(plan, todayISO);
  const label = KIND_LABELS[kind];

  if (platformKind() === 'android') {
    const written = await Filesystem.writeFile({
      path: generated.fileName,
      data: await generated.base64(),
      directory: Directory.Documents,
      recursive: true,
    });
    await Share.share({
      title: 'Ödeme Planı',
      text,
      url: written.uri,
      dialogTitle: 'Ödeme planını gönder',
    });
    return { message: 'Paylaşım penceresi açıldı', path: written.uri };
  }

  downloadBlob(await generated.blob(), generated.fileName);
  openExternal(whatsappUrl(text, contact));
  return {
    message: contact
      ? `${label} indirildi, ${contact.name} ile WhatsApp açıldı — dosyayı sohbete sürükle`
      : `${label} indirildi ve WhatsApp açıldı — dosyayı sohbete sürükle`,
    path: generated.fileName,
  };
}

/** Belgeyi dosya olarak kaydeder/indirir, paylaşmaz. */
export async function saveDocument(kind: DocumentKind, doc: DocTable): Promise<ShareResult> {
  const generated = await makeDocument(kind, doc);

  if (platformKind() === 'android') {
    const written = await Filesystem.writeFile({
      path: generated.fileName,
      data: await generated.base64(),
      directory: Directory.Documents,
      recursive: true,
    });
    return { message: `Belgeler klasörüne kaydedildi: ${generated.fileName}`, path: written.uri };
  }

  downloadBlob(await generated.blob(), generated.fileName);
  return { message: `İndirildi: ${generated.fileName}`, path: generated.fileName };
}

/**
 * Excel önizlemesi: dosya indirilir, sistemdeki tablo programında açılır.
 * Tarayıcı bir .xlsx dosyasını kendi içinde gösteremediği için tek yol bu.
 */
export function previewExcel(doc: DocTable): Promise<ShareResult> {
  return saveDocument('excel', doc);
}
