#!/usr/bin/env bash
# Monitoramento contínuo: coleta a cada INTERVALO segundos por até DURACAO segundos.
# Sai antes se o melhor preço CAIR (código 10), para quem chamou poder avisar.
# Uso: ./monitorar.sh [INTERVALO=1200] [DURACAO=6900]
set -uo pipefail
cd "$(dirname "$0")/.."
INTERVALO=${1:-1200}
DURACAO=${2:-6900}
PIDFILE=automacao-passagens/.monitor.pid
echo $$ > "$PIDFILE"
trap 'rm -f "$PIDFILE"' EXIT
FIM=$(( $(date +%s) + DURACAO ))
BRANCH=claude/awesome-hypatia-wbrv9t

while :; do
  AGORA=$(TZ=America/Sao_Paulo date '+%d/%m %H:%M')
  SAIDA=$(./automacao-passagens/rodar.sh 2>&1)
  RESUMO=$(echo "$SAIDA" | grep '^RESUMO' | tail -1)
  VAZIOS=$(echo "$SAIDA" | grep -c ': 0 voos' || true)
  echo "[$AGORA] ${RESUMO:-SEM RESUMO} (trechos sem dados: $VAZIOS)"
  git add automacao-passagens/dados automacao-passagens/RELATORIO.md >/dev/null 2>&1
  git commit -q -m "Passagens: coleta $AGORA

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PeVuj4Zz3j2VwH1Za3judY" >/dev/null 2>&1 \
    && { git push -q origin "$BRANCH" >/dev/null 2>&1 || { sleep 5; git push -q origin "$BRANCH" >/dev/null 2>&1; }; }
  if [[ "$RESUMO" == RESUMO\ CAIU* ]]; then echo "ALERTA: preço caiu"; exit 10; fi
  if [[ "$VAZIOS" -ge 4 ]]; then echo "ALERTA: coleta falhou em $VAZIOS trechos"; exit 11; fi
  [[ $(( $(date +%s) + INTERVALO )) -ge $FIM ]] && { echo "Fim do ciclo de monitoramento"; exit 0; }
  sleep "$INTERVALO"
done
