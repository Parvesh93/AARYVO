import Image from "next/image";

export default function BrandLogo({variant="full",theme="dark",className=""}:{variant?:"full"|"icon";theme?:"dark"|"light";className?:string}){
  const src = variant === "icon"
    ? (theme === "light" ? "/aaryvo-icon-white.webp" : "/aaryvo-icon.webp")
    : (theme === "light" ? "/aaryvo-logo-white.webp" : "/aaryvo-logo.webp");
  const width = variant === "icon" ? 320 : 2048;
  const height = variant === "icon" ? 360 : 500;
  return <Image src={src} alt="AARYVO" width={width} height={height} priority className={className} />;
}
