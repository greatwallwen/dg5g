// Self-authored 5G / network-engineering glyphs for game elements (no external assets).
// Stroke-based, 24x24, currentColor — sit beside an item's label so chips/tokens/cards
// read as network entities, not just text. gameIcon() picks one by keyword with a
// sensible default; purely decorative (aria-hidden), so labels remain the source of truth.

type IconId = 'antenna' | 'signal' | 'chart' | 'alert' | 'gps' | 'device' | 'route' | 'doc' | 'node';

const PATHS: Record<IconId, string> = {
  antenna: 'M12 3v18 M12 8l-5 13 M12 8l5 13 M7 8h10',
  signal: 'M12 20a2 2 0 100-4 2 2 0 000 4z M8.5 13a5 5 0 017 0 M5.5 10a9 9 0 0113 0',
  chart: 'M4 20V5 M4 20h16 M8 20v-6 M13 20V9 M18 20v-9',
  alert: 'M12 3l9 16H3z M12 10v4 M12 17h.01',
  gps: 'M12 21s7-6.5 7-11a7 7 0 10-14 0c0 4.5 7 11 7 11z M12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  device: 'M4 5h16v9H4z M2 18h20 M9 18v-4 M15 18v-4',
  route: 'M6 19a2 2 0 100-4 2 2 0 000 4z M18 9a2 2 0 100-4 2 2 0 000 4z M8 17h6a3 3 0 003-3V9',
  doc: 'M7 3h7l4 4v14H7z M14 3v4h4 M9 12h6 M9 16h6',
  node: 'M12 4a8 8 0 100 16 8 8 0 000-16z M12 9v6 M9 12h6',
};

const RULES: [RegExp, IconId][] = [
  [/天线|AAU|RRU|基站|gNB|射频|RF|扇区/i, 'antenna'],
  [/信号|覆盖|RSRP|SINR|RSRQ|电平|强度|扫频/i, 'signal'],
  [/KPI|指标|性能|吞吐|速率|趋势|流量|曲线/i, 'chart'],
  [/告警|掉线|异常|问题|风险|失败|干扰|投诉/i, 'alert'],
  [/GPS|定位|坐标|经纬|位置/i, 'gps'],
  [/设备|网管|网元|核心网|AMF|SMF|UPF|BBU|服务器|机房|电脑/i, 'device'],
  [/路测|DT|CQT|路线|切换|漫游|轨迹|驾车/i, 'route'],
  [/报告|工单|台账|记录|证据|文档|清单|日志|脚本/i, 'doc'],
];

export function pickIconId(label: string): IconId {
  for (const [re, id] of RULES) if (re.test(label)) return id;
  return 'node';
}

export function GameIcon({ label, className }: { label: string; className?: string }) {
  const id = pickIconId(label);
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[id]} />
    </svg>
  );
}
