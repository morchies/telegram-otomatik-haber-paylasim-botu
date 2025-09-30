const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const Parser = require('rss-parser');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const config = require('./config');
const FEEDS = require('./feeds.json');

const POSTED_PATH = path.join(__dirname, 'posted.json');
const STATE_PATH  = path.join(__dirname, 'state.json');

// persistent stores
let posted = [];
if (fs.existsSync(POSTED_PATH)) {
  try { posted = JSON.parse(fs.readFileSync(POSTED_PATH, 'utf8')); } catch(e){ posted = []; }
} else { fs.writeFileSync(POSTED_PATH, JSON.stringify([], null, 2)); }
const postedSet = new Set(posted);

let state = { running: true, lastRun: null, totalSent: 0, totalErrors: 0 };
if (fs.existsSync(STATE_PATH)) {
  try { state = { ...state, ...JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) }; } catch(e){}
} else { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2)); }

function savePosted(){ fs.writeFileSync(POSTED_PATH, JSON.stringify([...postedSet], null, 2)); }
function saveState(){ fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2)); }

const bot = new TelegramBot(config.token, { polling: true });
const parser = new Parser({ timeout: config.fetchTimeoutMs || 10000 });

function nowHHMM(){
  const d = new Date();
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  return `${hh}:${mm}`;
}
function inWorkHours(){
  if (!config.workHours || config.workHours.trim().length < 3) return true;
  if (config.workHours.toLowerCase() === 'off') return true;
  const cur = nowHHMM();
  const m = /^\s*(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s*$/.exec(config.workHours);
  if (!m) return true;
  const [_, start, end] = m;
  return (cur >= start && cur <= end);
}

function getEnabledFeedUrls(){
  const enabled = new Set((config.enabledCategories||[]).map(s => s.toLowerCase()));
  let urls = [];
  for (const [cat, list] of Object.entries(FEEDS)){
    if (enabled.has(cat.toLowerCase())) urls = urls.concat(list);
  }
  return urls;
}

function buildKeywordSet(){
  if (!config.keywordFilter) return null;
  const parts = String(config.keywordFilter)
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  return parts.length ? new Set(parts) : null;
}

async function getOgImage(url) {
  try {
    const res = await fetch(url, { timeout: config.fetchTimeoutMs || 10000 });
    const html = await res.text();
    const $ = cheerio.load(html);
    const sels = [
      'meta[property="og:image"]','meta[name="og:image"]',
      'meta[property="twitter:image"]','meta[name="twitter:image"]',
      'meta[property="og:image:url"]','meta[name="og:image:url"]'
    ];
    for (const s of sels){
      const content = $(s).attr('content');
      if (content) return content;
    }
  } catch(e){ /* ignore */ }
  return null;
}

async function sendNewsItem(item){
  const title = item.title || 'Başlıksız Haber';
  const link  = item.link || item.guid || '';
  if (!link || postedSet.has(link)) return;

  // keyword filter
  const kws = buildKeywordSet();
  if (kws){
    const hay = (title + ' ' + (item.contentSnippet || '')).toLowerCase();
    let matched = false;
    for (const k of kws){ if (hay.includes(k)) { matched = true; break; } }
    if (!matched) return; // skip if none matched
  }

  // image
  let imageUrl = null;
  if (item.enclosure && item.enclosure.url) imageUrl = item.enclosure.url;
  else if (item['media:content'] && item['media:content']['$']?.url) imageUrl = item['media:content']['$'].url;
  else imageUrl = await getOgImage(link);

  const caption = `📰 ${title}\n\n🔗 ${link}`;
  try{
    if (imageUrl) await bot.sendPhoto(config.chatId, imageUrl, { caption });
    else await bot.sendMessage(config.chatId, caption);
    postedSet.add(link);
    state.totalSent += 1;
    savePosted(); saveState();
  }catch(e){
    state.totalErrors += 1; saveState();
    try{
      await bot.sendMessage(config.chatId, caption);
      postedSet.add(link);
      state.totalSent += 1;
      savePosted(); saveState();
    }catch(e2){ /* ignore */ }
  }
}

async function checkFeedsOnce(){
  let sentThisRun = 0, checked = 0;
  if (!inWorkHours()) { state.lastRun = new Date().toISOString(); saveState(); return {sentThisRun, checked}; }
  const urls = getEnabledFeedUrls();
  for (const url of urls){
    if (sentThisRun >= (config.batchSize || 25)) break;
    try{
      const feed = await parser.parseURL(url);
      checked += 1;
      const items = (feed.items||[]).slice(0,5);
      for (const it of items){
        if (sentThisRun >= (config.batchSize || 25)) break;
        const link = it.link || it.guid;
        if (!link || postedSet.has(link)) continue;
        await sendNewsItem(it);
        sentThisRun += 1;
      }
    }catch(e){ /* ignore per-feed */ }
  }
  state.lastRun = new Date().toISOString();
  saveState();
  return { sentThisRun, checked };
}

// commands
bot.onText(/^\/start$/i, (msg)=>{
  state.running = true; saveState();
  bot.sendMessage(msg.chat.id, '✅ Otomatik çalışma **başladı**');
});
bot.onText(/^\/stop$/i, (msg)=>{
  state.running = false; saveState();
  bot.sendMessage(msg.chat.id, '⏸️ Otomatik çalışma **durdu**');
});
bot.onText(/^\/status$/i, (msg)=>{
  const enabled = (config.enabledCategories||[]).join(', ') || '-';
  bot.sendMessage(msg.chat.id, `ℹ️ Durum:
• running: ${state.running ? '✅' : '⏸️'}
• lastRun: ${state.lastRun || '-'}
• totalSent: ${state.totalSent}
• totalErrors: ${state.totalErrors}
• enabledCategories: ${enabled}
• keywordFilter: ${config.keywordFilter || '-'}
• workHours: ${config.workHours || 'off'}`);
});
bot.onText(/^\/categories$/i, (msg)=>{
  const cats = Object.keys(FEEDS).sort().join(', ');
  bot.sendMessage(msg.chat.id, `📁 Kategoriler: ${cats}`);
});
bot.onText(/^\/enable\s+(\w+)/i, (msg, m)=>{
  const cat = (m[1]||'').toLowerCase();
  if (!FEEDS[cat]) return bot.sendMessage(msg.chat.id, `Kategori bulunamadı: ${cat}`);
  if (!config.enabledCategories.map(s=>s.toLowerCase()).includes(cat)) config.enabledCategories.push(cat);
  bot.sendMessage(msg.chat.id, `✅ Etkin: ${cat}`);
});
bot.onText(/^\/disable\s+(\w+)/i, (msg, m)=>{
  const cat = (m[1]||'').toLowerCase();
  config.enabledCategories = (config.enabledCategories||[]).filter(c => c.toLowerCase() !== cat);
  bot.sendMessage(msg.chat.id, `⏸️ Devre dışı: ${cat}`);
});
bot.onText(/^\/setfilter\s+(.+)/i, (msg, m)=>{
  config.keywordFilter = (m[1]||'').trim();
  bot.sendMessage(msg.chat.id, `🔎 Filtre güncellendi: ${config.keywordFilter}`);
});
bot.onText(/^\/clearfilter$/i, (msg)=>{
  config.keywordFilter = "";
  bot.sendMessage(msg.chat.id, '🧹 Filtre temizlendi.');
});
bot.onText(/^\/sethours\s+(.+)/i, (msg, m)=>{
  const v = (m[1]||'').trim();
  if (v.toLowerCase() === 'off') { config.workHours = ''; bot.sendMessage(msg.chat.id, '⏰ Çalışma saatleri kapatıldı.'); return; }
  const ok = /^\s*\d{2}:\d{2}\s*-\s*\d{2}:\d{2}\s*$/.test(v);
  if (!ok) return bot.sendMessage(msg.chat.id, 'Hatalı format. Örn: /sethours 09:00-23:00 veya /sethours off');
  config.workHours = v;
  bot.sendMessage(msg.chat.id, `⏰ Çalışma saatleri: ${v}`);
});
bot.onText(/^\/manual$/i, async (msg)=>{
  bot.sendMessage(msg.chat.id, '⚙️ Manuel kontrol başlıyor...');
  const r = await checkFeedsOnce();
  bot.sendMessage(msg.chat.id, `✅ Bitti. Bu turda gönderilen: ${r.sentThisRun} | Kontrol edilen feed: ${r.checked}`);
});

// loop
async function loop(){
  if (state.running) await checkFeedsOnce();
  setTimeout(loop, config.intervalMs || (3*60*1000));
}
loop();

console.log('Telegram Haber Botu PLUS çalışıyor. Komutlar: /start /stop /manual /status /categories /enable /disable /setfilter /clearfilter /sethours');
