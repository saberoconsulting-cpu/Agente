'use client';
import {ReactNode,useEffect,useRef} from 'react';
import {X} from 'lucide-react';

export function ReviewModal({title,busy=false,onClose,children}:{title:string;busy?:boolean;onClose:()=>void;children:ReactNode}){
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const modal=dialog.current;if(!modal?.open)modal?.showModal();const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{modal?.close();document.body.style.overflow=previous;};},[]);
  return <dialog ref={dialog} aria-label={title} onCancel={event=>{event.preventDefault();if(!busy)onClose();}} className="m-auto max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-5xl overflow-y-auto rounded-3xl border-0 bg-slate-50 p-0 text-slate-700 shadow-2xl backdrop:bg-slate-950/50"><div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4"><p className="font-semibold text-sabero-navy">{title}</p><button type="button" aria-label="Cerrar ficha de empresa" disabled={busy} onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-40"><X className="h-5 w-5"/></button></div><div className="p-5 sm:p-7">{children}</div></dialog>;
}
