import { useState } from "react";

interface Props {
  src?: string | null;
  alt: string;
  className?: string;
  rounded?: string;
}

// Image with graceful fallback: while loading or on error, show a soft
// gradient placeholder with the first letter — so the grid never looks broken.
export default function Thumb({ src, alt, className = "", rounded = "rounded-xl" }: Props) {
  const [failed, setFailed] = useState(false);
  const show = src && !failed;
  return (
    <div
      className={`relative overflow-hidden bg-neutral-800 ${rounded} ${className}`}
    >
      {show ? (
        <img
          src={src!}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-700/60 to-neutral-900">
          <span className="text-3xl font-semibold text-neutral-400">
            {alt?.trim()?.[0]?.toUpperCase() ?? "·"}
          </span>
        </div>
      )}
    </div>
  );
}
