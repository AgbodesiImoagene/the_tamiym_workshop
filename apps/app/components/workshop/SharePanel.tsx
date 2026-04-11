'use client';

import { useState, useCallback } from 'react';
import { Button } from '@tamiym/ui';
import { shareDesign } from '@/lib/designs';

interface SharePanelProps {
  designId: string | undefined;
}

/**
 * Button to generate a share link for the current design.
 * Copies the URL to clipboard and shows it in a read-only input.
 */
export default function SharePanel({ designId }: SharePanelProps) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    if (!designId) return;
    setError(null);
    setLoading(true);

    try {
      const result = await shareDesign(designId);
      setShareUrl(result.shareUrl);

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(result.shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to generate link';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [designId]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-zinc-900">Share Design</h3>
      <p className="text-xs text-zinc-500">
        Generate a read-only link to share this design.
      </p>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleShare}
        disabled={loading || !designId}
      >
        {loading ? 'Generating…' : copied ? 'Copied!' : 'Get share link'}
      </Button>

      {shareUrl && (
        <input
          readOnly
          value={shareUrl}
          className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700"
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
      )}

      {error && (
        <p className="text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
