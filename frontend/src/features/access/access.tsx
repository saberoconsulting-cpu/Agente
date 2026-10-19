'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { apiRequest, SessionUser } from '@/lib/api';
import { Button, Panel } from '@/components/ui';

export function Access({ companyId, users, reload, pushLog }: { companyId: string; users: SessionUser[]; reload: (id?: string) => Promise<void>; pushLog: (m: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  async function createUser() {
    await apiRequest('/auth/users', {
      method: 'POST',
      body: JSON.stringify({ company_id: companyId, email, password, role: 'admin' }),
    });
    setEmail('');
    setPassword('');
    pushLog('Acceso de empresa creado.');
    await reload(companyId);
  }
  return (
    <Panel>
      <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-crimson">Multiempresa</p>
      <h2 className="mt-2 text-3xl font-black text-sabero-navy">Crear accesos por correo</h2>
      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
        <input className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-sabero-electric" placeholder="correo@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-sabero-electric" placeholder="Contrasena segura" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button variant="danger" onClick={createUser}>Crear acceso</Button>
      </div>
      <div className="mt-6 grid gap-3">
        {users.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
            <div>
              <p className="font-black text-sabero-navy">{item.email}</p>
              <p className="text-sm text-slate-500">{item.role}</p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
        ))}
      </div>
    </Panel>
  );
}


