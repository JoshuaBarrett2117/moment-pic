import { createElement } from 'react';
import { act, create } from 'react-test-renderer';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

export const renderHook = async <Result>(hook: () => Result) => {
  let value: Result;
  let renders = 0;
  const Component = () => { value = hook(); renders += 1; return null; };
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(createElement(Component)); });
  return {
    get current() { return value; },
    get renders() { return renders; },
    rerender: async () => { await act(async () => { renderer.update(createElement(Component)); }); },
    unmount: async () => { await act(async () => renderer.unmount()); },
  };
};

export const deferred = <Value = unknown>() => {
  let resolve: (value: Value) => void;
  let reject: (error: Error) => void;
  const promise = new Promise<Value>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve: (value: Value) => resolve(value), reject: (error: Error) => reject(error) };
};
