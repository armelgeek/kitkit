interface Props {
  imageSrc?: string | null;
  videoSrc?: string | null;
  title?: string;
  onClose: () => void;
}

export default function Lightbox({ imageSrc, videoSrc, title, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/85 p-6"
      onClick={onClose}
    >
      <div className="max-h-[85vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        {videoSrc ? (
          <video src={videoSrc} controls autoPlay className="max-h-[85vh] max-w-[90vw] rounded-lg" />
        ) : (
          <img src={imageSrc ?? ""} alt={title} className="max-h-[85vh] max-w-[90vw] rounded-lg" />
        )}
        {title && <div className="mt-2 text-center text-sm text-neutral-300">{title}</div>}
      </div>
      <button
        onClick={onClose}
        className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
      >
        ✕
      </button>
    </div>
  );
}
