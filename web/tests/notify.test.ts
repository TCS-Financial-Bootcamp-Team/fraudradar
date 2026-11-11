import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearToasts,
  notify,
  subscribeToasts,
  type ToastItem,
} from "../src/lib/notify";

test("notify: push adiciona notificação com campos corretos e incrementa IDs sequencialmente", () => {
  clearToasts();

  const id1 = notify.success("Operação concluída", "Registro atualizado com sucesso");
  const id2 = notify.info("Aviso do sistema", "Nova semana disponível");
  const id3 = notify.error("Falha na sincronização", "Servidor indisponível");

  assert.ok(id1 > 0, "id1 deve ser positivo");
  assert.ok(id2 > id1, "id2 deve ser maior que id1");
  assert.ok(id3 > id2, "id3 deve ser maior que id2");

  let currentToasts: ToastItem[] = [];
  const unsubscribe = subscribeToasts((items) => {
    currentToasts = items;
  });

  try {
    assert.equal(currentToasts.length, 3);
    assert.equal(currentToasts[0].id, id1);
    assert.equal(currentToasts[0].kind, "success");
    assert.equal(currentToasts[0].title, "Operação concluída");
    assert.equal(currentToasts[0].body, "Registro atualizado com sucesso");
    assert.ok(currentToasts[0].createdAt > 0);

    assert.equal(currentToasts[1].id, id2);
    assert.equal(currentToasts[1].kind, "info");
    assert.equal(currentToasts[1].title, "Aviso do sistema");

    assert.equal(currentToasts[2].id, id3);
    assert.equal(currentToasts[2].kind, "error");
    assert.equal(currentToasts[2].title, "Falha na sincronização");
  } finally {
    unsubscribe();
  }
});

test("notify: máximo de 4 notificações empilhadas (descarta as mais antigas)", () => {
  clearToasts();

  const ids: number[] = [];
  for (let i = 1; i <= 6; i++) {
    ids.push(notify.info(`Notificação ${i}`));
  }

  let currentToasts: ToastItem[] = [];
  const unsubscribe = subscribeToasts((items) => {
    currentToasts = items;
  });

  try {
    assert.equal(
      currentToasts.length,
      4,
      "Apenas as 4 notificações mais recentes devem permanecer empilhadas"
    );
    assert.equal(currentToasts[0].id, ids[2]); // Notificação 3
    assert.equal(currentToasts[1].id, ids[3]); // Notificação 4
    assert.equal(currentToasts[2].id, ids[4]); // Notificação 5
    assert.equal(currentToasts[3].id, ids[5]); // Notificação 6
  } finally {
    unsubscribe();
  }
});

test("notify: dismiss remove a notificação indicada pelo id", () => {
  clearToasts();

  const id1 = notify.info("Primeira");
  const id2 = notify.success("Segunda");
  const id3 = notify.error("Terceira");

  let currentToasts: ToastItem[] = [];
  const unsubscribe = subscribeToasts((items) => {
    currentToasts = items;
  });

  try {
    assert.equal(currentToasts.length, 3);

    notify.dismiss(id2);
    assert.equal(currentToasts.length, 2);
    assert.deepEqual(
      currentToasts.map((t) => t.id),
      [id1, id3],
      "A notificação intermediária id2 deve ter sido removida"
    );

    // Chamar dismiss com id inexistente não deve quebrar nem alterar a lista
    notify.dismiss(99999);
    assert.equal(currentToasts.length, 2);

    notify.dismiss(id1);
    notify.dismiss(id3);
    assert.equal(currentToasts.length, 0);
  } finally {
    unsubscribe();
  }
});

test("notify: subscribeToasts permite desinscrição de ouvintes", () => {
  clearToasts();

  let listenerCallCount = 0;
  const unsubscribe = subscribeToasts(() => {
    listenerCallCount++;
  });

  // Na inscrição imediata, o ouvinte já é chamado uma vez com a lista atual
  assert.equal(listenerCallCount, 1);

  notify.info("Teste");
  assert.equal(listenerCallCount, 2);

  unsubscribe();

  notify.info("Outro teste");
  assert.equal(listenerCallCount, 2, "Ouvinte desinscrito não deve receber nova emissão");
});
