import assert from "node:assert/strict";
import { test } from "node:test";

test("mock: decisão, parecer, comunicação e replay preservam consistência na sessão", async () => {
  process.env.NEXT_PUBLIC_USE_MOCKS = "true";
  const s = await import("../src/features/alertas/services/alertas-service");
  const semana = "2026-10-19";
  const fila = await s.buscarAlertas({ semana, status: "pendente" });
  const id = fila.itens[0].id;
  const antes = await s.buscarMonitoramento(semana);
  await s.gerarParecer(id);
  assert.ok((await s.buscarDetalhe(id)).parecer?.fontes.length);
  await s.registrarDecisao(id, {
    decisao: "comunicar",
    justificativa:
      "Movimentações atípicas confirmadas para diligência e revisão.",
  });
  assert.equal((await s.buscarDetalhe(id)).status, "comunicar");
  assert.ok(
    (await s.listarComunicacoes(semana)).some((c) => c.alerta_id === id),
  );
  const texto =
    "Relato revisado e complementado com as evidências do caso. Comunicação acadêmica sem transmissão externa.";
  await s.aprovarComunicacao(id, texto);
  assert.equal((await s.buscarComunicacao(id)).texto, texto);
  assert.equal(
    (await s.buscarMonitoramento(semana)).indicadores.comunicados,
    antes.indicadores.comunicados + 1,
  );
  const grafo = await s.buscarGrafo(id);
  assert.ok(grafo.nos.every((n) => n.rotulo.startsWith("CTA-")));
  assert.ok(
    grafo.arestas.every(
      (a) =>
        grafo.nos.some((n) => n.id === a.origem) &&
        grafo.nos.some((n) => n.id === a.destino),
    ),
  );
  const proxima = await s.proximaSemana(semana);
  assert.equal(proxima.semana, "2026-10-26");
  assert.equal(
    (await s.buscarAlertas({ semana: proxima.semana })).total,
    proxima.alertas_gerados,
  );
});

test("mock: registro e sincronização nunca devolvem senha nem URI", async () => {
  process.env.NEXT_PUBLIC_USE_MOCKS = "true";
  const s = await import("../src/features/ingestao/services/ingestao-service");
  const fonte = await s.registrarFonte({
    nome: "Teste de contrato",
    tipo: "postgres",
    connection_string:
      "postgresql://leitura:segredo@financeiro.example.test:5432/operacoes",
    ssl: true,
  });
  const lista = await s.listarFontes();
  assert.ok(lista.itens.some((f) => f.id === fonte.id));
  assert.doesNotMatch(JSON.stringify(lista), /segredo|postgresql:\/\//);
  assert.ok((await s.sincronizarFonte(fonte.id)).ultima_sincronizacao);
});
