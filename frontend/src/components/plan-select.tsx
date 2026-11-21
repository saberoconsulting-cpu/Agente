'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, ImageIcon, LifeBuoy } from 'lucide-react';
import { publicPlans } from '@/content/plans';

/** Accessible custom select for plans: keyboard (arrows, Home/End, Enter, Escape), click-outside close, no native popup. */
export function PlanSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = publicPlans.find(plan => plan.id === value);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  function openList() {
    setActive(Math.max(0, publicPlans.findIndex(plan => plan.id === value)));
    setOpen(true);
  }
  function choose(index: number) {
    onChange(publicPlans[index].id);
    setOpen(false);
  }
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') { setOpen(false); return; }
    if (event.key === 'Tab') { setOpen(false); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    if (!open) { openList(); return; }
    if (event.key === 'ArrowDown') setActive(index => Math.min(publicPlans.length - 1, index + 1));
    else if (event.key === 'ArrowUp') setActive(index => Math.max(0, index - 1));
    else if (event.key === 'Home') setActive(0);
    else if (event.key === 'End') setActive(publicPlans.length - 1);
    else choose(active);
  }

  return (
    <div ref={root} className="relative text-sm font-semibold text-slate-600">
      <span id={`${listId}-label`}>Plan que quieres contratar</span>
      <button type="button" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-labelledby={`${listId}-label`}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openList())} onKeyDown={onKeyDown}
        className={`mt-2 flex h-14 w-full items-center gap-3 rounded-2xl border bg-slate-50 px-4 text-left outline-none transition ${open ? 'border-sabero-electric ring-2 ring-sabero-electric/10' : 'border-slate-200 focus-visible:border-sabero-electric focus-visible:ring-2 focus-visible:ring-sabero-electric/10'}`}>
        {selected ? (
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="text-base font-bold text-sabero-navy">{selected.name}</span>
            <span className="truncate text-xs font-medium text-slate-500">US${selected.price}/mes · {selected.imagesShort}</span>
          </span>
        ) : <span className="flex-1 text-base font-normal text-slate-400">Elige tu plan</span>}
        <ChevronDown className={`h-5 w-5 shrink-0 text-sabero-electric transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul id={listId} role="listbox" aria-labelledby={`${listId}-label`} className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_20px_50px_rgba(10,30,60,0.16)]">
          {publicPlans.map((plan, index) => (
            <li key={plan.id} id={`${listId}-${index}`} role="option" aria-selected={plan.id === value}
              onMouseEnter={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}
              className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ${index === active ? 'bg-sabero-mist' : ''}`}>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2"><span className="text-sm font-bold text-sabero-navy">{plan.name}</span><span className="text-xs font-semibold text-sabero-electric">US${plan.price}/mes</span></span>
                <span className="block truncate text-xs font-normal text-slate-500">{plan.imagesShort} · {plan.support.title}</span>
              </span>
              {plan.id === value && <Check className="h-4 w-4 shrink-0 text-sabero-electric" />}
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <div className="mt-4 rounded-xl border border-sabero-electric/25 bg-sabero-mist/70 p-4 font-normal">
          <p className="text-sm leading-6 text-slate-600">{selected.description}</p>
          <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-sabero-navy"><ImageIcon className="h-4 w-4 text-sabero-electric" />{selected.images}</p>
          <p className="mt-1.5 flex items-center gap-2 text-xs font-semibold text-sabero-navy"><LifeBuoy className="h-4 w-4 text-sabero-crimson" />{selected.support.title}</p>
        </div>
      )}
    </div>
  );
}
