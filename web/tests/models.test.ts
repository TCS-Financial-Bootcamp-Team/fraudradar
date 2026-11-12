import assert from "node:assert/strict";
import { test } from "node:test";
import {
  feedbackText,
  gateText,
  metricDelta,
  promoteBlockReason,
  trainChoiceState,
} from "../src/features/models/components/model-section";
import { jobIsOpen } from "../src/features/jobs/schemas/jobs";
import { modelsSchema, trainRequestSchema } from "../src/features/models/schemas/models";
import { modelsMock, promoteModelMock } from "../src/features/models/services/mocks";
import {
  fetchModels,
  promoteModel,
  startTraining,
} from "../src/features/models/services/models-service";
import { selectDataset } from "../src/lib/dataset";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("o mock cumpre o contrato e tem uma versão ativa", () => {
  const parsed = modelsSchema.parse(modelsMock);
  assert.equal(parsed.versions.filter((v) => v.active).length, 1);
  assert.equal(parsed.active_version, "lightgbm_v1");
});

test("serviços chamam as rotas do conjunto no caminho", async () => {
  const previousFetch = globalThis.fetch;
  const calls: string[] = [];
  const job = {
    id: "7",
    kind: "train",
    dataset: "saml-d",
    status: "queued",
    progress: 0,
    message: null,
    created_at: "2026-11-11T10:00:00Z",
    started_at: null,
    finished_at: null,
  };
  const bodies: unknown[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push(`${init?.method ?? "GET"} ${String(input)}`);
    if (init?.body) bodies.push(JSON.parse(String(init.body)));
    return String(input).endsWith("/train") ? json(job, 202) : json(modelsMock);
  };
  selectDataset("saml-d");
  try {
    await fetchModels("saml-d");
    const started = await startTraining("saml-d");
    await startTraining("saml-d", { use_feedback: true, include_simulated: true });
    await promoteModel("saml-d", "saml-d/v2");
    assert.equal(jobIsOpen(started), true);
  } finally {
    globalThis.fetch = previousFetch;
  }
  assert.deepEqual(
    calls.map((call) => call.replace(/^(\w+) https?:\/\/[^/]+/, "$1 ")),
    [
      "GET /datasets/saml-d/models",
      "POST /datasets/saml-d/train",
      "POST /datasets/saml-d/train",
      "POST /datasets/saml-d/models/saml-d%2Fv2/promote",
    ],
  );
  assert.deepEqual(bodies.slice(0, 2), [
    { use_feedback: false, include_simulated: false },
    { use_feedback: true, include_simulated: true },
  ]);
  // retorno simulado sem o dos analistas nem sai do navegador
  await assert.rejects(() =>
    startTraining("saml-d", { use_feedback: false, include_simulated: true }),
  );
  assert.equal(
    trainRequestSchema.safeParse({ use_feedback: false, include_simulated: true }).success,
    false,
  );
});

test("versão de retreino se chama <conjunto>/vN e não colide com a oficial", () => {
  const retrain = modelsMock.versions.find((v) => v.version === "saml-d/v2")!;
  const official = modelsMock.versions.find((v) => v.source === "official")!;
  assert.equal(official.version, "lightgbm_v1");
  const withBadName = {
    ...modelsMock,
    versions: [{ ...retrain, version: "../x" }],
  };
  assert.equal(modelsSchema.safeParse(withBadName).success, false);
});

test("diferença para a versão ativa", () => {
  assert.equal(metricDelta(0.3, 0.25, true), "+5 p.p.");
  assert.equal(metricDelta(0.2, 0.25, true), "−5 p.p.");
  assert.equal(metricDelta(0.25, 0.25, true), "igual");
  assert.equal(metricDelta(12, 10, false), "+2");
  assert.equal(metricDelta(null, 0.25, true), "");
});

test("trava de promoção: o texto e o botão desligado com o motivo", () => {
  const passed = modelsMock.versions.find((v) => v.version === "saml-d/v3")!;
  const blocked = modelsMock.versions.find((v) => v.version === "saml-d/v2")!;
  const official = modelsMock.versions.find((v) => v.version === "lightgbm_v1")!;
  assert.equal(gateText(passed.comparison!), "Pode ser promovida");
  assert.equal(
    gateText(blocked.comparison!),
    "Bloqueada: acha 3 p.p. menos lavadoras na fila que a versão ativa",
  );
  assert.equal(promoteBlockReason(passed), null);
  assert.match(promoteBlockReason(blocked) ?? "", /^Bloqueada: acha 3,0 p.p./);
  assert.equal(promoteBlockReason(official), null); // ficha sem comparação promove como antes
  assert.throws(() => promoteModelMock("saml-d/v2"), /Bloqueada/);
});

test("o retorno usado por cada versão, em uma linha", () => {
  const passed = modelsMock.versions.find((v) => v.version === "saml-d/v3")!;
  const text = feedbackText(passed.feedback);
  assert.match(text ?? "", /^Retorno: 902 rótulos no treino \(781 lavagem confirmada, 121 falso positivo\)/);
  assert.match(text ?? "", /874 na validação, sem peso/);
  assert.match(text ?? "", /425 transações em conflito com o gabarito/);
  const plain = modelsMock.versions.find((v) => v.version === "saml-d/v2")!;
  assert.equal(feedbackText(plain.feedback), null);
  assert.equal(passed.feedback?.include_simulated, true); // mostra o selo "retorno simulado"
});

test("a escolha do treino segue o retorno disponível", () => {
  const feedback = modelsMock.training_feedback;
  const none = trainChoiceState(feedback, { use_feedback: false, include_simulated: false });
  assert.match(none.analystLabel, /21 rótulos: 12 lavagem confirmada, 9 falso positivo confirmado/);
  assert.equal(none.showSimulated, true);
  assert.equal(none.feedbackPossible, true); // só com o simulado
  assert.equal(none.blockedReason, null);
  const analystOnly = trainChoiceState(feedback, { use_feedback: true, include_simulated: false });
  assert.match(analystOnly.blockedReason ?? "", /há 21/);
  const withSimulated = trainChoiceState(feedback, {
    use_feedback: true,
    include_simulated: true,
  });
  assert.equal(withSimulated.blockedReason, null);

  const noSimulated = trainChoiceState(
    {
      ...feedback,
      simulated: { laundering: 0, false_positive: 0 },
      blocked_reason_with_simulated: feedback.blocked_reason,
    },
    { use_feedback: false, include_simulated: false },
  );
  assert.equal(noSimulated.showSimulated, false); // a opção só aparece com rótulos simulados
  assert.equal(noSimulated.feedbackPossible, false);
});
