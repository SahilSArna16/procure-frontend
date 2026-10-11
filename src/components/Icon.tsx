type Name = 'grid' | 'box' | 'upload' | 'spark' | 'arrow' | 'download' | 'check' | 'chevron' | 'file' | 'search' | 'close' | 'chart' | 'sliders' | 'plus' | 'warning'
const paths: Record<Name, string> = {
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  box: 'm12 3 9 5-9 5-9-5 9-5z M3 8v9l9 5 9-5V8 M12 13v9 M7.5 5.5l9 5',
  upload: 'M12 16V3 m-5 5 5-5 5 5 M4 14v6h16v-6',
  spark: 'm12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3z',
  arrow: 'M4 12h16 m-6-6 6 6-6 6',
  download: 'M12 3v13 m-5-5 5 5 5-5 M4 17v4h16v-4',
  check: 'm5 12 4 4L19 6',
  chevron: 'm9 5 7 7-7 7',
  file: 'M14 2H5v20h14V7l-5-5z M14 2v6h5 M8 12h8 M8 16h8',
  search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  close: 'm6 6 12 12 M6 18 18 6',
  chart: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
  sliders: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
  plus: 'M12 4v16 M4 12h16',
  warning: 'm12 3 10 18H2L12 3z M12 9v5 M12 17v1',
}
export default function Icon({ name, size = 20 }: { name: Name; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
