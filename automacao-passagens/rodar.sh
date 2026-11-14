#!/usr/bin/env bash
# Roda uma coleta completa e gera o RELATORIO.md
set -euo pipefail
cd "$(dirname "$0")"
node buscar.js
node relatorio.js
