'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { Button, Input } from '@tamiym/ui';
import { shareDesign } from '@/lib/designs';
import { useState } from 'react';

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

  const handleShare = useCallback(async () => {
    if (!designId) return;
    setLoading(true);

    try {
      const result = await shareDesign(designId);
      setShareUrl(result.shareUrl);

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(result.shareUrl);
        toast.success('Link copied to clipboard');
      } else {
        toast.info('Link generated — copy it below');
      }
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to generate link';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [designId]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-zinc-900">Share Design</h3>
      <p className="text-xs text-zinc-500">Generate a read-only link to share this design.</p>

      <Button variant="ghost" size="sm" onClick={handleShare} disabled={loading || !designId}>
        {loading ? 'Generating…' : 'Get share link'}
      </Button>

      {shareUrl && (
        <Input
          readOnly
          value={shareUrl}
          className="bg-zinc-50 text-xs text-zinc-700"
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
      )}
    </div>
  );
}
