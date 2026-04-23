// Screens 8-10 + Chat
const L3 = window.LUMEN;

function ExportScreen({ go }) {
  const [scale, setScale] = React.useState('100');
  const [phase, setPhase] = React.useState('idle');
  const [ref, setRef] = React.useState(L3.project.ref);

  const generate = () => {
    setPhase('running');
    setTimeout(() => setPhase('done'), 3500);
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 48px 80px' }}>
      <Eyebrow style={{ marginBottom: 12 }}>V · EXPORT</Eyebrow>
      <h1 className="display" style={{ fontSize: 64, margin: 0, fontStyle: 'italic', letterSpacing: '-0.02em' }}>
        Hand off to engineering.
      </h1>
      <p className="serif" style={{ fontSize: 22, color: 'var(--mist-600)', marginTop: 16, maxWidth: 720 }}>
        Five named layers. Zero rewrite. Open directly in AutoCAD, Revit or Vectorworks.
      </p>

      {/* Hero panel */}
      <div style={{
        marginTop: 48, padding: 40, borderRadius: 16,
        background: '#FFFDF9', border: '1px solid var(--mist-200)',
        boxShadow: 'var(--sh-soft)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <span className="pill pill-active" style={{ background: 'var(--forest)', color: 'var(--canvas)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--sand)', transform: 'rotate(45deg)' }}/>
            Atelier · 130 desks
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Eyebrow>SCALE</Eyebrow>
            <PillToggle
              options={[{ value: '50', label: '1:50' }, { value: '100', label: '1:100' }, { value: '200', label: '1:200' }]}
              value={scale} onChange={setScale}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'end', marginBottom: 28 }}>
          <div>
            <Eyebrow style={{ marginBottom: 10 }}>PROJECT REFERENCE</Eyebrow>
            <input value={ref} onChange={e => setRef(e.target.value)}
              className="input-underline" style={{ fontFamily: 'var(--f-mono)', fontSize: 15 }}/>
          </div>
          <div className="mono" style={{ color: 'var(--mist-500)', paddingBottom: 10 }}>
            UNITS · MM · DIN 919
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <button onClick={generate} className="btn btn-primary" style={{ justifyContent: 'center', padding: '20px 24px', fontSize: 16 }}>
            <Icon name="download" size={14}/> Generate DXF
          </button>
          <button onClick={generate} className="btn btn-primary" style={{ justifyContent: 'center', padding: '20px 24px', fontSize: 16 }}>
            <Icon name="download" size={14}/> Generate DWG
          </button>
        </div>
      </div>

      {/* Pipeline */}
      <div style={{ marginTop: 56 }}>
        <Eyebrow style={{ marginBottom: 20 }}>PIPELINE · THREE STEPS</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 48px 1fr 48px 1fr', alignItems: 'stretch', gap: 0 }}>
          {[
            ['I', 'SketchUp model', 'Atelier variant exported from the 3D tool, all zones tagged.'],
            ['II', 'ezdxf · headless', 'Python script translates geometry into CAD primitives.'],
            ['III', 'DXF / DWG', '5 named layers: DO_WALLS · DO_ZONES · DO_FURN · DO_ACOUSTIC · DO_GRID.']
          ].map(([r, t, d], i) => (
            <React.Fragment key={r}>
              <div style={{ padding: 24, background: 'var(--canvas-2)', borderRadius: 10, border: '1px solid var(--mist-200)' }}>
                <div style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 32, color: 'var(--sand)' }}>{r}.</div>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, marginTop: 8 }}>{t}</div>
                <div style={{ color: 'var(--mist-600)', fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>{d}</div>
              </div>
              {i < 2 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="arrow-right" size={20} style={{ color: 'var(--mist-400)' }}/>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Preview / result */}
      {phase !== 'idle' && (
        <div style={{ marginTop: 48 }} className="fade-rise">
          <Eyebrow style={{ marginBottom: 18 }}>GENERATION</Eyebrow>
          {phase === 'running' ? (
            <AgentTrace agents={[
              { roman: 'I', name: 'Model Reader', status: 'done', message: 'Parsed 142 geometric entities' },
              { roman: 'II', name: 'ezdxf Translator', status: 'active', message: 'Building DO_ZONES layer…' },
              { roman: 'III', name: 'Packager', status: 'pending', message: '' }
            ]}/>
          ) : (
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 24, padding: 28 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 8,
                background: 'var(--mint)', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Icon name="shield-check" size={22}/>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 22 }}>Lumen_Atelier_1-{scale}.dxf</div>
                <div className="mono" style={{ color: 'var(--mist-500)', marginTop: 4 }}>
                  342 KB · 5 LAYERS · {new Date().toLocaleDateString('en-GB')}
                </div>
                <div style={{ fontSize: 12, color: 'var(--mist-600)', marginTop: 6 }}>
                  Open with AutoCAD, Revit, Vectorworks or any CAD software.
                </div>
              </div>
              <button className="btn btn-primary"><Icon name="download" size={12}/> Download</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ───── CHAT ──────────────────────────────────────────────────
function ChatBody({ context = 'LUMEN · TECH · 120 STAFF · ATELIER ACTIVE', expanded, onExpand }) {
  const [messages, setMessages] = React.useState([
    { role: 'assistant', text: 'How can I help on the project?' },
    { role: 'user', text: 'The brief says 100 staff but my headcount is 120.' },
    { role: 'assistant', text: 'I see the discrepancy. Want me to update the programme to 120, and recompute density?', action: 'confirm' }
  ]);
  const [input, setInput] = React.useState('');

  const suggestions = ['Generate macro-zoning variants', 'Compose mood board', 'Draft client email', 'Check ERP compliance'];

  const send = () => {
    if (!input.trim()) return;
    setMessages(m => [...m, { role: 'user', text: input }]);
    setInput('');
    setTimeout(() => {
      setMessages(m => [...m, { role: 'assistant', text: 'Running the agents now — you\'ll see them at work below.', typing: true }]);
    }, 400);
  };

  return (
    <>
      {/* Context strip */}
      <div style={{
        padding: '14px 22px', borderBottom: '1px solid var(--mist-200)',
        background: 'var(--canvas-2)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div className="mono" style={{ color: 'var(--mist-600)', fontSize: 10 }}>
          <span style={{ color: 'var(--mint)' }}>●</span> WORKING ON · {context}
        </div>
        {!expanded && (
          <button onClick={onExpand} style={{ color: 'var(--mist-500)' }} title="Expand to full page">
            <Icon name="maximize" size={13}/>
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, padding: '28px 24px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start'
          }} className="fade-rise">
            <div style={{
              maxWidth: '82%',
              padding: m.role === 'user' ? '12px 16px' : '14px 16px 14px 18px',
              background: m.role === 'user' ? 'var(--mist-100)' : 'var(--canvas)',
              borderLeft: m.role === 'assistant' ? '2px solid var(--forest)' : 'none',
              borderRadius: m.role === 'user' ? '14px 14px 2px 14px' : '2px 14px 14px 14px',
              color: 'var(--ink)', fontSize: 14, lineHeight: 1.5
            }}>
              {m.role === 'assistant' && i === 0 ? (
                <span style={{ fontFamily: 'var(--f-display)', fontSize: 18, fontStyle: 'italic', fontWeight: 300 }}>{m.text}</span>
              ) : m.typing ? (
                <Typewriter text={m.text} speed={24}/>
              ) : m.text}

              {m.action === 'confirm' && (
                <div style={{
                  marginTop: 14, padding: 12,
                  background: 'var(--canvas-2)',
                  borderRadius: 8,
                  display: 'flex', flexDirection: 'column', gap: 8
                }}>
                  <div className="mono" style={{ color: 'var(--mist-500)', fontSize: 10 }}>PROPOSED ACTION</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Update programme · 100 → 120 staff</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    <button className="btn btn-primary btn-sm" style={{ padding: '6px 12px' }}>Update to 120</button>
                    <button className="btn btn-ghost btn-sm" style={{ padding: '6px 12px' }}>Keep 100</button>
                    <button className="btn btn-ghost btn-sm" style={{ padding: '6px 12px' }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Suggestions */}
      <div style={{ padding: '0 24px 16px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {suggestions.map(s => (
          <button key={s} className="pill pill-ghost" style={{ fontSize: 11, padding: '5px 11px' }}>{s}</button>
        ))}
      </div>

      {/* Composer */}
      <div style={{
        padding: '14px 20px', borderTop: '1px solid var(--mist-200)',
        background: 'var(--canvas)',
        display: 'flex', alignItems: 'center', gap: 10
      }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Ask anything or say what to do…"
          className="input-underline"
          style={{ borderBottom: 'none', flex: 1, fontSize: 14 }}/>
        <button onClick={send} style={{
          width: 36, height: 36, borderRadius: 6,
          background: 'var(--forest)', color: 'var(--canvas)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Icon name="send" size={14}/>
        </button>
      </div>
    </>
  );
}

function ChatFullPage({ go }) {
  const conversations = [
    { t: 'Now', label: 'Atelier density debate', active: true },
    { t: '2h ago', label: 'Client brief check — 120 vs 100 staff' },
    { t: 'Yesterday', label: 'Mood board pigment direction' },
    { t: 'Yesterday', label: 'Flex policy tuesday peak' },
    { t: '2d ago', label: 'Initial programme sourcing' }
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', height: '100vh' }}>
      <aside style={{ borderRight: '1px solid var(--mist-200)', padding: '22px 18px', background: 'var(--canvas-2)', overflow: 'auto' }}>
        <Eyebrow style={{ marginBottom: 16 }}>CONVERSATIONS</Eyebrow>
        <button className="btn btn-primary btn-sm" style={{ width: '100%', justifyContent: 'center', marginBottom: 18 }}>
          <Icon name="plus" size={12}/> New conversation
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {conversations.map((c, i) => (
            <div key={i} style={{
              padding: '10px 12px',
              borderRadius: 6,
              background: c.active ? 'var(--canvas)' : 'transparent',
              border: c.active ? '1px solid var(--forest)' : '1px solid transparent',
              cursor: 'pointer'
            }}>
              <div className="mono" style={{ color: 'var(--mist-500)', fontSize: 10, marginBottom: 2 }}>{c.t.toUpperCase()}</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{c.label}</div>
            </div>
          ))}
        </div>

        <Eyebrow style={{ marginTop: 28, marginBottom: 12 }}>PROJECT</Eyebrow>
        <div className="card" style={{ padding: 14, fontSize: 12 }}>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 18 }}>{L3.project.name}</div>
          <div style={{ color: 'var(--mist-600)' }}>{L3.project.industry} · {L3.project.headcount} staff</div>
          <div className="mono" style={{ color: 'var(--mist-500)', marginTop: 6 }}>{L3.project.ref}</div>
        </div>
      </aside>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <ChatBody expanded={true} onExpand={() => {}} />
      </div>
    </div>
  );
}

Object.assign(window, { ExportScreen, ChatBody, ChatFullPage });
