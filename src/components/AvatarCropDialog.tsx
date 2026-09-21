import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { LoaderCircle } from 'lucide-react';

const OUTPUT_SIZE = 512;
const JPEG_QUALITY = 0.92;

export type AvatarCropDialogProps = {
  open: boolean;
  imageSrc: string | null;
  busy?: boolean;
  onCancel: () => void;
  onApply: (file: File) => void;
};

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', () => reject(new Error('Failed to load image')));
    img.src = src;
  });
}

async function cropToSquareFile(
  imageSrc: string,
  pixelCrop: Area,
  fileName: string,
): Promise<File> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error('Failed to encode image'));
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
  });

  const base = fileName.replace(/\.[^.]+$/, '') || 'avatar';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}

export function AvatarCropDialog({
  open,
  imageSrc,
  busy = false,
  onCancel,
  onApply,
}: AvatarCropDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy && !applying) onCancel();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, busy, applying, onCancel]);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function handleApply() {
    if (!imageSrc || !croppedAreaPixels || applying || busy) return;
    setApplying(true);
    setError('');
    try {
      const file = await cropToSquareFile(imageSrc, croppedAreaPixels, 'avatar.jpg');
      onApply(file);
    } catch {
      setError('Couldn’t crop that image. Try another photo.');
      setApplying(false);
    }
  }

  if (!open || !imageSrc) return null;

  const disabled = busy || applying;

  return (
    <div
      className="confirm-overlay"
      role="presentation"
      onMouseDown={disabled ? undefined : onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="avatar-crop-dialog glass"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="font-[family-name:var(--font-display)] text-xl tracking-tight">
          Crop photo
        </h2>
        <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">
          Drag to reposition. Zoom to frame your face in the square.
        </p>

        <div className="avatar-crop-stage mt-4">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <label className="avatar-crop-zoom mt-4">
          <span className="text-xs text-[var(--color-ink-muted)]">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            disabled={disabled}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom"
          />
        </label>

        {error ? (
          <p className="mt-3 text-sm text-[var(--color-danger)]" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-secondary"
            disabled={disabled}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={disabled || !croppedAreaPixels}
            onClick={() => void handleApply()}
          >
            {applying ? (
              <LoaderCircle className="icon-sm animate-spin" aria-hidden />
            ) : null}
            {applying ? 'Applying…' : 'Use photo'}
          </button>
        </div>
      </div>
    </div>
  );
}
