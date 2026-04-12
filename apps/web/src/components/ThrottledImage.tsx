import { type ImgHTMLAttributes, useEffect, useMemo, useRef, useState } from 'react';
import { acquireImageRequestSlot } from '../lib/image-request-gate';

type ThrottledImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string;
};

export function ThrottledImage({ src, onLoad, onError, ...props }: ThrottledImageProps) {
  const [activeSrc, setActiveSrc] = useState<string | null>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  const requestKey = useMemo(() => src, [src]);

  useEffect(() => {
    let cancelled = false;
    setActiveSrc(null);

    void acquireImageRequestSlot().then((release) => {
      if (cancelled) {
        release();
        return;
      }
      releaseRef.current = release;
      setActiveSrc(requestKey);
    });

    return () => {
      cancelled = true;
      if (releaseRef.current) {
        releaseRef.current();
        releaseRef.current = null;
      }
    };
  }, [requestKey]);

  const releaseSlot = () => {
    if (releaseRef.current) {
      releaseRef.current();
      releaseRef.current = null;
    }
  };

  return (
    <img
      {...props}
      src={activeSrc ?? undefined}
      loading="eager"
      decoding="async"
      onLoad={(event) => {
        releaseSlot();
        onLoad?.(event);
      }}
      onError={(event) => {
        releaseSlot();
        onError?.(event);
      }}
    />
  );
}

