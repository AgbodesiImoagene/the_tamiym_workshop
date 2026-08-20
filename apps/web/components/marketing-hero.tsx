import Image from 'next/image';
import type { ReactNode } from 'react';

type MarketingHeroProps = {
  imageSrc: string;
  imageAlt: string;
  children: ReactNode;
  priority?: boolean;
  overlayClassName?: string;
  heightClassName?: string;
};

/**
 * Full-bleed marketing hero (matches home / Figma TTW-Site pattern).
 */
export function MarketingHero({
  imageSrc,
  imageAlt,
  children,
  priority = false,
  overlayClassName = 'bg-black/25',
  heightClassName = 'h-[454px]',
}: MarketingHeroProps) {
  return (
    <section className="relative z-10 overflow-hidden">
      <div className={`relative ${heightClassName}`}>
        <Image
          src={imageSrc}
          alt={imageAlt}
          fill
          className="object-cover"
          priority={priority}
          sizes="100vw"
        />
        <div className={`absolute inset-0 ${overlayClassName}`} />
        <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-center px-6 lg:px-8">
          {children}
        </div>
      </div>
    </section>
  );
}
