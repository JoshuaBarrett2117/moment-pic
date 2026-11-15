import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_LAN_CIDRS, LanCidrError, createLanClassifier, normalizeIp } from "./lan-network.js";
import { EnvConfigError, buildLanClassifier } from "../config/env.js";

test("默认内网段：RFC1918 / ULA / 链路本地为内网，公网为外网", () => {
  const { classify, cidrs } = createLanClassifier();
  assert.deepEqual(cidrs, DEFAULT_LAN_CIDRS);
  for (const ip of ["10.1.2.3", "172.16.0.1", "172.31.255.254", "192.168.31.117", "169.254.1.1", "fd12:3456::1", "fe80::1", "fe80::1%eth0"]) {
    assert.equal(classify(ip), "lan", ip);
  }
  for (const ip of ["8.8.8.8", "172.32.0.1", "172.15.255.255", "112.74.102.126", "2409:8c34:2220:30b:2::10e5", "240d:c010:c8:f::3e"]) {
    assert.equal(classify(ip), "wan", ip);
  }
});

test("回环永远是外网（即使 LAN_CIDRS 写了 127/8 或 ::1）；非法 / 空地址按外网", () => {
  const { classify } = createLanClassifier({ cidrs: ["127.0.0.0/8", "::1/128", "0.0.0.0/0"] });
  for (const ip of ["127.0.0.1", "127.8.8.8", "::1", "::ffff:127.0.0.1", "", undefined, null, "not-an-ip", "0.0.0.0", "::"]) {
    assert.equal(classify(ip), "wan", String(ip));
  }
  assert.equal(classify("1.2.3.4"), "lan");
});

test("IPv4 映射的 IPv6（::ffff:a.b.c.d）按 IPv4 判断", () => {
  const { classify } = createLanClassifier({ cidrs: ["192.168.31.0/24"] });
  assert.equal(classify("::ffff:192.168.31.117"), "lan");
  assert.equal(classify("::FFFF:192.168.31.5"), "lan");
  assert.equal(classify("::ffff:192.168.32.5"), "wan");
  assert.deepEqual(normalizeIp("::ffff:10.0.0.1"), { address: "10.0.0.1", family: "ipv4" });
  assert.deepEqual(normalizeIp("[FE80::1%en0]"), { address: "fe80::1", family: "ipv6" });
});

test("自定义 LAN_CIDRS 只认指定网段；LAN_EXCLUDE_IPS 支持单个 IP 与 CIDR", () => {
  const { classify } = createLanClassifier({ cidrs: ["192.168.31.0/24"], excludeIps: ["192.168.31.12", "192.168.31.200/30"] });
  assert.equal(classify("192.168.31.117"), "lan");
  assert.equal(classify("192.168.31.12"), "wan");
  assert.equal(classify("::ffff:192.168.31.12"), "wan");
  assert.equal(classify("192.168.31.201"), "wan");
  assert.equal(classify("192.168.31.204"), "lan");
  // docker 网桥地址不在自定义网段内
  assert.equal(classify("172.17.0.13"), "wan");
  assert.equal(classify("192.168.224.1"), "wan");
});

test("默认网段 + 排除 docker 网关", () => {
  const { classify } = createLanClassifier({ excludeIps: ["172.17.0.1", "192.168.224.0/20"] });
  assert.equal(classify("172.17.0.1"), "wan");
  assert.equal(classify("192.168.224.1"), "wan");
  assert.equal(classify("172.17.0.2"), "lan");
});

test("非法 CIDR 拒绝：库抛 LanCidrError，环境变量解析转成 EnvConfigError", () => {
  for (const bad of ["192.168.1.0/33", "10.0.0.0/x", "abc", "fc00::/129", "1.2.3.4/8/1", "10.0.0.0/"]) {
    assert.throws(() => createLanClassifier({ cidrs: [bad] }), LanCidrError, bad);
  }
  assert.throws(() => createLanClassifier({ excludeIps: ["nope"] }), LanCidrError);
  assert.throws(() => buildLanClassifier("10.0.0.0/8,bad", undefined), EnvConfigError);
  const parsed = buildLanClassifier("192.168.31.0/24; 10.8.0.0/16\nfd00::/8", " 192.168.31.12 , ");
  assert.deepEqual(parsed.cidrs, ["192.168.31.0/24", "10.8.0.0/16", "fd00::/8"]);
  assert.deepEqual(parsed.excludeIps, ["192.168.31.12"]);
  assert.deepEqual(buildLanClassifier("", "").cidrs, DEFAULT_LAN_CIDRS);
});
