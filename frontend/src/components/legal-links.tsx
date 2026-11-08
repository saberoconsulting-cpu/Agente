'use client';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useActionConfirmation} from './action-confirmation';

export function LegalLinks(){
  const router=useRouter();
  const {confirmDiscard}=useActionConfirmation();
  async function follow(event:React.MouseEvent<HTMLAnchorElement>,href:string){
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();
    if(await confirmDiscard())router.push(href);
  }
  return <nav aria-label="Información legal" className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-slate-500"><Link href="/about" onClick={event=>void follow(event,'/about')} className="hover:text-sabero-electric">Sobre SABERO AI</Link><Link href="/privacy" onClick={event=>void follow(event,'/privacy')} className="hover:text-sabero-electric">Privacidad</Link><Link href="/terms" onClick={event=>void follow(event,'/terms')} className="hover:text-sabero-electric">Términos y condiciones</Link></nav>;
}
