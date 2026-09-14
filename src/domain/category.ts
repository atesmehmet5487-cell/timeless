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

/**
 * Ayarların kategorilerle ilgili kısmı. Yerleşik kategoriler kodda sabit
 * olduğu için adları ve silinmeleri ayrı alanlarda tutulur.
 */
export interface CategorySettings {
  customCategories?: CustomCategory[];
  /** Yerleşik kategorilere kullanıcının verdiği yeni adlar. */
  categoryNames?: Record<string, string>;
  /** Kullanıcının sildiği yerleşik kategoriler. */
  hiddenCategories?: string[];
}

/**
 * "Diğer" silinemez: silinen kategorilerin kayıtları ona düşer, onun da
 * gidecek yeri yok. Adı yine de değiştirilebilir.
 */
export const FALLBACK_CATEGORY: BuiltinCategory = 'diger';

function builtinName(id: BuiltinCategory, settings: CategorySettings): string {
  return settings.categoryNames?.[id]?.trim() || BUILTIN_CATEGORY_LABELS[id];
}

/** Kategori seçilebilir durumda mı — silinmiş ya da bilinmiyorsa hayır. */
export function isCategoryActive(id: Category, settings: CategorySettings = {}): boolean {
  if (isBuiltinCategory(id)) {
    return id === FALLBACK_CATEGORY || !settings.hiddenCategories?.includes(id);
  }
  return (settings.customCategories ?? []).some((c) => c.id === id);
}

/** Silinmiş kategoriyi "Diğer"e çevirir; geçerliyse olduğu gibi bırakır. */
export function resolveCategory(id: Category, settings: CategorySettings = {}): Category {
  return isCategoryActive(id, settings) ? id : FALLBACK_CATEGORY;
}

/** Ekranda ve belgelerde görünecek ad. Silinmiş kategori "Diğer" olarak görünür. */
export function categoryLabel(id: Category, settings: CategorySettings = {}): string {
  const resolved = resolveCategory(id, settings);
  if (isBuiltinCategory(resolved)) return builtinName(resolved, settings);
  return settings.customCategories?.find((c) => c.id === resolved)?.label ?? 'Diğer';
}

/** Seçim listesi: önce yerleşikler, sonra kullanıcının eklediği kategoriler. */
export function categoryOptions(
  settings: CategorySettings = {},
): { id: Category; label: string; custom: boolean }[] {
  return [
    ...BUILTIN_CATEGORIES.filter((id) => isCategoryActive(id, settings)).map((id) => ({
      id: id as Category,
      label: builtinName(id, settings),
      custom: false,
    })),
    ...(settings.customCategories ?? []).map((c) => ({
      id: c.id as Category,
      label: c.label,
      custom: true,
    })),
  ];
}

/** Kategoriye yeni ad verir. Boş ad yerleşik kategoriyi özgün adına döndürür. */
export function renameCategory(
  settings: CategorySettings,
  id: Category,
  label: string,
): Required<CategorySettings> {
  const name = label.trim();
  const customCategories = settings.customCategories ?? [];
  const categoryNames = { ...settings.categoryNames };
  if (isBuiltinCategory(id)) {
    // Anahtar silinmez, boşaltılır: bulut ayarları birleştirerek yazıldığı
    // için silinen anahtar orada eski adıyla kalırdı
    categoryNames[id] = name === BUILTIN_CATEGORY_LABELS[id] ? '' : name;
  }
  return {
    customCategories:
      isBuiltinCategory(id) || !name
        ? customCategories
        : customCategories.map((c) => (c.id === id ? { ...c, label: name } : c)),
    categoryNames,
    hiddenCategories: settings.hiddenCategories ?? [],
  };
}

/** Kategoriyi siler; onu kullanan kayıtlar "Diğer" olarak görünür. */
export function removeCategory(
  settings: CategorySettings,
  id: Category,
): Required<CategorySettings> {
  const hidden = settings.hiddenCategories ?? [];
  return {
    customCategories: (settings.customCategories ?? []).filter((c) => c.id !== id),
    categoryNames: settings.categoryNames ?? {},
    hiddenCategories:
      isBuiltinCategory(id) && id !== FALLBACK_CATEGORY && !hidden.includes(id)
        ? [...hidden, id]
        : hidden,
  };
}
