import path from "node:path";
import { redact } from "./importers";

export function prepareEvidence(filePath: string, bytes: Buffer) {
  const fileName = path.basename(filePath).toLowerCase();
  if (
    /(^|\.)env(?:\.|$)/i.test(fileName) ||
    /^(?:credentials(?:\..*)?|secrets?(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?|\.?(?:npmrc|pypirc|netrc|pgpass|git-credentials)|kubeconfig|authorized_keys)$/i.test(
      fileName,
    ) ||
    /\.(?:pem|key|p12|pfx|jks|keystore|kdbx)$/i.test(fileName)
  )
    throw new Error("Arquivos de credenciais não podem ser anexados.");

  // Todo texto UTF-8 passa por redação, mesmo sem extensão ou com extensão de imagem.
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!/[\x00-\x08\x0e-\x1f]/.test(text)) {
      return { bytes: Buffer.from(redact(text)), mime: "text/plain; charset=utf-8" };
    }
  } catch {
    // Apenas imagens reconhecidas podem seguir sem redação textual.
  }
  const ext = path.extname(fileName);
  const png =
    ext === ".png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpg =
    [".jpg", ".jpeg"].includes(ext) && bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  const webp =
    ext === ".webp" &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP";
  if (png || jpg || webp) {
    return { bytes, mime: png ? "image/png" : jpg ? "image/jpeg" : "image/webp" };
  }
  throw new Error("Anexo não suportado: use texto UTF-8 ou imagem PNG, JPEG ou WebP revisada.");
}
