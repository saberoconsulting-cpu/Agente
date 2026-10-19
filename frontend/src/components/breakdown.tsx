'use client';

import { formatMoney } from '@/lib/format';

export function Breakdown({ title, rows }: { title: string; rows: Array<{ label: string; count: number; value: string }> }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-black uppercase tracking-[.16em] text-slate-500">{title}</p>
      <div className="mt-3 grid gap-2">
        {rows.length ? (
          rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-3 text-sm">
              <span className="font-bold text-sabero-navy">{row.label}</span>
              <span className="text-slate-500">{row.count} · {formatMoney(Number(row.value))}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">Sin datos todavía.</p>
        )}
      </div>
    </div>
  );
}
