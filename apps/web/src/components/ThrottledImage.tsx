import { type ImgHTMLAttributes, useEffect, useRef, useState } from 'react';

type ThrottledImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string;
};

const VISIBLE_DEBOUNCE_MS = 250;
const MAX_RETRIES = 2;
const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * 进入视口并停留 250ms 后才开始加载（快速滚动时不发请求），失败最多重试 2 次（1s、2s 退避）。
 * 替代 react-cool-img，行为保持一致。
 */
export function ThrottledImage({ src, onError, ...props }: ThrottledImageProps) {
  const ref = useRef<HTMLImageElement>(null);
  const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setAttempt(0);
  }, [src]);

  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        timer = setTimeout(() => setVisible(true), VISIBLE_DEBOUNCE_MS);
      } else if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    }, { rootMargin: '200px' });
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [visible]);

  const effectiveSrc = !visible ? TRANSPARENT_PIXEL : attempt === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}retry=${attempt}`;

  return (
    <img
      {...props}
      ref={ref}
      src={effectiveSrc}
      decoding="async"
      onError={(event) => {
        if (!visible) return;
        if (attempt < MAX_RETRIES) {
          const next = attempt + 1;
          setTimeout(() => setAttempt(next), next * 1000);
          return;
        }
        onError?.(event);
      }}
    />
  );
}
