import { type ImgHTMLAttributes, useEffect, useRef, useState } from 'react';
import { isScrollingRecently, observeVisibility } from '../lib/visibility-observer';

type ThrottledImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string;
};

const VISIBLE_DEBOUNCE_MS = 250;
const MAX_RETRIES = 2;
const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * 进入视口即加载；只有在快速滚动中进入视口时才等 250ms（滚过去就不发请求）。
 * 所有图片共享一个 IntersectionObserver。失败最多重试 2 次（1s、2s 退避）。
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };
    const stop = observeVisibility(node, (isIntersecting) => {
      clear();
      if (!isIntersecting) return;
      if (!isScrollingRecently()) {
        setVisible(true);
        return;
      }
      timer = setTimeout(() => setVisible(true), VISIBLE_DEBOUNCE_MS);
    });
    return () => {
      stop();
      clear();
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
