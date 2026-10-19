import Image from 'next/image';
import clsx from 'clsx';

export function Brand({
  dark = false,
  size = 'default',
  centered = false,
  prominentMark = false,
}: {
  dark?: boolean;
  size?: 'default' | 'large';
  centered?: boolean;
  prominentMark?: boolean;
}) {
  return (
    <div
      className={clsx(
        'flex items-center gap-3',
        centered && 'justify-center',
        size === 'large' && 'gap-5',
      )}
    >
      <div
        className={clsx(
          'relative grid shrink-0 place-items-center overflow-hidden',
          !prominentMark && 'border bg-white shadow-enterprise',
          prominentMark && 'h-14 w-40',
          !prominentMark && size === 'default' && 'h-12 w-12 rounded-2xl border-white/15',
          size === 'large' && 'h-40 w-40 rounded-2xl border-white/10',
        )}
      >
        <Image
          src="/logo.png"
          alt="SABERO Consulting"
          fill
          className={clsx(
            'object-contain',
            !prominentMark && size === 'default' && 'p-1.5',
            !prominentMark && size === 'large' && 'p-1',
          )}
          priority
        />
      </div>
      <div className={clsx(centered && 'text-center')}>
        <div className={dark ? 'text-white' : 'text-sabero-ink'}>
          <p
            className={clsx(
              'font-black tracking-[0.22em]',
              prominentMark ? 'text-xl tracking-[0.16em] xl:text-2xl' : size === 'default' && 'text-sm',
              size === 'large' && 'text-2xl',
            )}
          >
            SABERO AI
          </p>
          <p
            className={clsx(
              'font-semibold uppercase tracking-[0.16em] text-sabero-electric',
              prominentMark ? 'text-xs tracking-[0.18em] xl:text-sm' : size === 'default' && 'text-xs',
              size === 'large' && 'text-base',
            )}
          >
            Sales Engine
          </p>
        </div>
      </div>
    </div>
  );
}
