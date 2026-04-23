// Minimal lucide-style icon set, stroke 1.5
const iconPaths = {
  'menu': 'M3 6h18M3 12h18M3 18h18',
  'x': 'M18 6 6 18M6 6l12 12',
  'arrow-right': 'M5 12h14M13 5l7 7-7 7',
  'arrow-left': 'M19 12H5M11 5l-7 7 7 7',
  'chevron-right': 'm9 6 6 6-6 6',
  'chevron-left': 'm15 6-6 6 6 6',
  'chevron-down': 'm6 9 6 6 6-6',
  'plus': 'M12 5v14M5 12h14',
  'play': 'm6 4 14 8-14 8V4z',
  'star': 'm12 3 2.9 6 6.6.9-4.8 4.6 1.1 6.6L12 18l-5.9 3.1 1.1-6.6L2.4 9.9 9 9l3-6z',
  'send': 'm22 2-11 19-2.5-9L0 9l22-7z',
  'users': 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  'layout-grid': 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
  'messages-square': 'M14 9a2 2 0 0 1-2 2H6l-4 4V4c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2v5zM18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1',
  'coffee': 'M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8zM6 2v3M10 2v3M14 2v3',
  'package': 'M16.5 9.4 7.55 4.24M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.3 7 12 12l8.7-5M12 22V12',
  'shield-check': 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  'alert-triangle': 'M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  'gauge': 'M12 14l4-4M3.34 19a10 10 0 1 1 17.32 0',
  'presentation': 'M2 3h20M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3M8 21h8M12 16v5',
  'phone': 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z',
  'stairs': 'M4 20h4v-4h4v-4h4V8h4V4',
  'armchair': 'M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3M3 11v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H7v-2a2 2 0 0 0-4 0zM5 18v2M19 18v2',
  'heart': 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
  'leaf': 'M11 20A7 7 0 0 1 4 13c0-4 3-8 10-11 0 8-3 11-7 11zM4 13s0 7 7 7',
  'archive': 'M21 8v13H3V8M1 3h22v5H1zM10 12h4',
  'sun': 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z',
  'mic': 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8',
  'more-horizontal': 'M5 12h.01M12 12h.01M19 12h.01',
  'git-branch': 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM15 6a9 9 0 0 0-9 9',
  'download': 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  'upload': 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  'corner-down-right': 'M15 10l5 5-5 5M4 4v7a4 4 0 0 0 4 4h12',
  'sparkles': 'M12 3l1.9 4.8L19 10l-5.1 2.2L12 17l-1.9-4.8L5 10l5.1-2.2L12 3zM19 4v3M21 5.5h-4M5 18v3M6.5 19.5h-3',
  'edit-3': 'M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z',
  'search': 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  'file-text': 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  'layers': 'm12 2 10 5-10 5L2 7l10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  'maximize': 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  'compass': 'M12 22A10 10 0 1 0 12 2a10 10 0 0 0 0 20zM16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z',
  'feather': 'M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5l6.74-6.76zM16 8 2 22M17.5 15H9',
  'building-2': 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18zM6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4',
};

function Icon({ name, size = 16, stroke = 1.5, className = '', style = {} }) {
  const d = iconPaths[name] || iconPaths['x'];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style}>
      {d.split('M').filter(Boolean).map((seg, i) => <path key={i} d={'M' + seg} />)}
    </svg>
  );
}

// Typewriter reveal — 20-30ms/char
function Typewriter({ text, speed = 24, onDone, className = '', style = {} }) {
  const [out, setOut] = React.useState('');
  React.useEffect(() => {
    setOut('');
    let i = 0;
    const t = setInterval(() => {
      i++;
      setOut(text.slice(0, i));
      if (i >= text.length) { clearInterval(t); onDone && onDone(); }
    }, speed);
    return () => clearInterval(t);
  }, [text]);
  const done = out.length >= text.length;
  return <span className={className + (done ? '' : ' caret')} style={style}>{out}</span>;
}

// Dot status — 3 dots pulse
function DotPulse({ color = 'var(--forest)' }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      {[0,1,2].map(i => (
        <span key={i} style={{
          width: 4, height: 4, borderRadius: 4, background: color,
          animation: `dot-pulse 1.1s var(--ease) ${i * 0.15}s infinite`
        }}/>
      ))}
    </span>
  );
}

// Eyebrow
function Eyebrow({ children, style = {} }) {
  return <div className="eyebrow" style={style}>{children}</div>;
}

// Metric badge
function MetricBadge({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="mono" style={{ color: 'var(--mist-500)' }}>{label.toUpperCase()}</span>
      <span style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 400 }}>{value}</span>
    </div>
  );
}

// Pill toggle
function PillToggle({ options, value, onChange, size = 'md' }) {
  const pad = size === 'sm' ? '4px 10px' : '6px 14px';
  const fs = size === 'sm' ? 11 : 12;
  return (
    <div style={{
      display: 'inline-flex', padding: 3, background: 'var(--mist-100)',
      borderRadius: 999, gap: 2
    }}>
      {options.map(opt => (
        <button key={opt.value} onClick={() => onChange(opt.value)}
          style={{
            padding: pad, fontSize: fs, fontWeight: 500,
            borderRadius: 999,
            background: value === opt.value ? 'var(--forest)' : 'transparent',
            color: value === opt.value ? 'var(--canvas)' : 'var(--ink)',
            transition: 'all 200ms var(--ease)',
            letterSpacing: '0.02em'
          }}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// Drawer (right, 460px)
function Drawer({ open, onClose, children, width = 460 }) {
  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(250, 247, 242, 0.55)',
        backdropFilter: 'blur(6px)',
        opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity 240ms var(--ease)', zIndex: 80
      }}/>
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width, background: 'var(--canvas)',
        borderLeft: '1px solid var(--mist-200)',
        boxShadow: '-24px 0 48px rgba(28, 31, 26, 0.08)',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 360ms var(--ease)', zIndex: 90,
        display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>
        {children}
      </div>
    </>
  );
}

// Agent trace — editorial style
function AgentTrace({ agents, running = true }) {
  // agents: [{roman, name, status}]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {agents.map((a, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: '40px 200px 1fr',
          alignItems: 'center', gap: 16,
          padding: '10px 0',
          borderBottom: i === agents.length - 1 ? 'none' : '1px solid var(--mist-100)'
        }}>
          <span style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 18, color: 'var(--mist-500)' }}>{a.roman}.</span>
          <span style={{ fontWeight: 500 }}>{a.name}</span>
          <span style={{
            fontFamily: 'var(--f-mono)', fontSize: 12,
            color: a.status === 'done' ? 'var(--mint)' : a.status === 'active' ? 'var(--forest)' : 'var(--mist-400)'
          }}>
            {a.status === 'active' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <DotPulse /> <Typewriter text={a.message} speed={22} />
            </span>}
            {a.status === 'done' && <span>✓ {a.message}</span>}
            {a.status === 'pending' && <span style={{ opacity: 0.5 }}>pending</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

// Roman numeral
const ROMANS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
function roman(n) { return ROMANS[n] || n; }

// Placeholder image with mono tag
function Placeholder({ tag, tint, ratio = '4/3', style = {} }) {
  return (
    <div className="placeholder-img" style={{
      aspectRatio: ratio,
      background: tint
        ? `linear-gradient(135deg, ${tint}22 0%, ${tint}44 100%), repeating-linear-gradient(135deg, rgba(28,31,26,0.04) 0 10px, transparent 10px 20px)`
        : undefined,
      ...style
    }}>
      <span style={{ padding: 12, maxWidth: '80%' }}>{tag}</span>
    </div>
  );
}

// Zone color mapping
const ZONE_COLORS = {
  work: { fill: 'rgba(47, 74, 63, 0.16)', stroke: '#2F4A3F' },
  collab: { fill: 'rgba(201, 183, 156, 0.32)', stroke: '#A89775' },
  support: { fill: 'rgba(160, 82, 45, 0.18)', stroke: '#A0522D' },
  hospitality: { fill: 'rgba(232, 197, 71, 0.25)', stroke: '#C9A825' },
  biophilic: { fill: 'rgba(107, 143, 127, 0.28)', stroke: '#6B8F7F' }
};

function FloorPlan({ zones, numbered = false, size = { w: 480, h: 320 }, onZoneClick }) {
  const { w, h } = size;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block', background: 'var(--canvas-2)', borderRadius: 8 }}>
      {/* outer walls */}
      <rect x="8" y="8" width={w - 16} height={h - 16} fill="none" stroke="var(--ink)" strokeWidth="1.5" />
      {/* inner grid tick */}
      <g opacity="0.12" stroke="var(--ink)" strokeWidth="0.5">
        {Array.from({ length: 12 }).map((_, i) => (
          <line key={'v' + i} x1={8 + (w-16)/12 * i} y1="8" x2={8 + (w-16)/12 * i} y2={h-8} />
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <line key={'h' + i} x1="8" y1={8 + (h-16)/8 * i} x2={w-8} y2={8 + (h-16)/8 * i} />
        ))}
      </g>
      {zones.map((z, i) => {
        const col = ZONE_COLORS[z.kind] || ZONE_COLORS.work;
        const x = 8 + (w - 16) * (z.x / 88);
        const y = 8 + (h - 16) * (z.y / 62);
        const zw = (w - 16) * (z.w / 88);
        const zh = (h - 16) * (z.h / 62);
        return (
          <g key={i} style={{ cursor: onZoneClick ? 'pointer' : 'default' }}
             onClick={() => onZoneClick && onZoneClick(z, i)}>
            <rect x={x} y={y} width={zw} height={zh}
              fill={col.fill} stroke={col.stroke} strokeWidth="1" rx="2" />
            {numbered ? (
              <g>
                <circle cx={x + zw/2} cy={y + zh/2} r="12" fill="var(--canvas)" stroke={col.stroke} strokeWidth="1" />
                <text x={x + zw/2} y={y + zh/2 + 4} textAnchor="middle"
                  fontFamily="var(--f-mono)" fontSize="11" fill="var(--ink)" fontWeight="500">{i + 1}</text>
              </g>
            ) : (
              <text x={x + 6} y={y + 14} fontFamily="var(--f-mono)" fontSize="8" fill={col.stroke} style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {z.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

Object.assign(window, {
  Icon, Typewriter, DotPulse, Eyebrow, MetricBadge,
  PillToggle, Drawer, AgentTrace, roman, Placeholder, FloorPlan, ZONE_COLORS
});
