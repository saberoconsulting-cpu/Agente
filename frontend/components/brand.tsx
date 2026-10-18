import Image from 'next/image';

export function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative grid h-12 w-12 place-items-center overflow-hidden rounded-2xl border border-white/15 bg-white shadow-enterprise">
        <Image src="/logo.png" alt="SABERO Consulting" fill className="object-contain p-1.5" priority />
      </div>
      <div>
        <div className={dark ? 'text-white' : 'text-sabero-ink'}>
          <p className="text-sm font-black tracking-[0.22em]">SABERO AI</p>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sabero-electric">
            Sales Engine
          </p>
        </div>
      </div>
    </div>
  );
}
