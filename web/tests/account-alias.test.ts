import assert from "node:assert/strict";
import { test } from "node:test";
import { accountAlias } from "../src/lib/account-alias";

const ALIAS_FORMAT = /^\p{Lu}[\p{L}]+ [\p{Lu}][\p{L}]+ [0-9A-Z]{2}$/u;

const COMMON_BRAZILIAN_FIRST_NAMES = new Set([
  "Maria",
  "José",
  "Ana",
  "João",
  "Pedro",
  "Paulo",
  "Lucas",
  "Marcos",
  "Gabriel",
  "Rafael",
  "Mariana",
  "Juliana",
  "Fernanda",
  "Camila",
  "Bruno",
  "Carlos",
  "Antônio",
  "Francisco",
  "Luiz",
  "Rosa",
  "Beatriz",
  "Larissa",
  "Rodrigo",
  "Amanda",
]);

test("accountAlias é determinístico para a mesma conta (string ou number)", () => {
  assert.equal(accountAlias("800012345"), accountAlias("800012345"));
  assert.equal(accountAlias("800012345"), accountAlias(800012345));
  assert.equal(accountAlias(100042), accountAlias("100042"));
  assert.equal(accountAlias("CTA-810"), accountAlias("CTA-810"));
});

test("accountAlias segue o formato esperado e não usa nomes próprios comuns", () => {
  const samples = [
    "800000001",
    800000002,
    "CTA-810",
    "CTA-950",
    "0",
    9999999999,
  ];
  for (const sample of samples) {
    const alias = accountAlias(sample);
    assert.match(alias, ALIAS_FORMAT);
    const [animal, modifier] = alias.split(" ");
    assert.equal(
      COMMON_BRAZILIAN_FIRST_NAMES.has(animal),
      false,
      `animal não pode ser prenome comum: ${animal}`,
    );
    assert.equal(
      COMMON_BRAZILIAN_FIRST_NAMES.has(modifier),
      false,
      `modificador não pode ser prenome comum: ${modifier}`,
    );
  }
});

test("accountAlias produz pelo menos 990 apelidos distintos em 1000 contas sequenciais", () => {
  const aliases = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const alias = accountAlias(800000000 + i);
    assert.match(alias, ALIAS_FORMAT);
    const [animal, modifier] = alias.split(" ");
    assert.equal(COMMON_BRAZILIAN_FIRST_NAMES.has(animal), false);
    assert.equal(COMMON_BRAZILIAN_FIRST_NAMES.has(modifier), false);
    aliases.add(alias);
  }
  assert.ok(
    aliases.size >= 990,
    `esperado >= 990 apelidos distintos, obtido ${aliases.size}`,
  );
});
