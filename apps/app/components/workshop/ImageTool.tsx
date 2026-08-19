'use client';

import { useRef, useState, useCallback } from 'react';
import { Button } from '@tamiym/ui';
import { uploadDesignAsset } from '@/lib/designs';

const MAX_FILE_SIZE_MB = 10;
const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp';

interface ImageToolProps {
  /**
   * Called with a fabric.Image-compatible JSON to add to the canvas.
   * `designAssetId` is stored as custom data on the object.
   */
  onAddImage: (imageObject: Record<string, unknown>) => void;
}

/**
 * File picker for uploading image layers to the Design Workshop canvas.
 * Uploads to the API, then emits a Fabric.js-compatible image descriptor.
 */
export default function ImageTool({ onAddImage }: ImageToolProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setError(`File must be smaller than ${MAX_FILE_SIZE_MB} MB`);
        return;
      }

      setError(null);
      setUploading(true);

      try {
        const { designAssetId, originalUrl } = await uploadDesignAsset(file);

        if (!originalUrl) {
          setError('Upload succeeded but no URL returned — asset is still processing.');
          return;
        }

        onAddImage({
          type: 'image',
          src: originalUrl,
          left: 50,
          top: 50,
          scaleX: 0.5,
          scaleY: 0.5,
          selectable: true,
          data: { designAssetId },
        });
      } catch (err: unknown) {
        const message =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Upload failed';
        setError(message);
      } finally {
        setUploading(false);
        // Reset so the same file can be selected again
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [onAddImage]
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-zinc-900">Add Image</h3>

      <p className="text-xs text-zinc-500">PNG, JPEG or WebP · max {MAX_FILE_SIZE_MB} MB</p>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleFileChange}
        disabled={uploading}
        className="sr-only"
        id="image-tool-input"
      />

      <Button
        variant="secondary"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? 'Uploading…' : 'Choose image'}
      </Button>

      {error && (
        <p className="text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
