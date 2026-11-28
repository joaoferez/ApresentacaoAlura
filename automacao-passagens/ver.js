// Mostra os voos mais baratos de cada trecho do arquivo de coleta mais recente.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'dados');
const arq = process.argv[2] || fs.readdirSync(dir).filter(f => /^\d{4}-.*\.json$/.test(f)).sort().pop();
const r = JSON.parse(fs.readFileSync(path.join(dir, path.basename(arq))));
for (const t of r.trechos) {
  console.log(`\n${t.de}->${t.para} ${t.data}`);
  [...t.voos].sort((a, b) => a.preco - b.preco).slice(0, 5)
    .forEach(x => console.log(`  ${x.partida}-${x.chegada} ${x.cia.padEnd(10)} ${x.rota} ${x.escalas} ${x.duracao} R$${x.preco}`));
}
