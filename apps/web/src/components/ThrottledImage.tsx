import { type ImgHTMLAttributes, useEffect, useRef, useState } from 'react';
import Img from 'react-cool-img';

type ThrottledImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string;
};

const MAX_ACTIVE_IMAGE_LOADS = 8;
const VIEWPORT_ROOT_MARGIN = '360px';

let activeImageLoads = 0;
const imageLoadQueue: Array<() => void> = [];

const wakeNextImageLoad = () => {
  const next = imageLoadQueue.shift();
  if (!next) {
    return;
  }

  activeImageLoads += 1;
  next();
};

const acquireImageLoadSlot = async (): Promise<() => void> => {
  if (activeImageLoads < MAX_ACTIVE_IMAGE_LOADS) {
    activeImageLoads += 1;
  } else {
    await new Promise<void>((resolve) => {
      imageLoadQueue.push(resolve);
    });
  }

  let released = false;
  return () => {
    if (released) {
      return;
    }

    released = true;
    activeImageLoads = Math.max(0, activeImageLoads - 1);
    wakeNextImageLoad();
  };
};

export function ThrottledImage({ src, className, onLoad, onError, ...props }: ThrottledImageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);

  useEffect(() => {
    setResolvedSrc(null);
    setIsNearViewport(false);
  }, [src]);

  useEffect(() => {
    const target = containerRef.current;
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsNearViewport(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: VIEWPORT_ROOT_MARGIN,
        threshold: 0.01,
      }
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [src]);

  useEffect(() => {
    if (!isNearViewport || resolvedSrc || !src) {
      return;
    }

    let cancelled = false;

    void acquireImageLoadSlot().then((release) => {
      if (cancelled) {
        release();
        return;
      }

      releaseRef.current = release;
      setResolvedSrc(src);
    });

    return () => {
      cancelled = true;
      if (releaseRef.current) {
        releaseRef.current();
        releaseRef.current = null;
      }
    };
  }, [isNearViewport, resolvedSrc, src]);

  const handleSettled = () => {
    if (releaseRef.current) {
      releaseRef.current();
      releaseRef.current = null;
    }
  };

  return (
    <div ref={containerRef} className={className}>
      {resolvedSrc ? (
        <Img
          {...props}
          src={resolvedSrc}
          className={className}
          lazy
          cache
          decode
          debounce={400}
          retry={{ count: 3, delay: 2, acc: '+' }}
          onLoad={(event) => {
            handleSettled();
            onLoad?.(event);
          }}
          onError={(event) => {
            handleSettled();
            onError?.(event);
          }}
        />
      ) : null}
    </div>
  );
}
