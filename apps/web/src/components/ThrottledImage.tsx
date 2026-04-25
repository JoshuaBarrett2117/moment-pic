import { type ImgHTMLAttributes, useEffect, useRef, useState } from 'react';
import Img from 'react-cool-img';

type ThrottledImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string;
};

type ImageLoadTicket = {
  id: number;
  resolve: (granted: boolean) => void;
};

const MAX_ACTIVE_IMAGE_LOADS = 4;
const VIEWPORT_ROOT_MARGIN = '360px';

let activeImageLoads = 0;
let nextImageLoadTicketId = 1;
const imageLoadQueue: ImageLoadTicket[] = [];

const wakeNextImageLoad = () => {
  const next = imageLoadQueue.shift();
  if (!next) {
    return;
  }

  activeImageLoads += 1;
  next.resolve(true);
};

const releaseImageLoadSlot = () => {
  activeImageLoads = Math.max(0, activeImageLoads - 1);
  wakeNextImageLoad();
};

const requestImageLoadSlot = () => {
  if (activeImageLoads < MAX_ACTIVE_IMAGE_LOADS) {
    activeImageLoads += 1;
    return {
      ticketId: null as number | null,
      wait: Promise.resolve(true),
    };
  }

  const ticketId = nextImageLoadTicketId;
  nextImageLoadTicketId += 1;
  return {
    ticketId,
    wait: new Promise<boolean>((resolve) => {
      imageLoadQueue.push({
        id: ticketId,
        resolve,
      });
    }),
  };
};

const cancelQueuedImageLoad = (ticketId: number | null) => {
  if (ticketId === null) {
    return;
  }

  const index = imageLoadQueue.findIndex((entry) => entry.id === ticketId);
  if (index < 0) {
    return;
  }

  const [entry] = imageLoadQueue.splice(index, 1);
  entry?.resolve(false);
};

export function ThrottledImage({ src, className, onLoad, onError, ...props }: ThrottledImageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const releaseRef = useRef(false);
  const queuedTicketIdRef = useRef<number | null>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);

  useEffect(() => {
    setResolvedSrc(null);
    setIsNearViewport(false);
    releaseRef.current = false;
    queuedTicketIdRef.current = null;
  }, [src]);

  useEffect(() => {
    const target = containerRef.current;
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) {
          return;
        }

        setIsNearViewport(true);
        observer.disconnect();
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
    const { ticketId, wait } = requestImageLoadSlot();
    queuedTicketIdRef.current = ticketId;

    void wait.then((granted) => {
      queuedTicketIdRef.current = null;
      if (!granted || cancelled) {
        if (granted && !releaseRef.current) {
          releaseImageLoadSlot();
        }
        return;
      }

      releaseRef.current = true;
      setResolvedSrc(src);
    });

    return () => {
      cancelled = true;
      cancelQueuedImageLoad(queuedTicketIdRef.current);
      queuedTicketIdRef.current = null;
      if (releaseRef.current) {
        releaseRef.current = false;
        releaseImageLoadSlot();
      }
    };
  }, [isNearViewport, resolvedSrc, src]);

  const handleSettled = () => {
    if (!releaseRef.current) {
      return;
    }

    releaseRef.current = false;
    releaseImageLoadSlot();
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
          retry={{ count: 2, delay: 2, acc: '+' }}
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
