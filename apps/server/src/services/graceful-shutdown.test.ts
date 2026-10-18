import assert from "node:assert/strict";
import test from "node:test";
import { installGracefulShutdown } from "./graceful-shutdown.js";

test("SIGTERM/SIGINT 重复信号只退出一次，先等待监听关闭再 app.close，退出码 0", async () => {
  const calls: string[] = []; const exits: number[] = [];
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const dispose = installGracefulShutdown({ stopWatching: async () => { calls.push("stop"); await waiting; }, close: async () => { calls.push("close"); }, exit: (code) => { exits.push(code); } });
  try {
    process.emit("SIGTERM"); process.emit("SIGINT");
    assert.deepEqual(calls, ["stop"]); assert.deepEqual(exits, []);
    release(); await waiting; await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, ["stop", "close"]); assert.deepEqual(exits, [0]);
  } finally { dispose(); }
});

test("优雅退出真实 10 秒期限到期强制退出，解除处理器不留下定时器", (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const exits: number[] = [];
  const dispose = installGracefulShutdown({ stopWatching: () => new Promise<void>(() => {}), close: async () => {}, exit: (code) => { exits.push(code); } });
  try {
    process.emit("SIGTERM"); context.mock.timers.tick(9999); assert.deepEqual(exits, []);
    context.mock.timers.tick(1); assert.deepEqual(exits, [1]);
  } finally { dispose(); }
});
