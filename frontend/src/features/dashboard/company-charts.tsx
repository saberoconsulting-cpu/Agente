'use client';

import {useMemo,useState} from 'react';
import {LineAreaChart} from '@/components/charts';
import styles from './platform-console.module.css';

export type ChartCompany={id:string;name:string;metrics:null|{tokens:string;ai_requests:number};activity?:{date:string;requests:number;tokens:string}[]};
const number=(value:number)=>value.toLocaleString('es-PE',{notation:value>=10000?'compact':'standard',maximumFractionDigits:1});
const dateLabel=(date:string)=>new Date(date+'T12:00:00Z').toLocaleDateString('es-PE',{day:'numeric',month:'short',timeZone:'UTC'}).replace('.','');

export function CompanyCharts({companies,loading}:{companies:ChartCompany[];loading:boolean}){
  const [metric,setMetric]=useState<'requests'|'tokens'>('requests');
  const points=useMemo(()=>{const days=new Map<string,number>();for(const company of companies)if(company.metrics)for(const day of company.activity||[])days.set(day.date,(days.get(day.date)||0)+Number(day[metric]));return Array.from(days).sort(([a],[b])=>a.localeCompare(b)).map(([date,value])=>({key:date,label:dateLabel(date),value}));},[companies,metric]);
  const ranking=useMemo(()=>companies.filter(company=>company.metrics).sort((a,b)=>Number(b.metrics?.tokens)-Number(a.metrics?.tokens)).slice(0,5),[companies]);
  const top=Math.max(1,...ranking.map(company=>Number(company.metrics?.tokens)));
  return <div className={styles.charts}>
    <section className={styles.panel} aria-labelledby="platform-activity-title">
      <div className={styles.sectionHeader}><div><p className={styles.eyebrow}>ACTIVIDAD</p><h3 id="platform-activity-title">Actividad del agente</h3><p className={styles.chartSubtitle}>Evolución de los últimos siete días</p></div><div className={styles.chartTabs} aria-label="Métrica de actividad">{(['requests','tokens'] as const).map(key=><button key={key} type="button" aria-pressed={metric===key} onClick={()=>setMetric(key)}>{key==='requests'?'Consultas':'Tokens'}</button>)}</div></div>
      <div className={styles.chart}>{loading?<div role="status" className={styles.empty}>Consultando actividad…</div>:<LineAreaChart points={points} ariaLabel={'Gráfica de '+(metric==='requests'?'consultas':'tokens')+' de los últimos siete días'} valueLabel={metric==='requests'?'consultas':'tokens'} formatValue={number}/>}</div>
    </section>
    <section className={styles.panel} aria-labelledby="platform-consumption-title"><p className={styles.eyebrow}>DISTRIBUCIÓN MENSUAL</p><h3 id="platform-consumption-title">Consumo por empresa</h3><p className={styles.chartSubtitle}>Las cinco empresas con mayor uso de tokens</p>
      <div className={styles.ranking}>{ranking.length?ranking.map((company,index)=><div className={styles.rankRow} key={company.id}><span className={styles.rankName} title={company.name}>{company.name}</span><strong className={styles.rankValue}>{number(Number(company.metrics?.tokens))}</strong><div className={styles.rankBar}><span style={{width:(Number(company.metrics?.tokens)/top*100)+'%',opacity:1-index*.13}}/></div></div>):<div className={styles.empty}>{loading?'Consultando consumo…':'Sin consumo registrado'}</div>}</div>
      <p className={styles.chartFootnote}>Tokens registrados en el mes. Las empresas con conexión pendiente quedan fuera del cálculo.</p>
    </section>
  </div>;
}
