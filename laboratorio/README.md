# laboratorio/

Pasta de rascunho da equipe: explorar o SAML-D, fazer gráficos e testar
modelos antes de levar algo para o projeto. **Tudo aqui fica fora do git**,
menos este README: pode bagunçar, ninguém revisa e nada quebra o CI.

Crie uma subpasta com o seu nome (`laboratorio/pedro/`) para não pisar no
rascunho dos outros.

## Regras

- Nada de produção importa daqui. Gostou de uma feature, regra ou modelo?
  Leve para `src/fraudradar` (ou para um notebook em `notebooks/`) com teste e PR.
- Aqui você pode olhar `Is_laundering` e `Laundering_type` à vontade (é para
  isso que serve a análise). Só não use essas colunas, nem nada calculado a
  partir delas, como entrada de um modelo: é vazamento, e o modelo de verdade
  nunca as recebe.
- Teste modelos com corte no tempo (treina nas semanas antigas, avalia nas
  seguintes), como o modelo do projeto. Divisão aleatória dá uma métrica
  otimista demais.
- O arquivo tem 1 GB. Comece por uma amostra e salve em parquet aqui mesmo.

## Começando

```bash
uv sync --all-groups          # pandas, sklearn, lightgbm, matplotlib, seaborn, jupyter
uv run jupyter lab            # ou abra um .ipynb no VS Code com o kernel do .venv
```

```python
import pandas as pd

from fraudradar.config import RAIZ
from fraudradar.dados.schema import DTYPES_CSV, MOEDA_DOS_VALORES

csv = RAIZ / "dados" / "SAML-D.csv"

# Olhada rápida: as primeiras 200 mil linhas (só as primeiras semanas).
df = pd.read_csv(csv, dtype=DTYPES_CSV, nrows=200_000)

# Amostra espalhada pelo ano (~5%): lê o arquivo todo, mas guarda pouco na memória.
# Rode uma vez e reaproveite o parquet.
# import random
# random.seed(42)
# df = pd.read_csv(csv, dtype=DTYPES_CSV, skiprows=lambda i: i > 0 and random.random() > 0.05)
# df.to_parquet(RAIZ / "laboratorio" / "amostra_5pct.parquet")

df["data_hora"] = pd.to_datetime(df["Date"] + " " + df["Time"])
print(df["Is_laundering"].mean(), df["Laundering_type"].value_counts().head())
```

`Amount` está em libras (`MOEDA_DOS_VALORES`), seja qual for
`Payment_currency`. Não converta pela moeda.
