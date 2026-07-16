export type IconName =
  | 'book'
  | 'briefcase'
  | 'map'
  | 'teacher'
  | 'target'
  | 'check'
  | 'arrow'
  | 'screen'
  | 'user'
  | 'chart'
  | 'play'
  | 'clock'
  | 'link'
  | 'lock'
  | 'radio'
  | 'file'
  | 'spark'
  | 'layers'
  | 'message'
  | 'grid'
  | 'site'
  | 'room'
  | 'aau'
  | 'bbu'
  | 'rru'
  | 'gps'
  | 'log'
  | 'complaint'
  | 'kpi'
  | 'signaling'
  | 'projector'
  | 'follow'
  | 'maximize'
  | 'minimize'
  | 'pause'
  | 'close';

export type GraphicIconName = IconName;

export function Icon({ name, size = 22, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <path d={paths[name]} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const paths: Record<IconName, string> = {
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H7a3 3 0 0 0-3 3V5.5Zm0 0V22m4-14h8m-8 4h8',
  briefcase: 'M9 6V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1m-9 0h12a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a2 2 0 0 1 2-2Zm0 5h18',
  map: 'M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Zm0 0V3m6 18V6',
  teacher: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0M20 8v5m0 0 2-2m-2 2-2-2',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-6h.01',
  check: 'M20 6 9 17l-5-5',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  screen: 'M4 5h16v11H4zM8 21h8m-4-5v5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0',
  chart: 'M4 19V5m0 14h16M8 16v-5m4 5V8m4 8v-8',
  play: 'M8 5v14l11-7z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3 2',
  link: 'M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 1 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 1 0 12 20.1l1.1-1.1',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v10H6V11Zm6 4v2',
  radio: 'M4 12a8 8 0 0 1 16 0M8 12a4 4 0 0 1 8 0m-4 4h.01M12 16v5',
  file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Zm0 0v6h6M8 13h8M8 17h6',
  spark: 'M13 2 9 10l-7 2 7 2 4 8 4-8 7-2-7-2-4-8Z',
  layers: 'm12 3 9 5-9 5-9-5 9-5Zm-7 9 7 4 7-4M5 17l7 4 7-4',
  message: 'M4 5h16v10H8l-4 4V5Z',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  site: 'M4 20h16M6 20V9l6-5 6 5v11M9 20v-6h6v6M9 10h.01M15 10h.01',
  room: 'M4 20h16M6 20V5h12v15M10 9h4M10 13h4M10 17h4',
  aau: 'M12 21v-7m0 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6-2a8 8 0 0 1 12 0M3 9a12 12 0 0 1 18 0',
  bbu: 'M5 5h14v14H5zM8 9h8M8 13h8M8 17h4',
  rru: 'M7 4h10v16H7zM10 8h4M10 12h4M10 16h4M5 8H3m18 0h-2M5 16H3m18 0h-2',
  gps: 'M12 21s7-5.2 7-11a7 7 0 0 0-14 0c0 5.8 7 11 7 11Zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  log: 'M6 4h12v16H6zM9 8h6M9 12h6M9 16h4',
  complaint: 'M4 5h16v11H8l-4 4V5Zm8 3v4m0 3h.01',
  kpi: 'M4 19V5m0 14h16M8 16l3-4 3 2 4-7',
  signaling: 'M4 8h4m8 0h4M8 8l4 4 4-4M12 12v7M6 19h12',
  projector: 'M4 5h16v10H4zM8 21h8m-4-6v6m7-13 3-2M19 12l3 2',
  follow: 'M5 4h14v10H5zM8 20h8m-4-6v6M7 8h6m3 0h1M7 11h4m5 0h1',
  maximize: 'M8 3H3v5M16 3h5v5M8 21H3v-5m18 0v5h-5',
  minimize: 'M8 3v5H3m18 0h-5V3M8 21v-5H3m18 0h-5v5',
  pause: 'M8 5v14M16 5v14',
  close: 'm6 6 12 12M18 6 6 18',
};
