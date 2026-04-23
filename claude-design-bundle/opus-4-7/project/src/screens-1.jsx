// Screens 1-5: Landing, Dashboard, Brief, Macro, Micro

const L = window.LUMEN;

// ───── 1. LANDING ─────────────────────────────────────────────
function LandingScreen({ go }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--canvas)' }}>
      {/* Top nav */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 20,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '22px 64px',
        background: 'rgba(250, 247, 242, 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--mist-100)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 10, height: 10, background: 'var(--forest)', borderRadius: 2, transform: 'rotate(45deg)' }}/>
          <span style={{ fontFamily: 'var(--f-display)', fontSize: 20, fontWeight: 500, letterSpacing: '-0.01em' }}>Design Office</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <a className="mono" style={{ color: 'var(--ink)', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 11 }}>Surfaces</a>
          <a className="mono" style={{ color: 'var(--ink)', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 11 }}>Method</a>
          <a className="mono" style={{ color: 'var(--ink)', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 11 }}>Journal</a>
          <button onClick={() => go('dashboard')} className="btn btn-primary btn-sm">Sign in</button>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        minHeight: 'calc(100vh - 74px)', padding: '80px 64px 60px',
        display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 72, alignItems: 'center'
      }}>
        <div className="fade-rise">
          <Eyebrow style={{ marginBottom: 28 }}>AI CO-ARCHITECT FOR INTERIOR DESIGNERS</Eyebrow>
          <h1 className="display" style={{ fontSize: 'clamp(52px, 9vw, 112px)', fontStyle: 'italic', margin: 0, marginBottom: 18 }}>
            Design<br/>Office.
          </h1>
          <p className="serif" style={{
            fontSize: 'clamp(22px, 2.5vw, 34px)', color: 'var(--mist-600)',
            lineHeight: 1.3, margin: 0, marginBottom: 44, maxWidth: 640
          }}>
            Augment your test-fit, mood board, <br/>and client presentation.
          </p>
          <div style={{ display: 'flex', gap: 14, marginBottom: 64 }}>
            <button onClick={() => go('brief')} className="btn btn-primary" style={{ padding: '16px 28px', fontSize: 15 }}>
              Start a project <Icon name="arrow-right" size={14}/>
            </button>
            <button className="btn btn-ghost" style={{ padding: '16px 28px', fontSize: 15 }}>
              <Icon name="play" size={12}/> Watch the demo
            </button>
          </div>
          <div className="mono" style={{ color: 'var(--mist-500)' }}>
            <span style={{ color: 'var(--forest)' }}>●</span> 2026 · Opus 4.7 · Paris
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <Placeholder tag="ARCHITECTURAL CORRIDOR · SUNLIT · 4:5" ratio="4/5"
            tint="#3C5D50" style={{ boxShadow: 'var(--sh-hero)' }} />
          <div style={{
            position: 'absolute', bottom: -18, left: -18,
            background: 'var(--canvas)', padding: '14px 18px',
            border: '1px solid var(--mist-200)', borderRadius: 8,
            display: 'flex', flexDirection: 'column', gap: 2,
            boxShadow: 'var(--sh-soft)'
          }}>
            <span className="mono" style={{ color: 'var(--mist-500)' }}>LUMEN · PARIS 9E</span>
            <span style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic' }}>2400 m² · 170 FTE</span>
          </div>
        </div>
      </section>

      {/* Metric strip */}
      <section style={{
        borderTop: '1px solid var(--mist-200)', borderBottom: '1px solid var(--mist-200)',
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)'
      }}>
        {[
          ['10×', 'faster test-fit'],
          ['3', 'industries proven'],
          ['6', 'editorial surfaces'],
          ['0', 'engineering rewrite']
        ].map(([num, label], i) => (
          <div key={i} style={{
            padding: '44px 32px',
            borderRight: i < 3 ? '1px solid var(--mist-200)' : 'none',
            display: 'flex', flexDirection: 'column', gap: 8
          }}>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 56, fontWeight: 300, letterSpacing: '-0.03em' }}>{num}</div>
            <div className="mono" style={{ color: 'var(--mist-500)' }}>{label.toUpperCase()}</div>
          </div>
        ))}
      </section>

      {/* Surfaces I-VI asymmetric */}
      <section style={{ padding: '120px 64px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 80, marginBottom: 72 }}>
          <div>
            <Eyebrow style={{ marginBottom: 18 }}>SURFACES · I — VI</Eyebrow>
            <h2 className="display" style={{ fontSize: 44, margin: 0 }}>
              Six editorial surfaces, one continuous handoff.
            </h2>
          </div>
          <p className="serif" style={{ fontSize: 22, color: 'var(--mist-600)', lineHeight: 1.45, paddingTop: 20 }}>
            Each surface is a chapter — briefed, visualized, sourced. The tool moves at the speed of your taste,
            not the speed of a form.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', rowGap: 56, columnGap: 32 }}>
          {[
            { r: 'I', t: 'Brief', d: 'Natural-language ingestion, Leesman-calibrated programme.', span: 5, offset: 0 },
            { r: 'II', t: 'Test fit', d: 'Three concepts, macro and micro zoning in 2D and 3D.', span: 5, offset: 2 },
            { r: 'III', t: 'Mood board', d: 'Editorial collage of materials, furniture, light.', span: 4, offset: 1 },
            { r: 'IV', t: 'Justify', d: 'Sourced argumentaire, toggled Engineering ↔ Client.', span: 5, offset: 2 },
            { r: 'V', t: 'Export', d: 'DXF and DWG, five named layers, zero rewrite.', span: 4, offset: 0 },
            { r: 'VI', t: 'Chat', d: 'A co-architect in the corner of every page.', span: 4, offset: 4 }
          ].map((s, i) => (
            <div key={i} style={{ gridColumn: `${s.offset + 1} / span ${s.span}` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, marginBottom: 14 }}>
                <span style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 28, color: 'var(--sand)' }}>{s.r}.</span>
                <span style={{ fontFamily: 'var(--f-display)', fontSize: 32, fontWeight: 400, letterSpacing: '-0.01em' }}>{s.t}</span>
              </div>
              <p style={{ color: 'var(--mist-600)', margin: 0, maxWidth: 380 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pull quote */}
      <section style={{ padding: '80px 64px', background: 'var(--canvas-2)', borderTop: '1px solid var(--mist-200)', borderBottom: '1px solid var(--mist-200)' }}>
        <blockquote style={{
          fontFamily: 'var(--f-display)', fontStyle: 'italic', fontWeight: 300,
          fontSize: 'clamp(32px, 4.2vw, 60px)', lineHeight: 1.15, letterSpacing: '-0.02em',
          margin: 0, maxWidth: 1200
        }}>
          "From brief to client deck, <br/>in one continuous editorial."
        </blockquote>
        <div className="mono" style={{ marginTop: 32, color: 'var(--mist-500)' }}>
          — DESIGN OFFICE · MANIFESTO
        </div>
      </section>

      {/* Sources marquee */}
      <section style={{ padding: '60px 0', overflow: 'hidden' }}>
        <div className="mono" style={{ color: 'var(--mist-500)', padding: '0 64px', marginBottom: 24 }}>SOURCES · WORKPLACE RESEARCH & MANUFACTURERS</div>
        <div style={{ display: 'flex', gap: 72, padding: '0 64px', fontFamily: 'var(--f-display)', fontSize: 32, fontStyle: 'italic', color: 'var(--mist-400)', flexWrap: 'wrap' }}>
          {['Leesman', 'Gensler', 'Steelcase', 'Herman Miller', 'Vitra', 'Framery', 'Kvadrat'].map(s =>
            <span key={s}>{s}</span>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '48px 64px', borderTop: '1px solid var(--mist-200)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, background: 'var(--forest)', borderRadius: 2, transform: 'rotate(45deg)' }}/>
          <span className="mono" style={{ color: 'var(--mist-500)' }}>© 2026 DESIGN OFFICE · PARIS</span>
        </div>
        <div className="mono" style={{ color: 'var(--mist-500)', display: 'flex', gap: 24 }}>
          <span>GITHUB</span><span>JOURNAL</span><span>BUILT WITH OPUS 4.7</span>
        </div>
      </footer>
    </div>
  );
}

// ───── 2. DASHBOARD — projects-first ───────────────────────
const SURFACES = [
  { key: 'brief',     roman: 'I',   label: 'Brief',      icon: 'file-text',      route: 'brief' },
  { key: 'testfit',   roman: 'II',  label: 'Test fit',   icon: 'layout-grid',    route: 'testfit' },
  { key: 'moodboard', roman: 'III', label: 'Mood board', icon: 'feather',        route: 'moodboard' },
  { key: 'justify',   roman: 'IV',  label: 'Justify',    icon: 'messages-square',route: 'justify' },
  { key: 'export',    roman: 'V',   label: 'Export',     icon: 'download',       route: 'export' }
];

const STATE_COLOR = {
  done:    { dot: 'var(--mint)',    label: 'Complete' },
  active:  { dot: 'var(--forest)',  label: 'In progress' },
  draft:   { dot: 'var(--sun)',     label: 'Draft' },
  pending: { dot: 'var(--mist-300)',label: 'Not started' }
};

function DashboardScreen({ go, view, setView }) {
  const [openId, setOpenId] = React.useState(null);
  const [q, setQ] = React.useState('');
  const [filter, setFilter] = React.useState('all');

  const projects = window.PROJECTS.filter(p => {
    const qMatch = !q || (p.name + ' ' + p.industry + ' ' + p.client).toLowerCase().includes(q.toLowerCase());
    const fMatch = filter === 'all' || p.stage.toLowerCase() === filter;
    return qMatch && fMatch;
  });

  const open = openId && window.PROJECTS.find(p => p.id === openId);

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: '40px 48px 80px' }}>
      {open ? (
        <ProjectDetail project={open} onBack={() => setOpenId(null)} go={go} view={view} setView={setView} />
      ) : (
        <ProjectsList
          projects={projects}
          q={q} setQ={setQ}
          filter={filter} setFilter={setFilter}
          onOpen={setOpenId}
        />
      )}
    </div>
  );
}

function ProjectsList({ projects, q, setQ, filter, setFilter, onOpen }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
        <div>
          <Eyebrow style={{ marginBottom: 10 }}>DASHBOARD · PROJECTS</Eyebrow>
          <h1 className="display" style={{ fontSize: 64, margin: 0, fontStyle: 'italic', letterSpacing: '-0.02em' }}>
            Your studio, at a glance.
          </h1>
          <p className="serif" style={{ fontSize: 20, color: 'var(--mist-600)', marginTop: 10, maxWidth: 620 }}>
            {projects.length} active {projects.length === 1 ? 'project' : 'projects'} — from first brief to engineering handoff.
          </p>
        </div>
        <button className="btn btn-primary"><Icon name="plus" size={14}/> New project</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28, padding: '12px 18px', background: 'var(--canvas-2)', border: '1px solid var(--mist-200)', borderRadius: 10 }}>
        <Icon name="search" size={14} style={{ color: 'var(--mist-500)' }}/>
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search projects, clients, industries…"
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14 }}/>
        <div style={{ width: 1, height: 20, background: 'var(--mist-200)' }}/>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'Brief', 'Test fit', 'Justify', 'Export'].map(f => (
            <button key={f} onClick={() => setFilter(f === 'all' ? 'all' : f.toLowerCase())}
              className={'pill' + (filter === (f === 'all' ? 'all' : f.toLowerCase()) ? ' pill-active' : ' pill-ghost')}
              style={{ padding: '5px 11px', fontSize: 11 }}>{f === 'all' ? 'All stages' : f}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 20 }}>
        {projects.map(p => <ProjectCard key={p.id} project={p} onOpen={() => onOpen(p.id)} />)}
      </div>
    </>
  );
}

function ProjectCard({ project, onOpen }) {
  const complete = Object.values(project.surfaces).filter(s => s.state === 'done').length;
  const total = SURFACES.length;
  return (
    <div onClick={onOpen} className="card" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }}>
      <div style={{
        height: 132,
        background: `linear-gradient(135deg, ${project.tint}22 0%, ${project.tint}44 100%), repeating-linear-gradient(135deg, rgba(28,31,26,0.04) 0 10px, transparent 10px 20px)`,
        display: 'flex', alignItems: 'flex-end', padding: 18,
        position: 'relative'
      }}>
        <div style={{ position: 'absolute', top: 14, left: 14 }} className="mono">
          <span style={{ color: project.tint, fontWeight: 600, letterSpacing: '0.1em' }}>{project.ref}</span>
        </div>
        <div style={{ position: 'absolute', top: 14, right: 14 }}>
          <span className="pill" style={{ background: 'rgba(255,253,249,0.9)', fontSize: 10, padding: '4px 10px' }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: project.tint }}/>
            {project.stage}
          </span>
        </div>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <h3 style={{ fontFamily: 'var(--f-display)', fontSize: 26, fontWeight: 400, margin: 0, letterSpacing: '-0.01em' }}>
            {project.name}
          </h3>
          <span className="mono" style={{ color: 'var(--mist-500)', fontSize: 10 }}>{complete}/{total}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--mist-600)', marginBottom: 14 }}>
          <span style={{ fontStyle: 'italic' }}>{project.industry}</span>
          <span style={{ color: 'var(--mist-400)' }}> · </span>
          {project.headcount} → {project.headcountTarget} staff
          <span style={{ color: 'var(--mist-400)' }}> · </span>
          {project.surface} m²
        </div>

        {/* Progress bar */}
        <div style={{ height: 4, background: 'var(--mist-100)', borderRadius: 2, overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ height: '100%', width: `${project.progress}%`, background: project.tint, borderRadius: 2, transition: 'width 300ms var(--ease)' }}/>
        </div>

        {/* Surfaces strip */}
        <div style={{ display: 'flex', gap: 4 }}>
          {SURFACES.map(s => {
            const st = project.surfaces[s.key];
            const c = STATE_COLOR[st.state];
            return (
              <div key={s.key} title={`${s.label} · ${c.label}`} style={{
                flex: 1, padding: '8px 6px', borderRadius: 4,
                background: st.state === 'pending' ? 'var(--mist-50)' : 'var(--canvas-2)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                opacity: st.state === 'pending' ? 0.55 : 1
              }}>
                <span className="mono" style={{ color: 'var(--mist-500)', fontSize: 9 }}>{s.roman}</span>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: c.dot }}/>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--mist-100)' }}>
          <span className="mono" style={{ color: 'var(--mist-500)' }}>UPDATED · {project.updatedAt.toUpperCase()}</span>
          <span style={{ color: 'var(--forest)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            Open <Icon name="arrow-right" size={12}/>
          </span>
        </div>
      </div>
    </div>
  );
}

function ProjectDetail({ project, onBack, go, view, setView }) {
  const activeSurfaces = Object.entries(project.surfaces).filter(([,s]) => s.state !== 'pending').length;
  return (
    <>
      <button onClick={onBack} style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        color: 'var(--mist-600)', fontSize: 13, marginBottom: 22
      }}>
        <Icon name="arrow-left" size={14}/> All projects
      </button>

      <div style={{
        padding: '28px 32px', borderRadius: 14,
        background: `linear-gradient(135deg, ${project.tint}18 0%, ${project.tint}08 100%)`,
        border: '1px solid var(--mist-200)',
        marginBottom: 40, position: 'relative', overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 40 }}>
          <div style={{ flex: 1 }}>
            <Eyebrow style={{ marginBottom: 8 }}>PROJECT · {project.ref}</Eyebrow>
            <h1 style={{ fontFamily: 'var(--f-display)', fontSize: 48, margin: 0, fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.05 }}>
              {project.name}
              <span style={{ color: 'var(--mist-400)' }}> · </span>
              <span style={{ fontStyle: 'italic', fontWeight: 300 }}>{project.industry}</span>
            </h1>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <span className="pill">● {project.headcount} → {project.headcountTarget} staff</span>
              <span className="pill">{project.surface} m² · {project.floors} {project.floors === 1 ? 'floor' : 'floors'}</span>
              <span className="pill">{project.location}</span>
              <span className="pill" style={{ background: 'var(--forest-ghost)', color: 'var(--forest)' }}>Stage · {project.stage}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
            <PillToggle
              options={[{ value: 'eng', label: 'Engineering' }, { value: 'client', label: 'Client' }]}
              value={view} onChange={setView}
            />
            <div style={{ textAlign: 'right' }}>
              <div className="mono" style={{ color: 'var(--mist-500)', fontSize: 10 }}>OVERALL PROGRESS</div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 36, fontWeight: 400, color: project.tint, letterSpacing: '-0.02em' }}>
                {project.progress}<span style={{ fontSize: 18, color: 'var(--mist-500)' }}>%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Surface grid */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <Eyebrow>SURFACES · {activeSurfaces} / {SURFACES.length} ACTIVE</Eyebrow>
        <button className="btn btn-ghost btn-sm"><Icon name="plus" size={12}/> New run</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {SURFACES.map(s => {
          const st = project.surfaces[s.key];
          const c = STATE_COLOR[st.state];
          const disabled = st.state === 'pending';
          return (
            <div key={s.key}
              onClick={() => !disabled && go(s.route)}
              className="card"
              style={{
                cursor: disabled ? 'default' : 'pointer',
                padding: 24, opacity: disabled ? 0.6 : 1,
                minHeight: 180, display: 'flex', flexDirection: 'column'
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 8,
                  background: disabled ? 'var(--mist-100)' : 'var(--forest-ghost)',
                  color: disabled ? 'var(--mist-500)' : 'var(--forest)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Icon name={s.icon} size={18}/>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: c.dot }}/>
                  <span className="mono" style={{ color: 'var(--mist-500)' }}>{c.label.toUpperCase()}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 22, color: 'var(--sand)' }}>{s.roman}.</span>
                <span style={{ fontFamily: 'var(--f-display)', fontSize: 26, fontWeight: 400, letterSpacing: '-0.01em' }}>{s.label}</span>
              </div>
              <p style={{ color: 'var(--mist-600)', fontSize: 13, margin: 0, lineHeight: 1.5, flex: 1 }}>
                {st.note}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--mist-100)' }}>
                <span className="mono" style={{ color: 'var(--mist-500)' }}>{st.updatedAt.toUpperCase()}</span>
                {!disabled && <span style={{ color: 'var(--forest)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  Open <Icon name="chevron-right" size={12}/>
                </span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Activity */}
      <Eyebrow style={{ marginTop: 44, marginBottom: 14 }}>RECENT ACTIVITY</Eyebrow>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, background: 'var(--canvas-2)', borderRadius: 10, border: '1px solid var(--mist-200)', padding: 6 }}>
        {[
          { t: 'today · 14:32', kind: 'Mood board', label: 'Run generated · 10 tiles · Atelier' },
          { t: 'today · 13:10', kind: 'Micro-zoning', label: '12 zones drilled · Atelier variant' },
          { t: 'today · 12:45', kind: 'Macro-zoning', label: '3 variants generated · avg. 91.7% adjacency' },
          { t: 'yesterday · 18:20', kind: 'Macro-zoning', label: 'First macro run · 3 concepts' },
          { t: 'yesterday · 17:00', kind: 'Brief', label: 'Programme synthesized · 8 sections' }
        ].map((a, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 140px 1fr auto', gap: 14, padding: '12px 16px', alignItems: 'center', borderRadius: 6 }}>
            <span className="mono" style={{ color: 'var(--mist-500)' }}>{a.t.toUpperCase()}</span>
            <span className="mono" style={{ color: 'var(--forest)' }}>{a.kind.toUpperCase()}</span>
            <span style={{ fontSize: 13 }}>{a.label}</span>
            <Icon name="more-horizontal" size={14} style={{ color: 'var(--mist-400)' }}/>
          </div>
        ))}
      </div>
    </>
  );
}

// ───── 3. BRIEF ───────────────────────────────────────────────
function BriefScreen({ go }) {
  const [phase, setPhase] = React.useState('input'); // 'input' | 'running' | 'done'
  const [industry, setIndustry] = React.useState('Tech startup');
  const [text, setText] = React.useState(L.brief.raw);
  const [drawer, setDrawer] = React.useState(null);

  const [agents, setAgents] = React.useState([
    { roman: 'I',   name: 'Effectifs Agent',   status: 'pending', message: '' },
    { roman: 'II',  name: 'Benchmarks Agent',  status: 'pending', message: '' },
    { roman: 'III', name: 'Constraints Agent', status: 'pending', message: '' },
    { roman: 'IV',  name: 'Synthesizer',       status: 'pending', message: '' }
  ]);

  const runSynthesis = () => {
    setPhase('running');
    const seq = [
      { i: 0, m: 'Parsing 120 → 170 trajectory, 3-days on-site policy…' },
      { i: 1, m: 'Sourcing Leesman 2024 ratios for fintech…' },
      { i: 2, m: 'Validating ERP Type W requirements…' },
      { i: 3, m: 'Composing the programme…' }
    ];
    seq.forEach((s, k) => {
      setTimeout(() => {
        setAgents(a => a.map((x, idx) => idx === s.i ? { ...x, status: 'active', message: s.m } : x));
        setTimeout(() => {
          setAgents(a => a.map((x, idx) => idx === s.i ? { ...x, status: 'done', message: x.message } : x));
          if (k === seq.length - 1) setTimeout(() => setPhase('done'), 600);
        }, 2200);
      }, k * 2400);
    });
  };

  const industries = ['Tech startup', 'Law firm', 'Bank & insurance', 'Consulting', 'Creative agency', 'Healthcare', 'Public sector', 'Other'];

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '56px 64px' }}>
      <Eyebrow style={{ marginBottom: 12 }}>I · BRIEF</Eyebrow>
      <h1 className="display" style={{ fontSize: 72, margin: 0, fontStyle: 'italic', letterSpacing: '-0.02em' }}>Tell us about the project.</h1>
      <p className="serif" style={{ fontSize: 22, color: 'var(--mist-600)', marginTop: 18, maxWidth: 720, lineHeight: 1.45 }}>
        Paste the client brief in natural language. We'll extract the programme.
      </p>

      <div style={{ marginTop: 56, display: 'grid', gridTemplateColumns: '1fr 320px', gap: 56 }}>
        <div>
          {/* Industry pills */}
          <Eyebrow style={{ marginBottom: 12 }}>INDUSTRY</Eyebrow>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 36 }}>
            {industries.map(i => (
              <button key={i} onClick={() => setIndustry(i)}
                className={'pill' + (industry === i ? ' pill-active' : ' pill-ghost')}
                style={{ padding: '8px 14px', fontSize: 12 }}>
                {i}
              </button>
            ))}
          </div>

          <Eyebrow style={{ marginBottom: 12 }}>CLIENT BRIEF</Eyebrow>
          <textarea value={text} onChange={e => setText(e.target.value)}
            rows={10}
            style={{
              width: '100%', border: 'none', background: 'transparent',
              fontFamily: 'var(--f-display)', fontSize: 22, lineHeight: 1.5,
              fontWeight: 300, letterSpacing: '-0.005em',
              resize: 'vertical', outline: 'none', color: 'var(--ink)',
              padding: '0 0 24px', borderBottom: '1px solid var(--mist-200)'
            }}/>

          {phase === 'input' && (
            <button onClick={runSynthesis} className="btn btn-primary" style={{ marginTop: 32, padding: '16px 28px' }}>
              Synthesize programme <Icon name="sparkles" size={14}/>
            </button>
          )}

          {/* Agents */}
          {phase !== 'input' && (
            <div style={{ marginTop: 48 }}>
              <Eyebrow style={{ marginBottom: 18 }}>AGENTS AT WORK</Eyebrow>
              <AgentTrace agents={agents} />
            </div>
          )}

          {/* Card grid */}
          {phase === 'done' && (
            <div style={{ marginTop: 56 }} className="fade-rise">
              <Eyebrow style={{ marginBottom: 18 }}>PROGRAMME · 8 SECTIONS</Eyebrow>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
                {L.brief.synthesis.map((s, i) => (
                  <div key={i} className="card" style={{ cursor: 'pointer' }} onClick={() => setDrawer(s)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 6,
                        background: 'var(--forest-ghost)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', color: 'var(--forest)'
                      }}>
                        <Icon name={s.icon} size={16}/>
                      </div>
                      <span className="mono" style={{ color: 'var(--mist-500)' }}>{roman(i + 1)}.</span>
                    </div>
                    <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, fontWeight: 400, marginBottom: 6, letterSpacing: '-0.01em' }}>{s.title}</div>
                    <div style={{ color: 'var(--mist-600)', fontSize: 14 }}>{s.tldr}</div>
                    <div className="mono" style={{ color: 'var(--forest)', marginTop: 14, fontSize: 11 }}>READ MORE →</div>
                  </div>
                ))}
              </div>
              <button onClick={() => go('testfit')} className="btn btn-primary" style={{ marginTop: 40 }}>
                Continue to test fit <Icon name="arrow-right" size={14}/>
              </button>
            </div>
          )}
        </div>

        {/* Right side — uploads */}
        <aside>
          <Eyebrow style={{ marginBottom: 14 }}>ASSETS</Eyebrow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="placeholder-img" style={{
              height: 120, border: '1px dashed var(--mist-300)',
              background: 'transparent', color: 'var(--mist-500)'
            }}>
              <div style={{ textAlign: 'center' }}>
                <Icon name="upload" size={16} style={{ marginBottom: 6 }}/>
                <div>DROP CLIENT LOGO</div>
                <div style={{ fontSize: 9, color: 'var(--mist-400)', marginTop: 2 }}>OPTIONAL</div>
              </div>
            </div>
            <div className="placeholder-img" style={{
              height: 160, border: '1px dashed var(--mist-300)',
              background: 'transparent', color: 'var(--mist-500)'
            }}>
              <div style={{ textAlign: 'center' }}>
                <Icon name="file-text" size={16} style={{ marginBottom: 6 }}/>
                <div>DROP FLOOR PLAN PDF</div>
                <div style={{ fontSize: 9, color: 'var(--mist-400)', marginTop: 2, maxWidth: 180 }}>GIVES AGENTS BETTER SPATIAL CONSTRAINTS</div>
              </div>
            </div>
            <div style={{
              border: '1px solid var(--mist-200)', borderRadius: 8, padding: 16,
              background: 'var(--canvas-2)'
            }}>
              <Eyebrow style={{ marginBottom: 10 }}>DEFAULTS DETECTED</Eyebrow>
              <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span><span className="mono" style={{ color: 'var(--mist-500)' }}>FTE</span> 120 → 170</span>
                <span><span className="mono" style={{ color: 'var(--mist-500)' }}>AREA</span> 2400 m² · 2 floors</span>
                <span><span className="mono" style={{ color: 'var(--mist-500)' }}>POLICY</span> 3 on / 2 off</span>
                <span><span className="mono" style={{ color: 'var(--mist-500)' }}>ERP</span> Type W · 4ᵉ cat.</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Drawer for card detail */}
      <Drawer open={!!drawer} onClose={() => setDrawer(null)}>
        {drawer && (
          <div style={{ padding: 36, overflow: 'auto', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Eyebrow>PROGRAMME · DETAIL</Eyebrow>
              <button onClick={() => setDrawer(null)} style={{ color: 'var(--mist-500)' }}><Icon name="x" size={18}/></button>
            </div>
            <div style={{
              width: 44, height: 44, borderRadius: 8, marginBottom: 18,
              background: 'var(--forest-ghost)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: 'var(--forest)'
            }}>
              <Icon name={drawer.icon} size={20}/>
            </div>
            <h2 className="display" style={{ fontSize: 36, margin: 0, marginBottom: 14, fontStyle: 'italic' }}>{drawer.title}</h2>
            <p className="serif" style={{ fontSize: 19, color: 'var(--mist-700)', margin: 0, marginBottom: 24 }}>{drawer.tldr}</p>
            <p style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--ink-2)' }}>{drawer.body}</p>
            <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--mist-200)' }}>
              <Eyebrow style={{ marginBottom: 10 }}>SOURCES</Eyebrow>
              <div className="mono" style={{ color: 'var(--mist-600)', lineHeight: 2 }}>
                → Leesman Index 2024, fintech subset<br/>
                → Gensler Workplace Survey EU 2024<br/>
                → ERP Type W · Arrêté 25 juin 1980
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

Object.assign(window, { LandingScreen, DashboardScreen, BriefScreen });
