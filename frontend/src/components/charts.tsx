'use client';

import {useEffect,useId,useMemo,useRef,useState} from 'react';
import type {CSSProperties} from 'react';

export const CHART_PALETTE=['#1087FF','#38D5FF','#0A2A5C','#E11D35','#7C9CD6','#94A3B8'];
export const FUNNEL_COLORS=['#0A2A5C','#1087FF','#2E9BFF','#38D5FF','#10B981'];

const compact=(value:number)=>value.toLocaleString('es-PE',{notation:value>=10000?'compact':'standard',maximumFractionDigits:1});

export function ChartBar({value,max,color=CHART_PALETTE[0],delay=0,size='sm'}:{value:number;max:number;color?:string;delay?:number;size?:'sm'|'md'}){
  const width=value>0?Math.max(3,Math.min(100,value/Math.max(1,max)*100)):0;
  return <div className={`${size==='md'?'h-2':'h-1.5'} overflow-hidden rounded-full bg-slate-100`}><div className="chart-bar-fill h-full rounded-full" style={{'--chart-width':`${width}%`,'--chart-color':color,animationDelay:`${delay}ms`} as CSSProperties}/></div>;
}

export function ChartEmpty({children}:{children:string}){
  return <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 text-center text-sm text-slate-400">{children}</div>;
}

/** Smooth curve through the points that never dips below the data (monotone cubic interpolation). */
function smoothPath(points: Array<{ x: number; y: number }>) {
  const n = points.length;
  if (!n) return '';
  if (n === 1) return `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  const dx: number[] = [], slope: number[] = [], tangent: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) { dx[i] = points[i + 1].x - points[i].x; slope[i] = (points[i + 1].y - points[i].y) / dx[i]; }
  tangent[0] = slope[0];
  tangent[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) tangent[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { tangent[i] = 0; tangent[i + 1] = 0; continue; }
    const a = tangent[i] / slope[i], b = tangent[i + 1] / slope[i], h = Math.hypot(a, b);
    if (h > 3) { const s = 3 / h; tangent[i] = s * a * slope[i]; tangent[i + 1] = s * b * slope[i]; }
  }
  let path = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = points[i].x + dx[i] / 3, c1y = points[i].y + tangent[i] * dx[i] / 3;
    const c2x = points[i + 1].x - dx[i] / 3, c2y = points[i + 1].y - tangent[i + 1] * dx[i] / 3;
    path += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${points[i + 1].x.toFixed(1)},${points[i + 1].y.toFixed(1)}`;
  }
  return path;
}

/** Whole-number ticks (a count never reads "2.5"). */
function niceTicks(max: number) {
  if (max <= 4) return Array.from({ length: Math.max(1, Math.ceil(max)) + 1 }, (_, index) => index);
  const step = Math.ceil(max / 4);
  return [0, 1, 2, 3, 4].map(index => index * step);
}

export function LineAreaChart({points,ariaLabel,valueLabel='eventos',formatValue=compact}:{points:Array<{key:string;label:string;value:number}>;ariaLabel:string;valueLabel?:string;formatValue?:(value:number)=>string}){
  const wrap=useRef<HTMLDivElement>(null);
  const [width,setWidth]=useState(640);
  const [active,setActive]=useState<number|null>(null);
  const rawId=useId(),id=rawId.replaceAll(':','');
  useEffect(()=>{
    const node=wrap.current;
    if(!node)return;
    const update=()=>setWidth(Math.max(260,Math.floor(node.clientWidth)));
    update();
    if(typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(update);
    observer.observe(node);
    return()=>observer.disconnect();
  },[]);
  // Drawn at the real pixel size, so lines and labels stay fine on any screen.
  const height=230,left=34,right=10,top=14,bottom=30;
  const chartWidth=width-left-right,chartHeight=height-top-bottom;
  const hasData=points.some(point=>point.value>0);
  const ticks=niceTicks(Math.max(1,...points.map(point=>point.value)));
  const max=ticks[ticks.length-1]||1;
  const x=(index:number)=>left+(points.length===1?chartWidth/2:index*chartWidth/Math.max(1,points.length-1));
  const y=(value:number)=>top+chartHeight-value/max*chartHeight;
  const coords=points.map((point,index)=>({x:x(index),y:y(point.value)}));
  const line=smoothPath(coords);
  const area=line?`${line} L${x(points.length-1).toFixed(1)},${top+chartHeight} L${x(0).toFixed(1)},${top+chartHeight} Z`:'';
  const selected=active===null?null:points[active];
  const labelEvery=Math.max(1,Math.ceil(points.length/Math.max(2,Math.floor(chartWidth/90))));
  const animationKey=useMemo(()=>points.map(point=>point.value).join('-'),[points]);
  if(!points.length)return <ChartEmpty>Sin datos disponibles.</ChartEmpty>;
  const step=chartWidth/Math.max(1,points.length-1);
  return <div ref={wrap} className="relative">
    <div className="mb-1 flex min-h-6 items-center gap-2 text-xs text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-[#1087FF]"/>{selected?<><strong className="font-semibold text-slate-700">{selected.label}</strong><span>· {formatValue(selected.value)} {valueLabel}</span></>:<span>Pasa el cursor sobre la gráfica para ver cada día.</span>}</div>
    <svg key={animationKey} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block max-w-full" role="img" aria-label={ariaLabel} onMouseLeave={()=>setActive(null)}>
      <defs><linearGradient id={`chart-fill-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1087FF" stopOpacity=".16"/><stop offset="100%" stopColor="#1087FF" stopOpacity="0"/></linearGradient></defs>
      {ticks.map(tick=>{const gridY=y(tick);return <g key={tick}><line x1={left} x2={width-right} y1={gridY} y2={gridY} stroke={tick===0?'#D7E3F5':'#E9EFF8'} strokeWidth="1" strokeDasharray={tick===0?undefined:'3 4'}/><text x={left-8} y={gridY+3.5} textAnchor="end" fill="#94A3B8" fontSize="10.5">{formatValue(tick)}</text></g>;})}
      {selected&&active!==null&&<line x1={x(active)} x2={x(active)} y1={top} y2={top+chartHeight} stroke="#1087FF" strokeOpacity=".35" strokeWidth="1"/>}
      {hasData&&<><path d={area} fill={`url(#chart-fill-${id})`} className="chart-area-reveal"/><path d={line} pathLength="1" fill="none" stroke="#1087FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="chart-line-draw"/></>}
      {!hasData&&<path d={line} fill="none" stroke="#C9D8EE" strokeWidth="2" strokeLinecap="round"/>}
      {selected&&active!==null&&<circle cx={x(active)} cy={y(selected.value)} r="4.5" fill="#fff" stroke="#1087FF" strokeWidth="2"/>}
      {points.map((point,index)=>(index%labelEvery===0||index===points.length-1)?<text key={point.key} x={x(index)} y={height-9} textAnchor={index===0?'start':index===points.length-1?'end':'middle'} fill="#94A3B8" fontSize="10.5">{point.label}</text>:null)}
      {!hasData&&<text x={left+chartWidth/2} y={top+chartHeight/2-12} textAnchor="middle" fill="#94A3B8" fontSize="12">Aún no hay actividad en este periodo</text>}
      {points.map((point,index)=><rect key={point.key} x={x(index)-step/2} y={top} width={Math.max(8,step)} height={chartHeight} fill="transparent" onMouseEnter={()=>setActive(index)} onFocus={()=>setActive(index)} onTouchStart={()=>setActive(index)}/>)}
    </svg>
  </div>;
}

export function DonutChart({segments,centerLabel='oportunidades'}:{segments:Array<{label:string;value:number}>;centerLabel?:string}){
  const total=segments.reduce((sum,item)=>sum+item.value,0),radius=64,circumference=2*Math.PI*radius;
  let offset=0;
  if(!total)return <ChartEmpty>Sin datos suficientes para mostrar la distribución.</ChartEmpty>;
  const arcs=segments.map((segment,index)=>{const length=segment.value/total*circumference,visible=Math.max(0,length-2);const arc=<circle key={segment.label} cx="88" cy="88" r={radius} fill="none" stroke={CHART_PALETTE[index%CHART_PALETTE.length]} strokeWidth="18" strokeDasharray={`${visible} ${circumference-visible}`} strokeDashoffset={-offset} transform="rotate(-90 88 88)" className="chart-ring-segment" style={{animationDelay:`${index*70}ms`}}/>;offset+=length;return arc;});
  return <div className="flex flex-col items-center gap-7 sm:flex-row sm:items-center"><svg viewBox="0 0 176 176" className="h-44 w-44 shrink-0" role="img" aria-label="Distribución por servicio"><circle cx="88" cy="88" r={radius} fill="none" stroke="#EDF2F5" strokeWidth="18"/>{arcs}<text x="88" y="83" textAnchor="middle" fill="#16324A" fontSize="28" fontWeight="700">{total}</text><text x="88" y="104" textAnchor="middle" fill="#7C8A9A" fontSize="10">{centerLabel}</text></svg><ul className="grid w-full flex-1 gap-3">{segments.map((segment,index)=><li key={segment.label} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 text-sm"><span className="h-2.5 w-2.5 rounded-full" style={{backgroundColor:CHART_PALETTE[index%CHART_PALETTE.length]}}/><span className="truncate text-slate-600">{segment.label}</span><span className="tabular-nums text-slate-500"><strong className="font-semibold text-slate-700">{segment.value}</strong> · {Math.round(segment.value/total*100)}%</span></li>)}</ul></div>;
}
