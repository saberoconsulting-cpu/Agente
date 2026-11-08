'use client';

import {useId,useMemo,useState} from 'react';
import type {CSSProperties} from 'react';

export const CHART_PALETTE=['#176B87','#2F8F89','#5BAEA7','#E58B6B','#D1A34B','#718096'];

const compact=(value:number)=>value.toLocaleString('es-PE',{notation:value>=10000?'compact':'standard',maximumFractionDigits:1});

export function ChartBar({value,max,color=CHART_PALETTE[0],delay=0,size='sm'}:{value:number;max:number;color?:string;delay?:number;size?:'sm'|'md'}){
  const width=value>0?Math.max(3,Math.min(100,value/Math.max(1,max)*100)):0;
  return <div className={`${size==='md'?'h-3':'h-2'} overflow-hidden rounded-full bg-slate-100`}><div className="chart-bar-fill h-full rounded-full" style={{'--chart-width':`${width}%`,'--chart-color':color,animationDelay:`${delay}ms`} as CSSProperties}/></div>;
}

export function ChartEmpty({children}:{children:string}){
  return <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 text-center text-sm text-slate-400">{children}</div>;
}

export function LineAreaChart({points,ariaLabel,valueLabel='eventos',formatValue=compact}:{points:Array<{key:string;label:string;value:number}>;ariaLabel:string;valueLabel?:string;formatValue?:(value:number)=>string}){
  const [active,setActive]=useState<number|null>(null);
  const rawId=useId(),id=rawId.replaceAll(':','');
  const width=680,height=250,left=52,right=18,top=20,bottom=38;
  const chartWidth=width-left-right,chartHeight=height-top-bottom;
  const max=Math.max(1,...points.map(point=>point.value));
  const x=(index:number)=>left+(points.length===1?chartWidth/2:index*chartWidth/Math.max(1,points.length-1));
  const y=(value:number)=>top+chartHeight-value/max*chartHeight;
  const line=points.map((point,index)=>`${index?'L':'M'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
  const area=line?`${line} L${x(points.length-1).toFixed(1)},${top+chartHeight} L${x(0).toFixed(1)},${top+chartHeight} Z`:'';
  const selected=active===null?null:points[active];
  const hasData=points.some(point=>point.value>0);
  const labelEvery=Math.max(1,Math.ceil(points.length/5));
  const animationKey=useMemo(()=>points.map(point=>point.value).join('-'),[points]);
  if(!points.length)return <ChartEmpty>Sin datos disponibles.</ChartEmpty>;
  return <div className="relative"><div className="mb-2 flex min-h-6 items-center gap-2 text-xs text-slate-500"><span className="h-2 w-2 rounded-full bg-[#176B87]"/>{selected?<><strong className="font-semibold text-slate-700">{selected.label}</strong><span>· {formatValue(selected.value)} {valueLabel}</span></>:<span>Pasa el cursor por la gráfica para ver el detalle</span>}</div>
    <svg key={animationKey} viewBox={`0 0 ${width} ${height}`} className="h-auto w-full overflow-visible" role="img" aria-label={ariaLabel} onMouseLeave={()=>setActive(null)}><defs><linearGradient id={`chart-fill-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2F8F89" stopOpacity=".22"/><stop offset="100%" stopColor="#2F8F89" stopOpacity="0"/></linearGradient></defs>
      {[0,.25,.5,.75,1].map(ratio=>{const gridY=top+ratio*chartHeight,value=max*(1-ratio);return <g key={ratio}><line x1={left} x2={width-right} y1={gridY} y2={gridY} stroke="#E7EDF2" strokeWidth="1"/><text x={left-10} y={gridY+4} textAnchor="end" fill="#94A3B8" fontSize="10">{formatValue(value)}</text></g>;})}
      {hasData&&<><path d={area} fill={`url(#chart-fill-${id})`} className="chart-area-reveal"/><path d={line} pathLength="1" fill="none" stroke="#176B87" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="chart-line-draw"/>{points.map((point,index)=><g key={point.key}><circle cx={x(index)} cy={y(point.value)} r={active===index?5:3.5} fill="white" stroke="#176B87" strokeWidth="2.5" className="chart-point-pop" style={{animationDelay:`${250+index*35}ms`}}/><rect tabIndex={0} role="button" aria-label={`${point.label}: ${formatValue(point.value)} ${valueLabel}`} x={x(index)-Math.max(12,chartWidth/points.length/2)} y={top} width={Math.max(24,chartWidth/points.length)} height={chartHeight} fill="transparent" onMouseEnter={()=>setActive(index)} onFocus={()=>setActive(index)} onBlur={()=>setActive(null)}/></g>)}</>}
      {points.map((point,index)=>(index%labelEvery===0||index===points.length-1)?<text key={point.key} x={x(index)} y={height-10} textAnchor="middle" fill="#7C8A9A" fontSize="10.5">{point.label}</text>:null)}{!hasData&&<text x={left+chartWidth/2} y={top+chartHeight/2} textAnchor="middle" fill="#94A3B8" fontSize="12">Aún no hay actividad registrada</text>}
    </svg></div>;
}

export function DonutChart({segments,centerLabel='oportunidades'}:{segments:Array<{label:string;value:number}>;centerLabel?:string}){
  const total=segments.reduce((sum,item)=>sum+item.value,0),radius=64,circumference=2*Math.PI*radius;
  let offset=0;
  if(!total)return <ChartEmpty>Sin datos suficientes para mostrar la distribución.</ChartEmpty>;
  const arcs=segments.map((segment,index)=>{const length=segment.value/total*circumference,visible=Math.max(0,length-2);const arc=<circle key={segment.label} cx="88" cy="88" r={radius} fill="none" stroke={CHART_PALETTE[index%CHART_PALETTE.length]} strokeWidth="18" strokeDasharray={`${visible} ${circumference-visible}`} strokeDashoffset={-offset} transform="rotate(-90 88 88)" className="chart-ring-segment" style={{animationDelay:`${index*70}ms`}}/>;offset+=length;return arc;});
  return <div className="flex flex-col items-center gap-7 sm:flex-row sm:items-center"><svg viewBox="0 0 176 176" className="h-44 w-44 shrink-0" role="img" aria-label="Distribución por servicio"><circle cx="88" cy="88" r={radius} fill="none" stroke="#EDF2F5" strokeWidth="18"/>{arcs}<text x="88" y="83" textAnchor="middle" fill="#16324A" fontSize="28" fontWeight="700">{total}</text><text x="88" y="104" textAnchor="middle" fill="#7C8A9A" fontSize="10">{centerLabel}</text></svg><ul className="grid w-full flex-1 gap-3">{segments.map((segment,index)=><li key={segment.label} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 text-sm"><span className="h-2.5 w-2.5 rounded-full" style={{backgroundColor:CHART_PALETTE[index%CHART_PALETTE.length]}}/><span className="truncate text-slate-600">{segment.label}</span><span className="tabular-nums text-slate-500"><strong className="font-semibold text-slate-700">{segment.value}</strong> · {Math.round(segment.value/total*100)}%</span></li>)}</ul></div>;
}
