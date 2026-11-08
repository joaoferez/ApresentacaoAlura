// Gera RELATORIO.md com as melhores combinações ida+volta da coleta mais recente
// e a comparação com a coleta anterior. Uso: node relatorio.js
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'dados');
const arquivos = fs.readdirSync(dir).filter(f => /^\d{4}-.*\.json$/.test(f)).sort();
const r = JSON.parse(fs.readFileSync(path.join(dir, arquivos[arquivos.length - 1])));
const hist = JSON.parse(fs.readFileSync(path.join(dir, 'historico.json')));

const brl = n => 'R$ ' + n.toLocaleString('pt-BR');
const dia = d => { const [, m, dd] = d.split('-'); const sem = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(d + 'T12:00:00').getDay()]; return `${sem} ${dd}/${m}`; };
const hora = h => parseInt(h.split(':')[0], 10);
const confortavel = v => hora(v.partida) >= 7 && hora(v.partida) < 21; // sai entre 07h e 21h

const pegaIdas = res => res.trechos.filter(t => t.sentido === 'ida').flatMap(t => t.voos);
const pegaVoltas = res => res.trechos.filter(t => t.sentido === 'volta').flatMap(t => t.voos);
const idas = pegaIdas(r);
const voltas = pegaVoltas(r);

function combos(filtro, res = r) {
  const c = [];
  for (const i of pegaIdas(res).filter(filtro)) for (const v of pegaVoltas(res).filter(filtro)) {
    if (v.data <= i.data) continue; // volta em dia posterior à ida
    c.push({ i, v, total: i.preco + v.preco });
  }
  return c.sort((a, b) => a.total - b.total);
}
// Uma linha por combinação de datas+aeroportos; lista os horários que saem pelo mesmo preço.
function agrupado(lista, n) {
  const grupos = new Map();
  for (const c of lista) {
    const k = `${c.i.data}|${c.i.de}|${c.v.data}|${c.v.para}`;
    if (!grupos.has(k)) grupos.set(k, { ...c, horasIda: new Set(), horasVolta: new Set() });
    const g = grupos.get(k);
    if (c.i.preco === g.i.preco) g.horasIda.add(`${c.i.partida} ${c.i.cia}`);
    if (c.v.preco === g.v.preco) g.horasVolta.add(`${c.v.partida} ${c.v.cia}`);
  }
  return [...grupos.values()].sort((a, b) => a.total - b.total).slice(0, n);
}
const lista = s => [...s].slice(0, 4).join(', ') + (s.size > 4 ? ` +${s.size - 4}` : '');
const linha = g => `| **${brl(g.total)}** | ${dia(g.i.data)} ${g.i.de}→FLN ${brl(g.i.preco)}<br>${lista(g.horasIda)} | ${dia(g.v.data)} FLN→${g.v.para} ${brl(g.v.preco)}<br>${lista(g.horasVolta)} |`;
const cab = '| Total | Ida (horários de saída) | Volta (horários de saída) |\n|---|---|---|';

let md = `# Passagens São Paulo ⇄ Florianópolis — 21 a 24/11/2026\n\n`;
md += `Coleta: ${new Date(r.coletadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (horário de Brasília) · Fonte: ${r.fonte} · 1 adulto, voos diretos, tarifa econômica básica (sem bagagem despachada). GRU e CGH podem ser misturados (ida por um, volta por outro).\n\n`;

// grade: menor total por data de ida x data de volta
const todas = combos(() => true);
const datasIda = [...new Set(idas.map(v => v.data))].sort();
const datasVolta = [...new Set(voltas.map(v => v.data))].sort();
md += `## Menor total por data (ida × volta)\n\n| Ida \\ Volta | ${datasVolta.map(dia).join(' | ')} |\n|---|${datasVolta.map(() => '---').join('|')}|\n`;
for (const di of datasIda) {
  md += `| ${dia(di)} | ` + datasVolta.map(dv => { const c = todas.find(x => x.i.data === di && x.v.data === dv); return c ? brl(c.total) : '—'; }).join(' | ') + ' |\n';
}
md += `\n## Ida sáb 21/11 e volta ter 24/11 (a semana inteira)\n\n${cab}\n${agrupado(todas.filter(c => c.i.data === '2026-11-21' && c.v.data === '2026-11-24'), 4).map(linha).join('\n')}\n\n`;
md += `## Mais baratas no geral\n\n${cab}\n${agrupado(todas, 6).map(linha).join('\n')}\n\n`;
md += `## Mais baratas em horário bom (saída entre 07h e 21h)\n\n${cab}\n${agrupado(combos(confortavel), 6).map(linha).join('\n')}\n\n`;

md += `## Menor preço por trecho\n\n| Trecho | Data | Agora | Coleta anterior |\n|---|---|---|---|\n`;
const ant = hist.length > 1 ? hist[hist.length - 2].menores : {};
for (const t of r.trechos) {
  if (!t.voos.length) { md += `| ${t.de}→${t.para} | ${dia(t.data)} | sem dados | |\n`; continue; }
  const m = Math.min(...t.voos.map(v => v.preco)); const k = `${t.de}-${t.para}-${t.data}`;
  const a = ant[k]; const seta = a == null ? '' : m < a ? ` ⬇️ ${brl(a)}` : m > a ? ` ⬆️ ${brl(a)}` : ' =';
  md += `| ${t.de}→${t.para} | ${dia(t.data)} | ${brl(m)} | ${seta} |\n`;
}
md += `\nPreços do Google Voos mudam o tempo todo; confirme no site da companhia antes de comprar.\n`;
fs.writeFileSync(path.join(__dirname, 'RELATORIO.md'), md);
console.log(md);

// Linha de resumo para o monitoramento: melhor total atual x coleta anterior
const melhor = res => { const c = combos(() => true, res); return c.length ? c[0] : null; };
const atual = melhor(r);
const anterior = arquivos.length > 1 ? melhor(JSON.parse(fs.readFileSync(path.join(dir, arquivos[arquivos.length - 2])))) : null;
if (atual) {
  const desc = `${dia(atual.i.data)} ${atual.i.partida} ${atual.i.de}→FLN + ${dia(atual.v.data)} ${atual.v.partida} FLN→${atual.v.para}`;
  const status = !anterior ? 'PRIMEIRA' : atual.total < anterior.total ? 'CAIU' : atual.total > anterior.total ? 'SUBIU' : 'IGUAL';
  console.log(`RESUMO ${status} melhor=${atual.total} anterior=${anterior ? anterior.total : '-'} | ${desc}`);
}
