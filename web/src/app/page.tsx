import { PainelSaude } from "@/features/saude/components/painel-saude";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">FraudRadar</h1>
        <p className="text-muted-foreground">Monitoramento de PLD sobre o SAML-D</p>
      </div>
      <PainelSaude />
    </main>
  );
}
