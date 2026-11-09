// Busca passagens São Paulo (GRU/CGH) <-> Florianópolis (FLN) no Google Voos.
// Uso: node buscar.js   -> grava dados/AAAA-MM-DDTHH-MM.json e atualiza dados/historico.json
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ORIGENS = ['GRU', 'CGH'];
const IDAS = ['2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-26'];
const VOLTAS = []; // só ida
// Ônibus São Paulo -> Florianópolis (Buser): só saídas na noite de 25/12 (a partir das 18h)
// ou na manhã de 26/12 (até 11h59, incluindo a madrugada).
const DATAS_ONIBUS = ['2026-12-25', '2026-12-26'];
const janelaOnibus = o => (o.data === '2026-12-25' && o.partida >= '18:00') || (o.data === '2026-12-26' && o.partida < '12:00');
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

// Ônibus na Buser. Retorna lista (pode ser vazia se não houver horários) ou lança erro se a página não carregar.
async function buscarOnibus(page, data) {
  await page.goto(`https://www.buser.com.br/onibus/sao-paulo-sp/florianopolis-sc?ida=${data}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => /horários? de ônibus encontrad|Nenhum|não encontramos/i.test(document.body.innerText), null, { timeout: 30000 });
  // espera a lista completa: N botões "Selecionar" depois de "Todos os horários" para "N horários encontrados"
  const completa = await page.waitForFunction(() => {
    const t = document.body.innerText;
    const m = t.match(/(\d+) horários? de ônibus encontrad/);
    if (!m) return true;
    const i = t.indexOf('Todos os horários');
    if (i < 0) return false;
    return (t.slice(i).match(/\nSelecionar\n/g) || []).length >= parseInt(m[1], 10);
  }, null, { timeout: 25000 }).then(() => true).catch(() => false);
  if (!completa) throw new Error('lista de ônibus incompleta');
  await page.waitForTimeout(1500);
  const texto = await page.evaluate(() => document.body.innerText);
  const ini = texto.indexOf('Encontramos para você');
  if (ini < 0) return [];
  const fim = texto.indexOf('Encontrou o que estava procurando', ini);
  const linhas = texto.slice(ini, fim > 0 ? fim : undefined).split('\n').map(s => s.trim()).filter(Boolean);
  const out = []; let janela = [];
  for (const l of linhas) {
    const m = l.match(/^R\$\s?([\d.]+,\d{2})$/); // preço à vista (ignora "3x R$ ...")
    if (!m) { janela.push(l); continue; }
    const horas = janela.filter(x => /^\d{2}:\d{2}$/.test(x));
    if (horas.length >= 2) {
      const iCh = janela.lastIndexOf(horas[horas.length - 1]);
      const iPa = janela.lastIndexOf(horas[horas.length - 2]);
      const datas = janela.slice(iPa).filter(x => /^\d{2}\/\d{2}$/.test(x));
      const pIdx = janela.indexOf('Poltrona');
      // data real de saída (a Buser mistura "horários após meia-noite" do dia seguinte)
      const dataSaida = datas[0] ? `${data.slice(0, 4)}-${datas[0].slice(3, 5)}-${datas[0].slice(0, 2)}` : data;
      let chegadaDia = datas[1] || '';
      if (!chegadaDia) { const dd = new Date(dataSaida + 'T12:00:00'); if (janela[iCh] < janela[iPa]) dd.setDate(dd.getDate() + 1); chegadaDia = `${String(dd.getDate()).padStart(2, '0')}/${String(dd.getMonth() + 1).padStart(2, '0')}`; }
      out.push({
        data: dataSaida, buscaData: data, partida: janela[iPa], chegada: janela[iCh],
        chegadaDia,
        embarque: janela.slice(iPa, iCh).find(x => /Terminal|Rodovi|Barra Funda|Tietê|Jabaquara/i.test(x)) || '',
        duracao: janela.find(x => /^\d+h(\d+min)?$/.test(x)) || '',
        classe: pIdx >= 0 ? (janela[pIdx + 1] || '') : '',
        escalas: janela.some(x => /Escala/i.test(x)) ? (janela.find(x => /Escala/i.test(x)) || '').trim() : 'Direto',
        preco: parseFloat(m[1].replace(/\./g, '').replace(',', '.')),
      });
    }
    janela = [];
  }
  const vistos = new Set();
  return out.filter(o => { const k = `${o.data}|${o.partida}|${o.embarque}|${o.preco}`; if (vistos.has(k)) return false; vistos.add(k); return true; });
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
  resultado.onibus = [];
  for (const d of DATAS_ONIBUS) {
    let lista = null;
    for (let tent = 0; tent < 3 && lista === null; tent++) {
      if (tent) await page.waitForTimeout(5000 * tent);
      try { lista = await buscarOnibus(page, d); } catch (e) { console.error('erro onibus', d, e.message.split('\n')[0]); }
    }
    const naJanela = (lista || []).filter(janelaOnibus);
    console.error(`ONIBUS SP->Florianópolis busca ${d}: ${lista ? lista.length : 0} horários, ${naJanela.length} na janela, menor R$ ${naJanela.length ? Math.min(...naJanela.map(o => o.preco)) : '-'}`);
    resultado.onibus.push({ data: d, fonte: 'Buser', ok: lista !== null, opcoes: (lista || []).filter(janelaOnibus) });
  }
  await browser.close();
  const nome = quando.slice(0, 16).replace(':', '-');
  fs.writeFileSync(path.join(DADOS, `${nome}.json`), JSON.stringify(resultado, null, 1));
  const histPath = path.join(DADOS, 'historico.json');
  const hist = fs.existsSync(histPath) ? JSON.parse(fs.readFileSync(histPath)) : [];
  const resumo = { coletadoEm: quando, menores: {} };
  for (const tr of resultado.trechos) if (tr.voos.length) resumo.menores[`${tr.de}-${tr.para}-${tr.data}`] = Math.min(...tr.voos.map(v => v.preco));
  for (const o of resultado.onibus) if (o.opcoes.length) resumo.menores[`ONIBUS-${o.data}`] = Math.min(...o.opcoes.map(x => x.preco));
  hist.push(resumo);
  fs.writeFileSync(histPath, JSON.stringify(hist, null, 1));
  console.log(path.join(DADOS, `${nome}.json`));
})();
