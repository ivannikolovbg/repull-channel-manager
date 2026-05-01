'use client';

import { Paperclip } from 'lucide-react';

export function AttachmentPill({
  attachment,
}: {
  attachment: { url: string; name?: string; mime?: string; sizeBytes?: number };
}) {
  const label = attachment.name ?? attachment.url.split('/').pop() ?? 'attachment';
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.06] text-white/80"
    >
      <Paperclip className="w-3 h-3" />
      <span className="max-w-[160px] truncate">{label}</span>
    </a>
  );
}
