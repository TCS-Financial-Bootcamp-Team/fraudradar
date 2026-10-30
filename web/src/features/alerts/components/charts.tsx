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
import { formatPercent } from "@/lib/format";
import type { Series } from "../schemas/alerts";

const chartColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];
const tooltipStyle = {
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: "12px",
};
export function ChartCard({
  title,
  data,
  type = "bars",
  isRate = false,
}: {
  title: string;
  data: Series[];
  type?: "area" | "bars" | "donut";
  isRate?: boolean;
}) {
  return (
    <section className="panel">
      <h2 className="panel-title">{title}</h2>
      <div
        className="h-[270px] min-w-0 px-3 py-5"
        role="img"
        aria-label={
          title +
          ": " +
          data
            .map((d) => d.name + " " + (isRate ? formatPercent(d.value) : d.value))
            .join(", ")
        }
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          {type === "area" ? (
            <AreaChart data={data} margin={{ left: -25, right: 15, top: 10 }}>
              <defs>
                <linearGradient id="alerts-area" x1="0" y1="0" x2="0" y2="1">
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
                dataKey="name"
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                dataKey="value"
                name="Alertas"
                type="monotone"
                stroke="var(--chart-1)"
                fill="url(#alerts-area)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          ) : type === "donut" ? (
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={58}
                outerRadius={88}
                paddingAngle={3}
                stroke="var(--card)"
                isAnimationActive={false}
              >
                {data.map((d, i) => (
                  <Cell key={d.name} fill={chartColors[i % chartColors.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          ) : (
            <BarChart
              data={data}
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
                tickFormatter={isRate ? formatPercent : undefined}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={100}
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={isRate ? (v) => formatPercent(Number(v)) : undefined}
                cursor={{ fill: "var(--muted)" }}
              />
              <Bar
                dataKey="value"
                name={isRate ? "Taxa" : "Alertas"}
                fill="var(--chart-1)"
                barSize={14}
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {type === "donut" && (
        <ul className="grid grid-cols-2 gap-3 px-6 pb-5 text-[11px] text-muted-foreground">
          {data.map((d, i) => (
            <li key={d.name} className="flex items-center gap-2">
              <span
                className="size-2 rounded-full"
                style={{ background: chartColors[i % chartColors.length] }}
              />
              {d.name}
              <strong className="ml-auto text-foreground">{d.value}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
