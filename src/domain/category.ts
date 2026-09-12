/**
 * Kategoriler.
 *
 * Yerleşik kategoriler sabittir; kullanıcı bunlara kendi kategorilerini
 * ekleyebilir. Özel kategoriler ayarlarda saklanır, kayıtlar yalnızca
 * kategorinin kimliğini tutar.
 */

export const BUILTIN_CATEGORIES = [
  'kart',
  'cari',
  'fatura',
  'maas',
  'kira',
  'vergi',
  'sigorta',
  'taksit',
  'kredi',
  'diger',
] as const;

export type BuiltinCategory = (typeof BUILTIN_CATEGORIES)[number];

/** Yerleşik ya da kullanıcının eklediği kategori kimliği. */
export type Category = BuiltinCategory | (string & {});

export const BUILTIN_CATEGORY_LABELS: Record<BuiltinCategory, string> = {
  kart: 'Kredi Kartı',
  cari: 'Cari Hesap',
  fatura: 'Fatura',
  maas: 'Maaş',
  kira: 'Kira',
  vergi: 'Vergi',
  sigorta: 'Sigorta',
  taksit: 'Taksit',
  kredi: 'Kredi',
  diger: 'Diğer',
};

export interface CustomCategory {
  /** "ozel-1757..." biçiminde, yerleşiklerle çakışmayan kimlik. */
  id: string;
  label: string;
}

/** Kullanıcının yazdığı addan kimlik üretir. */
export function makeCategoryId(label: string): string {
  const slug = label
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return `ozel-${slug || 'kategori'}-${Date.now().toString(36).slice(-4)}`;
}

export function isBuiltinCategory(id: string): id is BuiltinCategory {
  return (BUILTIN_CATEGORIES as readonly string[]).includes(id);
}

/** Ekranda ve belgelerde görünecek ad. */
export function categoryLabel(id: Category, custom: CustomCategory[] = []): string {
  if (isBuiltinCategory(id)) return BUILTIN_CATEGORY_LABELS[id];
  return custom.find((c) => c.id === id)?.label ?? 'Diğer';
}

/** Seçim listesi: önce yerleşikler, sonra kullanıcının eklediği kategoriler. */
export function categoryOptions(
  custom: CustomCategory[] = [],
): { id: Category; label: string; custom: boolean }[] {
  return [
    ...BUILTIN_CATEGORIES.map((id) => ({
      id: id as Category,
      label: BUILTIN_CATEGORY_LABELS[id],
      custom: false,
    })),
    ...custom.map((c) => ({ id: c.id as Category, label: c.label, custom: true })),
  ];
}
