'use client';

import { useMemo } from 'react';
import { Target, TrendingUp, Users, Wallet } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import type { DashboardSummary, Opportunity } from '@/lib/types';
import { Panel, StatusPill } from '@/components/ui';

const CHART_COLORS = ['#1087FF', '#38D5FF', '#0A1222', '#E11D35', '#10B981', '#F59E0B', '#8B5CF6'];

const localKey = (value: string | Date) => {
  const d = typeof value === 'string' ? new Date(value) : value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function ActivityChart({ points }: { points: Array<{ label: string; count: number }> }) {
  const W = 640;
  const H = 250;
  const PAD = 34;
  const max = Math.max(1, ...points.map((p) => p.count));
  const step = points.length > 1 ? (W - PAD * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = PAD + i * step;
    const y = H - PAD - (p.count / max) * (H - PAD * 2);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = coords.length
    ? `${line} L${coords[coords.length - 1][0].toFixed(1)},${H - PAD} L${PAD},${H - PAD} Z`
    : '';
  const hasData = points.some((p) => p.count > 0);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Actividad de los ultimos 14 dias">
        <defs>
          <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1087FF" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#38D5FF" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="activityStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#38D5FF" />
            <stop offset="100%" stopColor="#1087FF" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = PAD + ratio * (H - PAD * 2);
          return <line key={ratio} x1={PAD} x2={W - PAD} y1={y} y2={y} stroke="#D7E3F5" strokeWidth="1" strokeDasharray="4 6" />;
        })}
        {area && <path d={area} fill="url(#activityFill)" />}
        {line && <path d={line} fill="none" stroke="url(#activityStroke)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
        {coords.map(([x, y], i) =>
          points[i].count > 0 ? <circle key={i} cx={x} cy={y} r="4.5" fill="#fff" stroke="#1087FF" strokeWidth="3" /> : null,
        )}
        {points.map((p, i) =>
          i % 3 === 0 || i === points.length - 1 ? (
            <text key={p.label + i} x={coords[i][0]} y={H - 10} textAnchor="middle" className="fill-slate-400" fontSize="11" fontWeight="700">
              {p.label}
            </text>
          ) : null,
        )}
        <text x={PAD - 8} y={PAD + 4} textAnchor="end" className="fill-slate-400" fontSize="11" fontWeight="700">
          {max}
        </text>
        <text x={PAD - 8} y={H - PAD + 4} textAnchor="end" className="fill-slate-400" fontSize="11" fontWeight="700">
          0
        </text>
      </svg>
      {!hasData && (
        <p className="absolute inset-0 flex items-center justify-center text-sm font-black text-slate-400">Sin actividad registrada en los ultimos 14 dias.</p>
      )}
    </div>
  );
}

function DonutChart({ segments }: { segments: Array<{ label: string; value: number }> }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const R = 66;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const arcs = segments.map((segment, i) => {
    const length = total ? (segment.value / total) * C : 0;
    const arc = (
      <circle
        key={segment.label}
        cx="90"
        cy="90"
        r={R}
        fill="none"
        stroke={CHART_COLORS[i % CHART_COLORS.length]}
        strokeWidth="22"
        strokeDasharray={`${length} ${C - length}`}
        strokeDashoffset={-acc}
        transform="rotate(-90 90 90)"
      />
    );
    acc += length;
    return arc;
  });

  if (!total) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl bg-slate-50 text-sm font-black text-slate-400">
        Sin datos de servicios todavia.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 180 180" className="h-48 w-48 shrink-0" role="img" aria-label="Distribucion por servicio">
        <circle cx="90" cy="90" r={R} fill="none" stroke="#EEF3FA" strokeWidth="22" />
        {arcs}
        <text x="90" y="86" textAnchor="middle" className="fill-sabero-navy" fontSize="30" fontWeight="900">
          {total}
        </text>
        <text x="90" y="108" textAnchor="middle" className="fill-slate-400" fontSize="11" fontWeight="800" letterSpacing="1.5">
          DEALS
        </text>
      </svg>
      <ul className="grid flex-1 gap-2.5">
        {segments.map((segment, i) => (
          <li key={segment.label} className="flex items-center gap-3 text-sm">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="flex-1 truncate font-bold text-slate-600">{segment.label}</span>
            <span className="font-black text-sabero-navy">{segment.value}</span>
            <span className="w-12 text-right text-xs font-black text-slate-400">{Math.round((segment.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Analytics({ summary, opportunities }: { summary: DashboardSummary | null; opportunities: Opportunity[] }) {
  const sales = summary?.sales;
  const openOpportunities = opportunities.filter((o) => !['won', 'lost', 'closed'].includes(o.stage)).length;

  const kpis = [
    ['Valor en pipeline', formatMoney(sales?.pipeline_value || 0), Wallet],
    ['Valor ganado', formatMoney(sales?.won_value || 0), TrendingUp],
    ['Leads totales', summary?.metrics.leads ?? 0, Users],
    ['Oportunidades abiertas', openOpportunities, Target],
  ] as const;

  const funnel = [
    ['Creadas', sales?.created || 0],
    ['Calificadas', sales?.qualified || 0],
    ['Reuniones', sales?.meetings || 0],
    ['Propuestas', sales?.proposals || 0],
    ['Ganadas', sales?.won || 0],
  ] as const;
  const funnelMax = Math.max(1, ...funnel.map(([, value]) => value));

  const activity = useMemo(() => {
    const today = new Date();
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (13 - i));
      return {
        key: localKey(d),
        label: d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }).replace('.', ''),
        count: 0,
      };
    });
    const index = new Map(days.map((day, i) => [day.key, i]));
    for (const event of summary?.recent_events || []) {
      const position = index.get(localKey(event.created_at));
      if (position !== undefined) days[position].count += 1;
    }
    return days;
  }, [summary]);

  const serviceSegments = useMemo(() => {
    const rows = (sales?.by_service || []).map((row) => ({ label: row.label || 'Sin servicio', value: row.count }));
    if (rows.length <= 6) return rows.sort((a, b) => b.value - a.value);
    const sorted = [...rows].sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5).reduce((sum, row) => sum + row.value, 0);
    return [...top, { label: 'Otros servicios', value: rest }];
  }, [sales]);

  const assignees = useMemo(
    () => [...(sales?.by_assignee || [])].sort((a, b) => b.count - a.count).slice(0, 6),
    [sales],
  );
  const assigneeMax = Math.max(1, ...assignees.map((row) => row.count));

  const stageCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const opportunity of opportunities) map.set(opportunity.stage, (map.get(opportunity.stage) || 0) + 1);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [opportunities]);
  const stageMax = Math.max(1, ...stageCounts.map(([, count]) => count));

  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        {kpis.map(([label, value, Icon]) => (
          <Panel key={label} className="relative overflow-hidden">
            <div className="absolute right-0 top-0 h-24 w-24 rounded-bl-[44px] bg-sabero-electric/10" />
            <Icon className="h-6 w-6 text-sabero-electric" />
            <p className="mt-5 text-sm font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <strong className="mt-2 block text-3xl font-black text-sabero-navy">{value}</strong>
          </Panel>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Panel>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-crimson">Embudo comercial</p>
              <h2 className="mt-2 text-2xl font-black text-sabero-navy">Mes actual</h2>
            </div>
            <StatusPill active={(sales?.won || 0) > 0} label={`${sales?.conversion.won || 0}% cierre`} />
          </div>
          <div className="mt-6 grid gap-4">
            {funnel.map(([label, value], index) => {
              const previous = index ? funnel[index - 1][1] : value;
              const stepRate = previous ? Math.round((value / previous) * 100) : 100;
              return (
                <div key={label}>
                  <div className="flex items-end justify-between gap-3 text-sm">
                    <span className="font-black uppercase tracking-[0.1em] text-slate-500">{label}</span>
                    <span className="font-black text-sabero-navy">
                      {value}
                      {index > 0 && <span className="ml-2 text-xs font-bold text-slate-400">{stepRate}% del anterior</span>}
                    </span>
                  </div>
                  <div className="mt-2 h-7 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sabero-electric to-sabero-cyan transition-all duration-700"
                      style={{ width: `${Math.max(4, (value / funnelMax) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-cyan">Mix de servicios</p>
          <h2 className="mt-2 text-2xl font-black text-sabero-navy">Interes por solucion</h2>
          <div className="mt-6">
            <DonutChart segments={serviceSegments} />
          </div>
        </Panel>
      </div>

      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-crimson">Tendencia</p>
            <h2 className="mt-2 text-2xl font-black text-sabero-navy">Eventos de los ultimos 14 dias</h2>
          </div>
          <span className="text-sm font-black text-slate-400">{activity.reduce((sum, day) => sum + day.count, 0)} eventos</span>
        </div>
        <div className="mt-4">
          <ActivityChart points={activity} />
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-crimson">Carga comercial</p>
          <h2 className="mt-2 text-2xl font-black text-sabero-navy">Por responsable</h2>
          <div className="mt-5 grid gap-4">
            {assignees.length ? (
              assignees.map((row) => (
                <div key={row.label || row.value}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-bold text-slate-600">{row.label || 'Sin asignar'}</span>
                    <span className="font-black text-sabero-navy">
                      {row.count} <span className="text-xs font-bold text-slate-400">· {row.value}</span>
                    </span>
                  </div>
                  <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-sabero-electric" style={{ width: `${Math.max(6, (row.count / assigneeMax) * 100)}%` }} />
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-400">Aun no hay oportunidades asignadas.</p>
            )}
          </div>
        </Panel>

        <Panel>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-cyan">Pipeline vivo</p>
          <h2 className="mt-2 text-2xl font-black text-sabero-navy">Oportunidades por etapa</h2>
          <div className="mt-5 grid gap-3">
            {stageCounts.length ? (
              stageCounts.map(([stage, count], index) => (
                <div key={stage} className="flex items-center gap-4">
                  <span className="w-32 shrink-0 truncate text-sm font-black uppercase tracking-[0.08em] text-slate-500">{stage}</span>
                  <div className="h-9 flex-1 overflow-hidden rounded-xl bg-slate-100">
                    <div
                      className="flex h-full items-center rounded-xl px-3 text-xs font-black text-white"
                      style={{ width: `${Math.max(14, (count / stageMax) * 100)}%`, backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                    >
                      {count}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-400">Sin oportunidades registradas.</p>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}
