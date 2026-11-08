'use client';

import {useMemo} from 'react';
import {Target,TrendingUp,Users,Wallet} from 'lucide-react';
import {ChartBar,CHART_PALETTE,DonutChart,LineAreaChart} from '@/components/charts';
import {formatMoney} from '@/lib/format';
import type {DashboardSummary,Opportunity} from '@/lib/types';
import {Panel} from '@/components/ui';

const localKey=(value:string|Date)=>{const date=typeof value==='string'?new Date(value):value;return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;};
const stageLabels:Record<string,string>={nuevo:'Nuevas',calificado:'Calificadas',interesado:'Con interés',seguimiento:'En seguimiento',reunion_propuesta:'Reunión propuesta',reunion_agendada:'Reunión agendada',propuesta_enviada:'Propuesta enviada',propuesta:'Negociación',reservado:'Reservadas',pagado:'Pagadas',en_envio:'En entrega',ganado:'Ganadas',perdido:'Perdidas'};

function ChartHeading({eyebrow,title,description,aside}:{eyebrow:string;title:string;description?:string;aside?:React.ReactNode}){
  return <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="chart-eyebrow">{eyebrow}</p><h2 className="chart-title">{title}</h2>{description&&<p className="chart-description">{description}</p>}</div>{aside}</div>;
}

export function Analytics({summary,opportunities}:{summary:DashboardSummary|null;opportunities:Opportunity[]}){
  const sales=summary?.sales;
  const openOpportunities=opportunities.filter(item=>!['ganado','perdido'].includes(item.stage)).length;
  const kpis=[
    {label:'Valor en pipeline',value:formatMoney(sales?.pipeline_value||0),detail:'negocios activos',Icon:Wallet},
    {label:'Valor ganado',value:formatMoney(sales?.won_value||0),detail:'durante este mes',Icon:TrendingUp},
    {label:'Contactos',value:summary?.metrics.leads??0,detail:'personas registradas',Icon:Users},
    {label:'Oportunidades abiertas',value:openOpportunities,detail:'requieren seguimiento',Icon:Target},
  ];
  const funnel=[['Creadas',sales?.created||0],['Calificadas',sales?.qualified||0],['Reuniones',sales?.meetings||0],['Propuestas',sales?.proposals||0],['Ganadas',sales?.won||0]] as const;
  const funnelMax=Math.max(1,...funnel.map(([,value])=>value));
  const activity=useMemo(()=>{const today=new Date();const days=Array.from({length:14},(_,index)=>{const date=new Date(today.getFullYear(),today.getMonth(),today.getDate()-(13-index));return {key:localKey(date),label:date.toLocaleDateString('es-PE',{day:'2-digit',month:'short'}).replace('.',''),value:0};});const index=new Map(days.map((day,position)=>[day.key,position]));for(const event of summary?.recent_events||[]){const position=index.get(localKey(event.created_at));if(position!==undefined)days[position].value++;}return days;},[summary]);
  const serviceSegments=useMemo(()=>{const rows=(sales?.by_service||[]).map(row=>({label:row.label||'Sin servicio',value:row.count})).sort((a,b)=>b.value-a.value);if(rows.length<=6)return rows;return [...rows.slice(0,5),{label:'Otros servicios',value:rows.slice(5).reduce((sum,row)=>sum+row.value,0)}];},[sales]);
  const assignees=useMemo(()=>[...(sales?.by_assignee||[])].sort((a,b)=>b.count-a.count).slice(0,6),[sales]);
  const assigneeMax=Math.max(1,...assignees.map(row=>row.count));
  const stageCounts=useMemo(()=>{const map=new Map<string,number>();for(const opportunity of opportunities)map.set(opportunity.stage,(map.get(opportunity.stage)||0)+1);return Array.from(map.entries()).sort((a,b)=>b[1]-a[1]);},[opportunities]);
  const stageMax=Math.max(1,...stageCounts.map(([,count])=>count));
  return <div className="grid gap-6">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{kpis.map(({label,value,detail,Icon})=><Panel key={label} className="chart-kpi chart-card-enter relative overflow-hidden p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-slate-500">{label}</p><strong className="mt-2 block text-2xl font-semibold tracking-tight text-[#16324A]">{value}</strong><p className="mt-1 text-xs text-slate-400">{detail}</p></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#EAF4F3] text-[#176B87]"><Icon className="h-5 w-5" strokeWidth={1.7}/></span></div></Panel>)}</div>

    <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
      <Panel className="chart-panel"><ChartHeading eyebrow="Recorrido comercial" title="Embudo del mes" description="Cómo avanzan las oportunidades entre cada etapa." aside={<span className="rounded-full bg-[#EAF4F3] px-3 py-1.5 text-xs font-semibold text-[#176B87]">{sales?.conversion.won||0}% de cierre</span>}/><div className="mt-7 grid gap-5">{funnel.map(([label,value],index)=>{const previous=index?funnel[index-1][1]:value,rate=previous?Math.round(value/previous*100):0;return <div key={label}><div className="mb-2 flex items-center justify-between gap-4 text-sm"><span className="text-slate-600">{label}</span><span className="tabular-nums text-slate-500"><strong className="font-semibold text-slate-700">{value}</strong>{index>0&&<span className="ml-2 text-xs">{rate}% del paso anterior</span>}</span></div><ChartBar value={value} max={funnelMax} color={CHART_PALETTE[index%3]} delay={index*80} size="md"/></div>;})}</div></Panel>
      <Panel className="chart-panel"><ChartHeading eyebrow="Composición" title="Interés por solución" description="Distribución de las oportunidades abiertas por servicio."/><div className="mt-7"><DonutChart segments={serviceSegments}/></div></Panel>
    </div>

    <Panel className="chart-panel"><ChartHeading eyebrow="Tendencia" title="Actividad reciente" description="Eventos comerciales registrados durante los últimos catorce días." aside={<span className="text-sm tabular-nums text-slate-500"><strong className="font-semibold text-slate-700">{activity.reduce((sum,day)=>sum+day.value,0)}</strong> eventos</span>}/><div className="mt-5"><LineAreaChart points={activity} ariaLabel="Actividad comercial de los últimos catorce días"/></div></Panel>

    <div className="grid gap-6 lg:grid-cols-2">
      <Panel className="chart-panel"><ChartHeading eyebrow="Equipo" title="Carga por responsable" description="Oportunidades abiertas y valor asociado."/><div className="mt-7 grid gap-5">{assignees.length?assignees.map((row,index)=><div key={row.label||String(index)}><div className="mb-2 flex items-center justify-between gap-4 text-sm"><span className="truncate text-slate-600">{row.label||'Sin asignar'}</span><span className="shrink-0 text-slate-500"><strong className="font-semibold text-slate-700">{row.count}</strong> · {formatMoney(Number(row.value))}</span></div><ChartBar value={row.count} max={assigneeMax} color={CHART_PALETTE[index%3]} delay={index*70} size="md"/></div>):<p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-400">Aún no hay oportunidades asignadas.</p>}</div></Panel>
      <Panel className="chart-panel"><ChartHeading eyebrow="Pipeline" title="Oportunidades por etapa" description="Vista comparativa del estado actual de los negocios."/><div className="mt-7 grid gap-4">{stageCounts.length?stageCounts.map(([stage,count],index)=><div key={stage} className="grid grid-cols-[minmax(105px,145px)_1fr_auto] items-center gap-3"><span className="truncate text-sm text-slate-600" title={stageLabels[stage]||stage}>{stageLabels[stage]||stage}</span><ChartBar value={count} max={stageMax} color={CHART_PALETTE[index%CHART_PALETTE.length]} delay={index*60} size="md"/><strong className="w-6 text-right text-sm font-semibold tabular-nums text-slate-700">{count}</strong></div>):<p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-400">Sin oportunidades registradas.</p>}</div></Panel>
    </div>
  </div>;
}
