// Gera RELATORIO.md (só ida SP -> Florianópolis) com a coleta mais recente
// e a comparação com a coleta anterior. Uso: node relatorio.js
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'dados');
const arquivos = fs.readdirSync(dir).filter(f => /^\d{4}-.*\.json$/.test(f)).sort();
const ler = f => JSON.parse(fs.readFileSync(path.join(dir, f)));
const r = ler(arquivos[arquivos.length - 1]);

const brl = n => 'R$ ' + n.toLocaleString('pt-BR');
const dia = d => { const [, m, dd] = d.split('-'); const sem = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(d + 'T12:00:00').getDay()]; return `${sem} ${dd}/${m}`; };
const hora = h => parseInt(h.split(':')[0], 10);
const confortavel = v => hora(v.partida) >= 7 && hora(v.partida) < 21; // sai entre 07h e 21h

const idas = res => res.trechos.filter(t => t.sentido === 'ida').flatMap(t => t.voos).sort((a, b) => a.preco - b.preco || a.data.localeCompare(b.data) || a.partida.localeCompare(b.partida));
const linha = v => `| **${brl(v.preco)}** | ${dia(v.data)} | ${v.partida} → ${v.chegada} | ${v.de}→FLN | ${v.cia} |`;
const cab = '| Preço | Data | Horário | Aeroporto | Companhia |\n|---|---|---|---|---|';
const todas = idas(r);

let md = `# Passagem só ida São Paulo → Florianópolis — 21 a 24/11/2026\n\n`;
md += `Coleta: ${new Date(r.coletadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (horário de Brasília) · Fonte: ${r.fonte} · 1 adulto, voo direto, tarifa econômica básica (sem bagagem despachada).\n\n`;

const datas = [...new Set(r.trechos.filter(t => t.sentido === 'ida').map(t => t.data))].sort();
const origens = [...new Set(r.trechos.filter(t => t.sentido === 'ida').map(t => t.de))];
md += `## Menor preço por dia\n\n| Data | ${origens.join(' | ')} |\n|---|${origens.map(() => '---').join('|')}|\n`;
for (const d of datas) {
  md += `| ${dia(d)} | ` + origens.map(o => {
    const vs = todas.filter(v => v.data === d && v.de === o);
    if (!vs.length) return 'sem dados';
    const min = vs[0].preco;
    return `${brl(min)} (${vs.filter(v => v.preco === min).map(v => v.partida).slice(0, 4).join(', ')})`;
  }).join(' | ') + ' |\n';
}
md += `\n## Mais baratas no geral\n\n${cab}\n${todas.slice(0, 10).map(linha).join('\n')}\n\n`;
md += `## Mais baratas em horário bom (saída entre 07h e 21h)\n\n${cab}\n${todas.filter(confortavel).slice(0, 10).map(linha).join('\n')}\n\n`;

// variação por trecho em relação à coleta anterior (só se a anterior também era de ida no mesmo dia/aeroporto)
const ant = arquivos.length > 1 ? ler(arquivos[arquivos.length - 2]) : null;
const minTrecho = (res, t) => { const x = res && res.trechos.find(y => y.sentido === 'ida' && y.de === t.de && y.data === t.data); return x && x.voos.length ? Math.min(...x.voos.map(v => v.preco)) : null; };
md += `## Variação desde a coleta anterior\n\n| Trecho | Data | Agora | Antes |\n|---|---|---|---|\n`;
for (const t of r.trechos.filter(t => t.sentido === 'ida')) {
  const m = minTrecho(r, t); const a = minTrecho(ant, t);
  const seta = a == null || m == null ? '' : m < a ? `⬇️ ${brl(a)}` : m > a ? `⬆️ ${brl(a)}` : '=';
  md += `| ${t.de}→FLN | ${dia(t.data)} | ${m == null ? 'sem dados' : brl(m)} | ${seta} |\n`;
}
md += `\nPreços do Google Voos mudam o tempo todo; confirme no site da companhia antes de comprar.\n`;
fs.writeFileSync(path.join(__dirname, 'RELATORIO.md'), md);
console.log(md);

// Linha de resumo para o monitoramento: melhor preço atual x coleta anterior
const atual = todas[0];
const antMelhor = ant ? idas(ant)[0] : null;
if (atual) {
  const status = !antMelhor ? 'PRIMEIRA' : atual.preco < antMelhor.preco ? 'CAIU' : atual.preco > antMelhor.preco ? 'SUBIU' : 'IGUAL';
  console.log(`RESUMO ${status} melhor=${atual.preco} anterior=${antMelhor ? antMelhor.preco : '-'} | ${dia(atual.data)} ${atual.partida} ${atual.de}→FLN ${atual.cia}`);
}
