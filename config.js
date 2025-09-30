module.exports = {
  token: "TOKENINIZI_BURAYA_GIRINIZ",     // BotFather token
  chatId: "@kanaladi",                     // Örn: @ordu_haber_kanali
  intervalMs: 3 * 60 * 1000,                // 3 dakika
  batchSize: 25,                            // Her turda en fazla gönderi
  fetchTimeoutMs: 10000,                    // HTTP timeout (ms)

  enabledCategories: ["gundem","ekonomi","spor","teknoloji","yerel"],
  keywordFilter: "",                        // Örn: "ordu,ünye,fatsa" -> bu kelimelerden en az biri eşleşirse gönderir
  workHours: "09:00-23:00"                  // Çalışma saatleri (sunucu yerel saati). Kapamak için "" bırakın.
};
