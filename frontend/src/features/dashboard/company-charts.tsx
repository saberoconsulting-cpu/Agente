'use client';

import {useMemo,useState} from 'react';
import {ChartBar,CHART_PALETTE,LineAreaChart} from '@/components/charts';
import {Panel} from '@/components/ui';

export type ChartCompany={id:string;name:string;metrics:null|{tokens:string;ai_requests:number};activity?:{date:string;requests:number;tokens:string}[]};
const number=(value:number)=>value.toLocaleString('es-PE',{notation:value>=10000?'compact':'standard',maximumFractionDigits:1});
const dateLabel=(date:string)=>new Date(date+'T12:00:00Z').toLocaleDateString('es-PE',{day:'numeric',month:'short',timeZone:'UTC'}).replace('.','');

export function CompanyCharts({companies,loading}:{companies:ChartCompany[];loading:boolean}){
  const [metric,setMetric]=useState<'requests'|'tokens'>('requests');
  const points=useMemo(()=>{const days=new Map<string,number>();for(const company of companies)if(company.metrics)for(const day of company.activity||[])days.set(day.date,(days.get(day.date)||0)+Number(day[metric]));return Array.from(days).sort(([a],[b])=>a.localeCompare(b)).map(([date,value])=>({key:date,label:dateLabel(date),value}));},[companies,metric]);
  const ranking=useMemo(()=>companies.filter(company=>company.metrics).sort((a,b)=>Number(b.metrics?.tokens)-Number(a.metrics?.tokens)).slice(0,5),[companies]);
  const top=Math.max(1,...ranking.map(company=>Number(company.metrics?.tokens)));
  return <div className="grid min-w-0 gap-5 xl:grid-cols-[1.55fr_1fr]">
    <Panel className="chart-panel p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="chart-eyebrow">Ritmo de operación</p><h3 className="chart-title">Actividad del agente</h3><p className="chart-description">Evolución conjunta de los últimos siete días.</p></div><div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">{(['requests','tokens'] as const).map(key=><button key={key} type="button" aria-pressed={metric===key} onClick={()=>setMetric(key)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${metric===key?'bg-white text-[#176B87] shadow-sm':'text-slate-500 hover:text-slate-700'}`}>{key==='requests'?'Consultas':'Tokens'}</button>)}</div></div><div className="mt-5"><LineAreaChart points={points} ariaLabel={`Gráfica de ${metric==='requests'?'consultas':'tokens'} de los últimos siete días`} valueLabel={metric==='requests'?'consultas':'tokens'} formatValue={number}/></div></Panel>
    <Panel className="chart-panel p-5 sm:p-6"><p className="chart-eyebrow">Distribución mensual</p><h3 className="chart-title">Consumo por empresa</h3><p className="chart-description">Empresas con mayor volumen de tokens registrados.</p><div className="mt-7 grid gap-5">{ranking.length?ranking.map((company,index)=><div key={company.id}><div className="mb-2 flex items-center justify-between gap-4 text-sm"><span className="truncate text-slate-600" title={company.name}>{company.name}</span><strong className="shrink-0 font-semibold tabular-nums text-slate-700">{number(Number(company.metrics?.tokens))}</strong></div><ChartBar value={Number(company.metrics?.tokens)} max={top} color={CHART_PALETTE[index%CHART_PALETTE.length]} delay={index*70} size="md"/></div>):<div className="grid min-h-52 place-items-center text-sm text-slate-400">{loading?'Cargando consumo…':'Sin datos disponibles'}</div>}</div><p className="mt-7 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-400">Solo se muestra consumo registrado; las empresas sin conexión quedan fuera del cálculo.</p></Panel>
  </div>;
}
