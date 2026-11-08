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

let md = `# Só ida São Paulo → Florianópolis — avião e ônibus, 21 a 26/12/2026\n\n`;
md += `Coleta: ${new Date(r.coletadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (horário de Brasília) · Avião: ${r.fonte}, voo direto, tarifa econômica básica (sem bagagem despachada). Ônibus: Buser (Tietê/Barra Funda → Rodoviária de Florianópolis). 1 adulto.\n\n`;

const datas = [...new Set([...r.trechos.filter(t => t.sentido === 'ida').map(t => t.data), ...(r.onibus || []).flatMap(o => o.opcoes.map(x => x.data))])].sort();
const origens = [...new Set(r.trechos.filter(t => t.sentido === 'ida').map(t => t.de))];
const onib = r.onibus || [];
const brl2 = n => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const opcoesOnibus = (() => { const v = new Set(); return onib.flatMap(o => o.opcoes).filter(o => { const k = `${o.data}|${o.partida}|${o.embarque}|${o.preco}`; if (v.has(k)) return false; v.add(k); return true; }); })();
const colOnibus = d => {
  const doDia = opcoesOnibus.filter(o => o.data === d).sort((a, b) => a.preco - b.preco);
  if (doDia.length) return `${brl2(doDia[0].preco)} (${doDia[0].partida})`;
  const busca = onib.find(x => x.data === d);
  return busca && !busca.ok ? 'falhou' : busca ? 'sem horários' : '—';
};
md += `## Menor preço por dia\n\n| Data | Avião ${origens.join(' | Avião ')} | Ônibus |\n|---|${origens.map(() => '---').join('|')}|---|\n`;
for (const d of datas) {
  md += `| ${dia(d)} | ` + origens.map(o => {
    const vs = todas.filter(v => v.data === d && v.de === o);
    if (!vs.length) return r.trechos.some(t => t.sentido === 'ida' && t.de === o && t.data === d) ? 'sem dados' : '—';
    const min = vs[0].preco;
    return `${brl(min)} (${vs.filter(v => v.preco === min).map(v => v.partida).slice(0, 4).join(', ')})`;
  }).join(' | ') + ` | ${colOnibus(d)} |\n`;
}
md += `\n## Avião — mais baratos no geral\n\n${cab}\n${todas.slice(0, 10).map(linha).join('\n')}\n\n`;
md += `## Avião — mais baratos em horário bom (saída entre 07h e 21h)\n\n${cab}\n${todas.filter(confortavel).slice(0, 10).map(linha).join('\n')}\n\n`;

// ônibus
const todosOnibus = [...opcoesOnibus].sort((a, b) => a.preco - b.preco || a.data.localeCompare(b.data));
if (onib.length) {
  md += `## Ônibus (Buser) — mais baratos\n\n| Preço | Data | Saída → chegada | Embarque | Classe | Duração |\n|---|---|---|---|---|---|\n`;
  md += todosOnibus.slice(0, 12).map(o => `| **${brl2(o.preco)}** | ${dia(o.data)} | ${o.partida} → ${o.chegada}${o.chegadaDia ? ' (' + o.chegadaDia + ')' : ''} | ${o.embarque} | ${o.classe}${o.escalas !== 'Direto' ? ', ' + o.escalas : ''} | ${o.duracao} |`).join('\n') + '\n\n';
  const falhas = onib.filter(o => !o.ok).map(o => dia(o.data));
  if (falhas.length) md += `Busca de ônibus falhou em: ${falhas.join(', ')}.\n\n`;
}

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

// Resumo do ônibus
const antOnibus = ant && ant.onibus ? ant.onibus.flatMap(o => o.opcoes).sort((a, b) => a.preco - b.preco)[0] : null;
if (todosOnibus.length) {
  const o = todosOnibus[0];
  const st = !antOnibus ? 'PRIMEIRA' : o.preco < antOnibus.preco ? 'CAIU' : o.preco > antOnibus.preco ? 'SUBIU' : 'IGUAL';
  console.log(`RESUMO_ONIBUS ${st} melhor=${o.preco} anterior=${antOnibus ? antOnibus.preco : '-'} | ${dia(o.data)} ${o.partida} ${o.embarque} ${o.classe}`);
}
