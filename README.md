# Timeless — Sesli Ödeme Planı Asistanı

Ödeme takvimini sesle veya yazıyla kaydeden, günü gelince hatırlatan, listeyi
PDF olarak WhatsApp'tan paylaşabilen uygulama.
Tek kod tabanı → **Android APK** (Capacitor) + **Windows masaüstü** (Electron) + tarayıcı.

## Komutlar

```bash
npm run dev            # tarayıcıda geliştirme (http://localhost:5173)
npm run electron:dev   # Windows uygulaması (önce npm run dev açık olmalı)
npm test               # birim testler (Vitest)
npm run build          # tip kontrolü + üretim derlemesi
npm run dist           # Windows kurulum dosyası + taşınabilir sürüm
npm run lint           # oxlint
```

> `npm run dist` çıktıyı `%LOCALAPPDATA%	imeless-release` altına yazar.
> Masaüstü OneDrive tarafından izlendiği için paketleme sırasında dosya
> kilitleniyor ve derleme "EPERM" ile düşüyordu; çıktı bu yüzden proje dışında.

## Yapı

```
src/
  domain/    Saf TypeScript çekirdek — platformdan bağımsız, tam test kapsamı
    types.ts        Payment / Override / Occurrence / Settings
    date.ts         "YYYY-AA-GG" gün aritmetiği (saat diliminden etkilenmez)
    recurrence.ts   Tekrar kuralı → takvim günleri
    schedule.ts     Seriler + müdahaleler → ekrandaki liste
    summary.ts      Günün planı → bildirim / sesli okuma / paylaşım metni
    report.ts       Günün planı → tablo satırları
    stats.ts        Gün/hafta/ay/yıl gider özeti, kategori dağılımı
    doc.ts          PDF ve Excel'in ortak belge modeli
    category.ts     Yerleşik + kullanıcı kategorileri
    iban.ts         IBAN biçimi ve mod-97 doğrulaması
    reminders.ts    Hangi bildirim ne zaman çıkacak (60 günlük pencere)
    money.ts        tr-TR tutar biçimi
  nlp/       Türkçe komut motoru
    boundary.ts     Unicode kelime sınırı (JS'in 'si Türkçe harflerde çalışmaz)
    normalize.ts    Küçük harf, ek ayırma, "onbeş" → 15
    dates.ts        "her ayın 15'i", "haftaya salı", "15 Ekim", "ayın sonunda"
    intent.ts       ekle / ertele / ödendi / sil / gönder / listele
    extract.ts      Tutar, para birimi, kategori, başlık
    match.ts        "ziraat kartı" → hangi kayıt
    parse.ts        Giriş noktası
    commands.ts     Ayrıştırma sonucu → uygulanabilir eylem
  services/  Platform adaptörleri (repo, bildirim, ses, PDF, paylaşım)
    pdf.ts          Rapor → A4 yatay PDF (Türkçe karakterler gömülü)
    excel.ts        Rapor → .xlsx (tutarlar gerçek sayı, Excel'de toplanabilir)
    share.ts        WhatsApp / dosya paylaşımı, indirme
  ui/        React ekranları (ana ekran: ay takvimi + seçili günün listesi)
electron/    Windows kabuğu: pencere, tepsi, JSON deposu, arka plan zamanlayıcı
  store.ts   Uygulama durumu ve eylemler
```

### Tasarımın iki kritik noktası

1. **Tarihler metin olarak tutulur** (`2026-09-15`). JS `Date` saat dilimi taşır ve
   "ayın 15'i" cihaz saati değişince 14'üne kayabilir.
2. **Erteleme seriyi bozmaz.** Bir örneğe yapılan müdahale `Override` olarak
   `(paymentId, originalDate)` anahtarına yazılır; "bu ayın 15'ini 20'sine al"
   gelecek ayların 15'ini etkilemez.
3. **Gezinme takvimden.** Ana ekranda kompakt ay takvimi var; bir güne
   dokununca altında o günün listesi açılır ve "ödeme ekle" o günü seçili
   getirir. Takvimdeki noktalar durumu söyler: mavi ödenmemiş, yeşil ödenmiş,
   kırmızı gecikmiş.
4. **Bildirim listesi her seferinde baştan kurulur.** Kimlikler deterministik
   (`daily|2026-09-15`), bu yüzden aynı bildirim iki kez çıkmaz. Android'in
   bekleyen alarm sınırı için pencere 60 günle sınırlı ve uygulama her
   açılışta listeyi yeniliyor.
5. **PDF ve Excel tek kaynaktan.** İkisi de `domain/doc.ts`'teki belge modelini
   okur; günlük ödeme planı da gider tablosu da aynı yoldan geçer, biri değişip
   diğeri geride kalamaz. Görünüm kullanıcının verdiği Excel örneğini izler:
   yeşil başlık şeridi, çerçeveli tablo, alt alta satırlar.
6. **Paylaşımda platform farkı saklanmıyor.** Android'de PDF tek dokunuşta
   WhatsApp'a dosya olarak gider. Masaüstünde WhatsApp'a dosya iliştirilemediği
   için PDF indirilir, WhatsApp hazır metinle açılır — bu sınır arayüzde yazılı.
7. **Hiçbir komut sessizce uygulanmaz.** Sesli/yazılı komut önce ayrıştırılır,
   ne anlaşıldığı onay ekranında gösterilir, uygulama kararı kullanıcınındır.

## Durum

- [x] Faz 0 — İskelet, depolama katmanı (Dexie/IndexedDB), Repository arayüzü
- [x] Faz 1 — Tekrar motoru + erteleme/gecikme mantığı
- [x] Faz 2 — Bugün ekranı, ödeme ekle/düzenle, kayıtlar/arşiv/çöp kutusu
- [x] Faz 3 — Türkçe komut motoru, mikrofon, onay ekranı, sesli okuma
- [x] Faz 4 — Bildirimler: günlük özet, kalem hatırlatmaları, akşam kontrolü;
      Windows kabuğu (tepsi + arka plan zamanlayıcı), Android adaptörü
- [x] Faz 5 — PDF + Excel üretimi, WhatsApp paylaşımı, kişi rehberi
- [x] Gider tablosu — gün/hafta/ay/yıl, kategori dağılımı, PDF + Excel çıktısı
- [x] Kategoriler — "cari" dahil yerleşikler + kullanıcının kendi kategorileri
- [x] IBAN — kayıt başına isteğe bağlı hesap numarası
- [x] Faz 6 — Yedekleme/geri yükleme, geçmiş temizliği, PIN kilidi,
      mükerrer kayıt uyarısı (165 birim test)
- [~] Faz 7 — Windows kurulum dosyası hazır; Android APK için Android Studio
      kurulumu ya da bulut derleme gerekiyor
- [x] Tema seçenekleri — açık/koyu/cihaz + 6 renk

