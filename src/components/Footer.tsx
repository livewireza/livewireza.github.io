import { config } from '../lib/config';
import { formatDateTime, timeAgo, useNow } from '../lib/format';

interface FooterProps {
  generatedAt: string;
  seed?: boolean;
}

export function Footer({ generatedAt, seed }: FooterProps) {
  const now = useNow();
  return (
    <div id="footer">
      {seed ? (
        <>
          Snapshot of wihome.net from {formatDateTime(generatedAt)} · live updates start with the first GitHub Actions
          run
        </>
      ) : (
        <>
          Updated {formatDateTime(generatedAt)} ({timeAgo(generatedAt, now)}) · refreshed {config.updateInterval} by
          GitHub Actions
        </>
      )}
    </div>
  );
}
