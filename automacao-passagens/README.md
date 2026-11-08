# Automação de passagens SP → Florianópolis, só ida (21–24/12/2026)

Busca no Google Voos os voos diretos GRU/CGH → FLN de 21 a 24/12, 1 adulto, e lista os mais baratos por dia e por horário.

- `./rodar.sh` — faz uma coleta e gera `RELATORIO.md`
- `buscar.js` — coleta (Playwright/Chromium); salva `dados/<data-hora>.json` e `dados/historico.json`
- `relatorio.js` — menor preço por dia, voos mais baratos e variação desde a coleta anterior
- `ver.js` — lista os 5 voos mais baratos de cada trecho

Para mudar datas ou aeroportos, edite `ORIGENS`, `IDAS` e `VOLTAS` no topo de `buscar.js`.
Decolar e LATAM.com bloqueiam navegador automatizado, e o Kayak não carrega os preços; o Google Voos traz as tarifas das companhias (LATAM, GOL, Azul).
