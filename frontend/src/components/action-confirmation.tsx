'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { LogOut, ShieldAlert, X } from 'lucide-react';
import { Button } from './ui';

type ConfirmationOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'warning' | 'danger';
  icon?: 'changes' | 'logout';
};

type ConfirmationContextValue = {
  hasUnsavedChanges: boolean;
  setDirty: (source: string, dirty: boolean) => void;
  confirm: (options: ConfirmationOptions) => Promise<boolean>;
  confirmDiscard: (options?: Partial<ConfirmationOptions>) => Promise<boolean>;
  resetDirty: () => void;
};

const ConfirmationContext = createContext<ConfirmationContextValue | null>(null);

export function ActionConfirmationProvider({ children }: { children: ReactNode }) {
  const [dirtySources, setDirtySources] = useState<Record<string, boolean>>({});
  const [request, setRequest] = useState<(ConfirmationOptions & { resolve: (value: boolean) => void }) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const pendingConfirmation = useRef<Promise<boolean> | null>(null);
  const hasUnsavedChanges = Object.values(dirtySources).some(Boolean);

  const setDirty = useCallback((source: string, dirty: boolean) => {
    setDirtySources(current => {
      if (current[source] === dirty) return current;
      if (!dirty) {
        const next = { ...current };
        delete next[source];
        return next;
      }
      return { ...current, [source]: true };
    });
  }, []);

  const resetDirty = useCallback(() => setDirtySources({}), []);

  const confirm = useCallback((options: ConfirmationOptions) => {
    if (pendingConfirmation.current) return pendingConfirmation.current;
    const pending = new Promise<boolean>(resolve => setRequest({ ...options, resolve }));
    pendingConfirmation.current = pending;
    return pending;
  }, []);

  const confirmDiscard = useCallback((options: Partial<ConfirmationOptions> = {}) => {
    if (!hasUnsavedChanges) return Promise.resolve(true);
    return confirm({
      title: options.title || '¿Salir sin guardar los cambios?',
      description: options.description || 'Hay información que todavía no se ha guardado. Si continúas, esos cambios se perderán.',
      confirmLabel: options.confirmLabel || 'Salir sin guardar',
      cancelLabel: options.cancelLabel || 'Seguir editando',
      tone: options.tone || 'warning',
      icon: options.icon || 'changes',
    });
  }, [confirm, hasUnsavedChanges]);

  const finish = useCallback((accepted: boolean) => {
    const current = request;
    setRequest(null);
    pendingConfirmation.current = null;
    current?.resolve(accepted);
  }, [request]);

  useEffect(() => {
    const modal = dialog.current;
    if (request && modal && !modal.open) modal.showModal();
    if (!request && modal?.open) modal.close();
  }, [request]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);

  const value = useMemo(() => ({ hasUnsavedChanges, setDirty, confirm, confirmDiscard, resetDirty }), [confirm, confirmDiscard, hasUnsavedChanges, resetDirty, setDirty]);
  const Icon = request?.icon === 'logout' ? LogOut : ShieldAlert;

  return <ConfirmationContext.Provider value={value}>
    {children}
    <dialog
      ref={dialog}
      aria-labelledby="action-confirmation-title"
      aria-describedby="action-confirmation-description"
      onCancel={event => { event.preventDefault(); finish(false); }}
      className="confirmation-dialog m-auto w-[calc(100%-2rem)] max-w-md rounded-[28px] border-0 bg-white p-0 text-slate-700 shadow-2xl backdrop:bg-sabero-ink/60 backdrop:backdrop-blur-sm"
    >
      {request && <div className="p-6 sm:p-7">
        <div className="flex items-start justify-between gap-5">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${request.tone === 'danger' ? 'bg-rose-50 text-sabero-crimson' : 'bg-amber-50 text-amber-700'}`}>
            <Icon className="h-6 w-6" />
          </span>
          <button type="button" aria-label="Cerrar confirmación" onClick={() => finish(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <h2 id="action-confirmation-title" className="mt-6 text-2xl font-bold tracking-tight text-sabero-navy">{request.title}</h2>
        <p id="action-confirmation-description" className="mt-3 text-sm leading-6 text-slate-600">{request.description}</p>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => finish(false)} autoFocus>{request.cancelLabel || 'Cancelar'}</Button>
          <Button variant={request.tone === 'danger' ? 'danger' : 'primary'} onClick={() => finish(true)}>{request.confirmLabel || 'Continuar'}</Button>
        </div>
      </div>}
    </dialog>
  </ConfirmationContext.Provider>;
}

export function useActionConfirmation() {
  const context = useContext(ConfirmationContext);
  if (!context) throw new Error('useActionConfirmation debe usarse dentro de ActionConfirmationProvider.');
  return context;
}

export function useUnsavedChanges(source: string, dirty: boolean) {
  const { setDirty } = useActionConfirmation();
  useEffect(() => {
    setDirty(source, dirty);
    return () => setDirty(source, false);
  }, [dirty, setDirty, source]);
}
