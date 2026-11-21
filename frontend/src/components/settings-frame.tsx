'use client';

import type { ReactNode } from 'react';
import shared from '@/features/dashboard/platform-console.module.css';
import styles from './settings-frame.module.css';

export type SettingsView = 'links' | 'knowledge' | 'agent' | 'access' | 'templates';

const screens = {
  links: { title: 'Conexiones', description: 'Vincula tus canales de atención y las herramientas que utiliza tu agente.' },
  knowledge: { title: 'Conocimiento', description: 'Administra los documentos que tu agente utiliza para responder a tus clientes.' },
  agent: { title: 'Agente comercial', description: 'Define cómo atiende tu agente, qué servicios ofrece y cuándo puede agendar.' },
  templates: { title: 'Plantillas', description: 'Crea mensajes plantilla aprobados por Meta para escribirle a tus clientes por WhatsApp.' },
  access: { title: 'Accesos', description: 'Gestiona las personas que pueden administrar el agente de tu empresa.' },
};

export function SettingsFrame({ view, children }: { view: SettingsView; children: ReactNode }) {
  const screen = screens[view];
  return (
    <div className={`${shared.console} ${styles.page}`} data-settings-view={view}>
      <header className={shared.heading}>
        <div className={styles.splitHeader}><h1>{screen.title}<span>.</span></h1><p className={shared.subtitle}>{screen.description}</p></div>
      </header>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
