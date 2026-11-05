"""Leitura do SAML-D: colunas, dtypes compactos e limpeza dos nomes de tipologia.

`schema.py` define colunas e dtypes; `ingestion.py` valida o que entra pela API;
`saml_d.py` carrega o CSV inteiro para o treino, com a tipologia limpa. Ainda
falta aqui: a carga em parquet (frente 1).
"""
