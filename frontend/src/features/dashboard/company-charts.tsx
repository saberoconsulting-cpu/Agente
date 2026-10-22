'use client';

import {useMemo,useState} from 'react';
import {Panel} from '@/components/ui';

export type ChartCompany={id:string;name:string;metrics:null|{tokens:string;ai_requests:number};activity?:{date:string;requests:number;tokens:string}[]};
const number=(value:number)=>value.toLocaleString('es',{notation:value>=10000?'compact':'standard',maximumFractionDigits:1});

export function CompanyCharts({companies,loading}:{companies:ChartCompany[];loading:boolean}){
  const [metric,setMetric]=useState<'requests'|'tokens'>('requests');
  const [hover,setHover]=useState<number|null>(null);
  const points=useMemo(()=>{
    const days=new Map<string,number>();
    for(const company of companies)if(company.metrics)for(const day of company.activity||[])days.set(day.date,(days.get(day.date)||0)+Number(day[metric]));
    return Array.from(days).sort(([a],[b])=>a.localeCompare(b)).map(([date,value])=>({date,value}));
  },[companies,metric]);
  const ranking=companies.filter(company=>company.metrics).sort((a,b)=>Number(b.metrics?.tokens)-Number(a.metrics?.tokens)).slice(0,5);
  const top=Math.max(1,...ranking.map(company=>Number(company.metrics?.tokens)));
  const ceiling=Math.max(1,...points.map(point=>point.value));
  const max=Math.max(4,Math.ceil(ceiling/4)*4);
  const x=(index:number)=>56+index*560/Math.max(1,points.length-1),y=(value:number)=>212-value/max*168;
  const line=points.map((point,index)=>`${index?'L':'M'}${x(index)},${y(point.value)}`).join(' ');
  const selected=hover===null?null:points[hover];
  return <div className="grid min-w-0 gap-5 xl:grid-cols-[1.6fr_1fr]">
    <Panel className="p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="font-semibold text-sabero-navy">Actividad del agente</h3><p className="mt-1 text-xs text-slate-400">Últimos 7 días · UTC</p></div><div className="flex rounded-lg bg-slate-100 p-1">{(['requests','tokens'] as const).map(key=><button key={key} type="button" aria-pressed={metric===key} onClick={()=>{setMetric(key);setHover(null);}} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${metric===key?'bg-white text-sabero-navy shadow-sm':'text-slate-500'}`}>{key==='requests'?'Llamadas':'Tokens'}</button>)}</div></div>
      <div className="mt-5 flex min-h-7 items-center gap-2 text-xs text-slate-500"><span className="h-2 w-2 rounded-full bg-blue-500"/>{selected?`${new Date(selected.date+'T12:00:00Z').toLocaleDateString('es',{day:'numeric',month:'short',timeZone:'UTC'})} · ${number(selected.value)} ${metric==='requests'?'llamadas':'tokens'}`:metric==='requests'?'Consultas completadas por la IA':'Tokens procesados por la IA'}</div>
      <svg role="img" aria-label={`Gráfica de ${metric==='requests'?'llamadas':'tokens'} de los últimos siete días`} viewBox="0 0 640 250" className="mt-1 w-full" onMouseLeave={()=>setHover(null)}>
        {[0,1,2,3,4].map(step=><g key={step}><line x1="56" x2="616" y1={y(step*max/4)} y2={y(step*max/4)} stroke="#edf1f6"/><text x="45" y={y(step*max/4)+4} textAnchor="end" fill="#94a3b8" fontSize="10">{number(step*max/4)}</text></g>)}
        {points.length>0&&<><path d={`${line} L${x(points.length-1)},212 L56,212 Z`} fill="#3b82f6" fillOpacity="0.06"/><path d={line} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinejoin="round"/>{points.map((point,index)=><g key={point.date}><text x={x(index)} y="237" textAnchor="middle" fill="#94a3b8" fontSize="10">{new Date(point.date+'T12:00:00Z').toLocaleDateString('es',{day:'numeric',month:'short',timeZone:'UTC'})}</text><circle cx={x(index)} cy={y(point.value)} r={hover===index?5:3} fill="white" stroke="#3b82f6" strokeWidth="2"/><rect tabIndex={0} role="button" aria-label={`${point.date}: ${point.value} ${metric==='requests'?'llamadas':'tokens'}`} x={x(index)-25} y="30" width="50" height="190" fill="transparent" onMouseEnter={()=>setHover(index)} onFocus={()=>setHover(index)} onBlur={()=>setHover(null)}><title>{point.date}: {number(point.value)}</title></rect></g>)}</>}
        {!points.length&&<text x="336" y="124" textAnchor="middle" fill="#94a3b8" fontSize="12">{loading?'Cargando actividad…':'Sin datos disponibles'}</text>}
      </svg>
    </Panel>
    <Panel className="p-5 sm:p-6"><div><h3 className="font-semibold text-sabero-navy">Consumo por empresa</h3><p className="mt-1 text-xs text-slate-400">Tokens del mes · hasta 5 empresas con mayor consumo</p></div><div className="mt-8 grid gap-6">{ranking.length?ranking.map((company,index)=><div key={company.id}><div className="mb-2 flex items-center justify-between gap-4 text-xs"><span className="truncate text-slate-600" title={company.name}>{company.name}</span><strong className="shrink-0 font-semibold tabular-nums text-sabero-navy">{number(Number(company.metrics?.tokens))}</strong></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none" style={{width:`${Number(company.metrics?.tokens)/top*100}%`,backgroundColor:['#3b82f6','#14b8a6','#8b5cf6','#f59e0b','#64748b'][index]}}/></div></div>):<p className="py-16 text-center text-sm text-slate-400">{loading?'Cargando consumo…':'Sin datos disponibles'}</p>}</div><p className="mt-7 text-xs leading-5 text-slate-400">Solo consumo registrado. Las empresas sin conexión se excluyen.</p></Panel>
  </div>;
}
