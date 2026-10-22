'use client';

import {useEffect, useId, useRef, useState} from 'react';
import {Check, ChevronDown, Globe2, Search} from 'lucide-react';
import {type CountryCode} from 'libphonenumber-js/max';
import {internationalPhone, phoneCountries} from '@/lib/phone';

const searchable = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function PhoneField({country, value, onCountryChange, onChange}: {
  country: CountryCode | ''; value: string;
  onCountryChange: (value: CountryCode) => void; onChange: (value: string) => void;
}) {
  const [touched, setTouched] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  const selected = phoneCountries.find(item => item.country === country);
  const invalid = touched && value.length > 0 && (!country || !internationalPhone(value, country));
  const results = query.trim() ? phoneCountries.filter(item => searchable(`${item.name} ${item.country} ${item.dial}`).includes(searchable(query.trim()))) : phoneCountries;

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    function outside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({block: 'nearest'});
  }, [active, open, id]);

  function choose(code: CountryCode) {
    onCountryChange(code);
    setTouched(false);
    setOpen(false);
    trigger.current?.focus();
  }

  function show() {setQuery(''); setActive(0); setOpen(true);}

  return <fieldset className="mt-5 min-w-0">
    <legend className="sr-only">Teléfono</legend>
    <div ref={container} className="relative">
      <div className={`flex h-14 min-w-0 items-center rounded-2xl border bg-transparent transition focus-within:border-sabero-electric focus-within:ring-2 focus-within:ring-sabero-electric/10 ${invalid ? 'border-red-400' : 'border-slate-200'}`}>
        <button ref={trigger} type="button" aria-label="País o territorio" title={selected?.name || 'Elegir país'} aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-popup`}
          onClick={() => open ? setOpen(false) : show()}
          onKeyDown={event => {if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {event.preventDefault(); show();}}}
          className="flex h-8 shrink-0 items-center gap-2 border-r border-slate-200 px-4 text-sm text-sabero-navy outline-none focus-visible:text-sabero-electric">
          {selected ? <><span className="text-[10px] font-semibold text-slate-400">{country}</span><span className="font-medium tabular-nums">{selected.dial}</span></> : <Globe2 aria-hidden="true" className="h-5 w-5 text-slate-400"/>}
          <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`}/>
        </button>
        <input aria-label="Número nacional" required type="tel" inputMode="tel" autoComplete="tel-national" maxLength={30} value={value} onChange={event => onChange(event.target.value)} onBlur={() => setTouched(true)} aria-invalid={invalid} aria-describedby={invalid ? `${id}-help` : undefined} placeholder="Teléfono" className="h-full w-0 min-w-0 flex-1 bg-transparent px-4 text-base font-normal text-sabero-navy outline-none placeholder:text-slate-400"/>
      </div>
      {open && <div id={`${id}-popup`} role="dialog" aria-label="Seleccionar país" className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_48px_rgba(10,30,60,0.16)] lg:absolute lg:left-auto lg:right-full lg:mr-3 lg:w-80 lg:translate-x-0 lg:-translate-y-[60%]">
        <div className="border-b border-slate-100 p-3"><div className="flex items-center gap-3 border-b border-slate-200 px-1 py-3"><Search aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400"/>
          <input ref={search} role="combobox" aria-label="Buscar país o código" aria-expanded="true" aria-autocomplete="list" aria-controls={`${id}-list`} aria-activedescendant={results[active] ? `${id}-option-${active}` : undefined}
            autoComplete="off" placeholder="Buscar país o código…" value={query} onChange={event => {setQuery(event.target.value); setActive(0);}}
            onKeyDown={event => {
              if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus();}
              if (event.key === 'Tab') setOpen(false);
              if (event.key === 'ArrowDown') {event.preventDefault(); setActive(index => Math.min(index + 1, results.length - 1));}
              if (event.key === 'ArrowUp') {event.preventDefault(); setActive(index => Math.max(0, index - 1));}
              if (event.key === 'Enter') {event.preventDefault(); if (results[active]) choose(results[active].country);}
            }} className="w-full min-w-0 bg-transparent text-sm text-sabero-navy outline-none"/>
        </div></div>
        <div id={`${id}-list`} role="listbox" aria-label="Países y códigos telefónicos" className="overflow-y-auto overscroll-contain px-3" style={{maxHeight: 'min(480px, 45vh)', scrollbarGutter: 'stable'}}>
          {!results.length && <p role="status" className="px-3 py-5 text-center text-sm text-slate-500">No encontramos ese país o código.</p>}
          {results.map((item, index) => <div key={item.country}>
            <button type="button" role="option" tabIndex={-1} id={`${id}-option-${index}`} aria-selected={country === item.country} data-country={item.country} data-dial={item.dial} title={item.name}
              onClick={() => choose(item.country)} onPointerMove={() => setActive(index)}
              className={`flex h-12 w-full items-center gap-3 overflow-hidden border-b border-slate-100 px-1 py-1 text-left text-sm transition ${active === index ? 'text-sabero-electric underline underline-offset-4' : 'text-slate-700 hover:text-sabero-electric'}`}>
              <span aria-hidden="true" className="w-7 shrink-0 text-[10px] font-bold text-slate-400">{item.country}</span><span className="min-w-0 flex-1 line-clamp-2 whitespace-normal leading-5">{item.name}</span><span className="font-medium tabular-nums text-slate-500">{item.dial}</span><span className="w-4 shrink-0">{country === item.country && <Check aria-hidden="true" className="h-4 w-4 text-sabero-electric"/>}</span>
            </button>
          </div>)}
        </div>
      </div>}
    </div>
    {invalid && <p id={`${id}-help`} className="mt-2 text-xs text-red-700">Revisa el número y el país elegido.</p>}
  </fieldset>;
}
