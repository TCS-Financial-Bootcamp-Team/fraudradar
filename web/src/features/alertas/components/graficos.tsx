"use client";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { percentual } from "@/lib/formatacao";
import type { Serie } from "../schemas/alertas";

const cores = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];
const estiloTooltip = {
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: "12px",
};
export function Grafico({
  titulo,
  dados,
  tipo = "barras",
  taxa = false,
}: {
  titulo: string;
  dados: Serie[];
  tipo?: "area" | "barras" | "donut";
  taxa?: boolean;
}) {
  return (
    <section className="panel">
      <h2 className="panel-title">{titulo}</h2>
      <div
        className="h-[270px] min-w-0 px-3 py-5"
        role="img"
        aria-label={
          titulo +
          ": " +
          dados
            .map((d) => d.nome + " " + (taxa ? percentual(d.valor) : d.valor))
            .join(", ")
        }
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          {tipo === "area" ? (
            <AreaChart data={dados} margin={{ left: -25, right: 15, top: 10 }}>
              <defs>
                <linearGradient id="area-alertas" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--chart-1)"
                    stopOpacity={0.25}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--chart-1)"
                    stopOpacity={0.02}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeDasharray="3 4"
              />
              <XAxis
                dataKey="nome"
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip contentStyle={estiloTooltip} />
              <Area
                dataKey="valor"
                name="Alertas"
                type="monotone"
                stroke="var(--chart-1)"
                fill="url(#area-alertas)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          ) : tipo === "donut" ? (
            <PieChart>
              <Pie
                data={dados}
                dataKey="valor"
                nameKey="nome"
                innerRadius={58}
                outerRadius={88}
                paddingAngle={3}
                stroke="var(--card)"
                isAnimationActive={false}
              >
                {dados.map((d, i) => (
                  <Cell key={d.nome} fill={cores[i % cores.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={estiloTooltip} />
            </PieChart>
          ) : (
            <BarChart
              data={dados}
              layout="vertical"
              margin={{ left: 0, right: 30 }}
            >
              <CartesianGrid
                horizontal={false}
                stroke="var(--border)"
                strokeDasharray="3 4"
              />
              <XAxis
                type="number"
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                tickFormatter={taxa ? percentual : undefined}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="nome"
                width={100}
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={estiloTooltip}
                formatter={taxa ? (v) => percentual(Number(v)) : undefined}
                cursor={{ fill: "var(--muted)" }}
              />
              <Bar
                dataKey="valor"
                name={taxa ? "Taxa" : "Alertas"}
                fill="var(--chart-1)"
                barSize={14}
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {tipo === "donut" && (
        <ul className="grid grid-cols-2 gap-3 px-6 pb-5 text-[11px] text-muted-foreground">
          {dados.map((d, i) => (
            <li key={d.nome} className="flex items-center gap-2">
              <span
                className="size-2 rounded-full"
                style={{ background: cores[i % cores.length] }}
              />
              {d.nome}
              <strong className="ml-auto text-foreground">{d.valor}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
