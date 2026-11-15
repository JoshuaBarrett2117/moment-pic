import net from "node:net";

/**
 * 内网 / 外网判定（按客户端 IP）。
 *
 * 内外网共用同一个域名（内网用 hosts 指向 NAS 局域网 IP），前端无法凭域名区分，
 * 因此由服务端按 `request.ip`（已按 TRUSTED_PROXIES 解析 X-Forwarded-For）判断。
 *
 * - LAN_CIDRS 未设置时默认：RFC1918（10/8、172.16/12、192.168/16）+ IPv6 ULA fc00::/7 + 链路本地（169.254/16、fe80::/10）；
 * - 回环地址（127/8、::1）永远视为外网：反代 / 内网穿透未传真实 IP 时常表现为回环，宁可误判外网也不误判内网；
 * - LAN_EXCLUDE_IPS 列出的地址（docker 网关、NAS 自身、frp 来源等）视为外网；
 * - IPv4 映射的 IPv6（::ffff:192.168.1.2）按 IPv4 处理。
 */

export type NetworkKind = "lan" | "wan";

export const DEFAULT_LAN_CIDRS: readonly string[] = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "169.254.0.0/16",
  "fc00::/7",
  "fe80::/10"
];

export class LanCidrError extends Error {}

type Family = "ipv4" | "ipv6";

/** 去掉 IPv6 zone（fe80::1%eth0）与 IPv4 映射前缀，返回规范化地址与族；非法返回 null。 */
export const normalizeIp = (raw: string | undefined | null): { address: string; family: Family } | null => {
  if (!raw) return null;
  let address = raw.trim();
  if (address.startsWith("[") && address.endsWith("]")) address = address.slice(1, -1);
  const zone = address.indexOf("%");
  if (zone >= 0) address = address.slice(0, zone);
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (mapped) address = mapped[1];
  const version = net.isIP(address);
  if (version === 4) return { address, family: "ipv4" };
  if (version === 6) return { address: address.toLowerCase(), family: "ipv6" };
  return null;
};

const parseCidr = (raw: string): { address: string; prefix: number; family: Family } => {
  const [ipPart, prefixPart, ...rest] = raw.trim().split("/");
  const ip = normalizeIp(ipPart);
  if (!ip || rest.length > 0) throw new LanCidrError(`非法 CIDR: ${raw}`);
  const max = ip.family === "ipv4" ? 32 : 128;
  // 允许写单个 IP（等价 /32 或 /128）
  const prefix = prefixPart === undefined ? max : Number(prefixPart);
  if (!/^\d+$/.test(prefixPart ?? String(max)) || !Number.isInteger(prefix) || prefix < 0 || prefix > max) {
    throw new LanCidrError(`非法 CIDR 前缀: ${raw}`);
  }
  return { ...ip, prefix };
};

const LOOPBACK = new net.BlockList();
LOOPBACK.addSubnet("127.0.0.0", 8, "ipv4");
LOOPBACK.addAddress("::1", "ipv6");
LOOPBACK.addAddress("::", "ipv6");
LOOPBACK.addAddress("0.0.0.0", "ipv4");

export type LanClassifier = {
  classify: (ip: string | undefined | null) => NetworkKind;
  cidrs: readonly string[];
  excludeIps: readonly string[];
};

/** 构造判定器；CIDR / 排除地址非法时抛 LanCidrError（启动时据此拒绝启动）。 */
export const createLanClassifier = (options: { cidrs?: readonly string[]; excludeIps?: readonly string[] } = {}): LanClassifier => {
  const cidrs = options.cidrs && options.cidrs.length > 0 ? options.cidrs : DEFAULT_LAN_CIDRS;
  const excludeIps = options.excludeIps ?? [];
  const lan = new net.BlockList();
  for (const cidr of cidrs) {
    const parsed = parseCidr(cidr);
    lan.addSubnet(parsed.address, parsed.prefix, parsed.family);
  }
  const excluded = new net.BlockList();
  for (const item of excludeIps) {
    // 排除项也允许写 CIDR，方便整段排除 docker 网段
    const parsed = parseCidr(item);
    excluded.addSubnet(parsed.address, parsed.prefix, parsed.family);
  }
  return {
    cidrs,
    excludeIps,
    classify: (raw) => {
      const ip = normalizeIp(raw);
      if (!ip) return "wan";
      if (LOOPBACK.check(ip.address, ip.family)) return "wan";
      if (excluded.check(ip.address, ip.family)) return "wan";
      return lan.check(ip.address, ip.family) ? "lan" : "wan";
    }
  };
};
