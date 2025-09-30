# 🤖 Telegram Otomatik Haber Paylaşma Botu PLUS
Kategorilere göre RSS, anahtar kelime filtresi ve çalışma saatleri desteğiyle gelişmiş sürüm.

## Kurulum
1) Node.js 18+
2) `npm install`
3) `config.js` içindeki `token`, `chatId`, `enabledCategories`, `keywordFilter`, `workHours` ayarlarını yapın.
4) `npm start`

## Komutlar
- `/start`  → otomatik çalışmayı başlatır
- `/stop`   → otomatik çalışmayı durdurur
- `/manual` → anında kontrol eder
- `/status` → durum, filtre, saat ve aktif kategorileri gösterir
- `/setfilter kelimeler` → virgülle ayırın (örn: `/setfilter ordu, ünye`)
- `/clearfilter` → filtreyi temizler
- `/categories` → tüm kategorileri listeler
- `/enable kategori` → kategoriyi etkinleştirir
- `/disable kategori` → kategoriyi devre dışı bırakır
- `/sethours 09:00-23:00` → çalışma saatlerini ayarlar (boş için `/sethours off`)

## Dosyalar
- `feeds.json` → kategorize RSS listeleri (200+)
- `posted.json` → paylaşılan link kayıtları
- `state.json` → çalışma durumu / sayaçlar
