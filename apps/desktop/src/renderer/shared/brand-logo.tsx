import logoUrl from "../assets/logo.png";

interface BrandLogoProps {
  size?: number;
  className?: string;
  alt?: string;
}

/** 百灵 Bailin 产品 logo（版本 C · 魂灵纹章）。 */
export function BrandLogo({ size = 32, className, alt = "" }: BrandLogoProps): JSX.Element {
  return (
    <img
      src={logoUrl}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      className={className ?? "brand-logo"}
      width={size}
      height={size}
      draggable={false}
    />
  );
}
