// Busca passagens São Paulo (GRU/CGH) <-> Florianópolis (FLN) no Google Voos.
// Uso: node buscar.js   -> grava dados/AAAA-MM-DDTHH-MM.json e atualiza dados/historico.json
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ORIGENS = ['GRU', 'CGH'];
const IDAS = ['2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24'];
const VOLTAS = []; // só ida
const DADOS = path.join(__dirname, 'dados');

function trechos() {
  const t = [];
  for (const o of ORIGENS) {
    for (const d of IDAS) t.push({ sentido: 'ida', de: o, para: 'FLN', data: d });
    for (const d of VOLTAS) t.push({ sentido: 'volta', de: 'FLN', para: o, data: d });
  }
  return t;
}

function parsePreco(s) {
  const m = s.match(/R\$\s?([\d.]+)/);
  return m ? parseInt(m[1].replace(/\./g, ''), 10) : null;
}

async function buscarTrecho(page, t) {
  const q = `voos de ${t.de} para ${t.para} em ${t.data} só ida sem escalas`;
  const url = 'https://www.google.com/travel/flights?q=' + encodeURIComponent(q) + '&hl=pt-BR&curr=BRL&gl=BR';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => /R\$/.test(document.body.innerText) && !/Buscando resultados/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  // abre "mais voos", se existir
  const mais = page.locator('button:has-text("Mais voos"), button:has-text("Ver mais voos")').first();
  if (await mais.count()) { await mais.click().catch(() => {}); await page.waitForTimeout(2500); }
  const itens = await page.$$eval('li', els => els.map(e => e.innerText).filter(x => /R\$/.test(x) && /\d{1,2}:\d{2}/.test(x)));
  const voos = [];
  for (const txt of itens) {
    const linhas = txt.split('\n').map(s => s.trim()).filter(Boolean);
    const horas = txt.match(/\d{1,2}:\d{2}/g) || [];
    const preco = parsePreco(txt);
    if (!preco || horas.length < 2) continue;
    const rota = linhas.find(l => /^[A-Z]{3}–[A-Z]{3}$/.test(l)) || '';
    const escalas = linhas.find(l => /escala/i.test(l)) || '';
    const duracao = linhas.find(l => /^\d+ h( \d+ min)?$|^\d+ min$/.test(l)) || '';
    const idxCia = linhas.findIndex(l => /^\d{1,2}:\d{2}/.test(l)) ;
    let cia = linhas.find(l => /LATAM|Gol|GOL|Azul|Avianca|Voepass|Aerolíneas|Copa|JetSMART|Sky/i.test(l)) || '';
    cia = cia.replace(/Operado por.*/,'').trim();
    voos.push({ ...t, partida: horas[0], chegada: horas[1], cia, duracao, rota, escalas, preco });
  }
  // descarta os blocos de detalhe expandidos (texto longo duplicado) e deduplica
  const vistos = new Set();
  return voos.filter(v => v.cia && v.cia.length <= 30 && v.rota === `${t.de}–${t.para}`)
             .filter(v => { const k = `${v.partida}|${v.preco}`; if (vistos.has(k)) return false; vistos.add(k); return true; });
}

(async () => {
  fs.mkdirSync(DADOS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ locale: 'pt-BR', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' });
  const quando = new Date().toISOString();
  const resultado = { coletadoEm: quando, fonte: 'Google Voos', trechos: [] };
  for (const t of trechos()) {
    let voos = [];
    for (let tent = 0; tent < 4 && !voos.length; tent++) {
      if (tent) await page.waitForTimeout(5000 * tent);
      try { voos = await buscarTrecho(page, t); } catch (e) { console.error('erro', t, e.message); }
    }
    console.error(`${t.de}->${t.para} ${t.data}: ${voos.length} voos, menor R$ ${voos.length ? Math.min(...voos.map(v => v.preco)) : '-'}`);
    resultado.trechos.push({ ...t, voos });
  }
  await browser.close();
  const nome = quando.slice(0, 16).replace(':', '-');
  fs.writeFileSync(path.join(DADOS, `${nome}.json`), JSON.stringify(resultado, null, 1));
  const histPath = path.join(DADOS, 'historico.json');
  const hist = fs.existsSync(histPath) ? JSON.parse(fs.readFileSync(histPath)) : [];
  const resumo = { coletadoEm: quando, menores: {} };
  for (const tr of resultado.trechos) if (tr.voos.length) resumo.menores[`${tr.de}-${tr.para}-${tr.data}`] = Math.min(...tr.voos.map(v => v.preco));
  hist.push(resumo);
  fs.writeFileSync(histPath, JSON.stringify(hist, null, 1));
  console.log(path.join(DADOS, `${nome}.json`));
})();
