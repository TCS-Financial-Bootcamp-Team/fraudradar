// Apelidos fictícios determinísticos para facilitar a leitura de números de conta.
// Uso exclusivo de exibição na interface; nunca enviado à API, ao LLM ou a relatórios.

const ANIMALS = [
  "Falcão",
  "Lontra",
  "Águia",
  "Albatroz",
  "Antílope",
  "Arara",
  "Baleia",
  "Bisão",
  "Camaleão",
  "Canguru",
  "Capivara",
  "Carcará",
  "Castor",
  "Cisne",
  "Condor",
  "Coruja",
  "Flamingo",
  "Gaivota",
  "Garça",
  "Gavião",
  "Gazela",
  "Golfinho",
  "Guepardo",
  "Harpia",
  "Iguana",
  "Jabuti",
  "Jaguar",
  "Lêmure",
  "Lince",
  "Morsa",
  "Narval",
  "Ocelote",
  "Orca",
  "Panda",
  "Pelicano",
  "Pinguim",
  "Puma",
  "Quati",
  "Sabiá",
  "Tucano",
] as const;

const MODIFIERS = [
  "Âmbar",
  "Índigo",
  "Cobalto",
  "Jade",
  "Ônix",
  "Coral",
  "Grafite",
  "Safira",
  "Cobre",
  "Bronze",
  "Marfim",
  "Ocre",
  "Musgo",
  "Turquesa",
  "Carmim",
  "Sépia",
  "Bordô",
  "Cáqui",
  "Magenta",
  "Ciano",
  "Malva",
  "Ébano",
  "Quartzo",
  "Titânio",
  "Níquel",
  "Cromo",
  "Basalto",
  "Ardósia",
  "Granito",
  "Mármore",
  "Obsidiana",
  "Topázio",
] as const;

const BASE36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function fnv1a32(input: string, seed = 0x811c9dc5): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// Mistura final de 32 bits para evitar padrões em números de conta sequenciais.
function mix32(hash: number): number {
  let h = hash >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Gera um apelido fictício determinístico para exibição ao lado do número da conta.
 * Não substitui o identificador real nem deve sair da camada de apresentação.
 */
export function accountAlias(account: string | number): string {
  const normalized = String(account).trim();
  const primary = mix32(fnv1a32(normalized));
  const secondary = mix32(fnv1a32(normalized, 0x9e3779b9));

  const animal = ANIMALS[primary % ANIMALS.length];
  const modifier = MODIFIERS[(primary >>> 16) % MODIFIERS.length];
  const suffixIndex = secondary % (BASE36.length * BASE36.length);
  const c1 = BASE36[Math.floor(suffixIndex / BASE36.length)];
  const c2 = BASE36[suffixIndex % BASE36.length];

  return `${animal} ${modifier} ${c1}${c2}`;
}
