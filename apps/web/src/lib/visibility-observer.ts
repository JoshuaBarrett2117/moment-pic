/**
 * 全局共享一个 IntersectionObserver（rootMargin 200px），代替每张卡片各建一个。
 * 同时记录最近一次滚动时间：静止时进入视口立即加载，快速滚动时才节流。
 */
type Callback = (isIntersecting: boolean) => void;

const callbacks = new Map<Element, Callback>();
let observer: IntersectionObserver | null = null;
let lastScrollAt = 0;
let scrollListening = false;

export const SCROLL_IDLE_MS = 150;

const ensureScrollListener = () => {
  if (scrollListening || typeof window === 'undefined') return;
  scrollListening = true;
  // capture：内容区是内部滚动容器，scroll 事件不冒泡
  window.addEventListener('scroll', () => { lastScrollAt = Date.now(); }, { capture: true, passive: true });
};

export const isScrollingRecently = (now = Date.now()): boolean => now - lastScrollAt < SCROLL_IDLE_MS;

/** 测试用：模拟一次滚动 */
export const markScrolled = (at = Date.now()) => { lastScrollAt = at; };

const getObserver = (): IntersectionObserver | null => {
  if (typeof IntersectionObserver === 'undefined') return null;
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) callbacks.get(entry.target)?.(entry.isIntersecting);
  }, { rootMargin: '200px' });
  return observer;
};

/** 返回取消函数；不支持 IntersectionObserver 时直接回调一次可见。 */
export const observeVisibility = (element: Element, callback: Callback): (() => void) => {
  ensureScrollListener();
  const io = getObserver();
  if (!io) {
    callback(true);
    return () => undefined;
  }
  callbacks.set(element, callback);
  io.observe(element);
  return () => {
    callbacks.delete(element);
    io.unobserve(element);
  };
};

export const observedCount = (): number => callbacks.size;
