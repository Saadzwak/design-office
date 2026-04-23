// Screens 4-7: TestFit (macro + micro), MoodBoard, Justify
const L2 = window.LUMEN;

function TestFitScreen({ go }) {
  const [tab, setTab] = React.useState('macro');
  const [selected, setSelected] = React.useState('atelier');
  const [viewMode, setViewMode] = React.useState('2d');
  const [zoneDrawer, setZoneDrawer] = React.useState(null);

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: '48px 48px 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
        <div>
          <Eyebrow style={{ marginBottom: 10 }}>
            II · TEST FIT · {tab === 'macro' ? 'MACRO-ZONING' : 'MICRO-ZONING'}
          </Eyebrow>
          <h1 className="display" style={{ fontSize: 64, margin: 0, fontStyle: 'italic', letterSpacing: '-0.02em' }}>
            {tab === 'macro' ? 'Three concepts, one space.' : 'Drill into the chosen concept.'}
          </h1>
        </div>
        <PillToggle
          options={[{ value: 'macro', label: 'Macro-zoning' }, { value: 'micro', label: 'Micro-zoning' }]}
          value={tab} onChange={setTab}
        />
      </div>

      {tab === 'macro' ? (
        <MacroView selected={selected} setSelected={setSelected} viewMode={viewMode} setViewMode={setViewMode} go={go} onDrill={() => setTab('micro')} />
      ) : (
        <MicroView selected={selected} zoneDrawer={zoneDrawer} setZoneDrawer={setZoneDrawer} />
      )}
    </div>
  );
}

function MacroView({ selected, setSelected, go, onDrill }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
        {L2.macroVariants.map(v => {
          const isSel = v.id === selected;
          return (
            <div key={v.id} onClick={() => setSelected(v.id)}
              className="card"
              style={{
                cursor: 'pointer',
                padding: 20,
                border: isSel ? '2px solid var(--forest)' : '1px solid var(--mist-200)',
                transform: isSel ? 'scale(1.015)' : 'scale(1)',
                boxShadow: isSel ? '0 20px 40px rgba(47, 74, 63, 0.12)' : 'none',
                background: '#FFFDF9'
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 12, height: 12, borderRadius: 2,
                    background: `var(--${v.pigment})`, transform: 'rotate(45deg)'
                  }}/>
                  <span style={{ fontFamily: 'var(--f-display)', fontSize: 28, fontWeight: 400, fontStyle: 'italic' }}>
                    {v.name}
                  </span>
                </div>
                <PillToggle size="sm"
                  options={[{ value: '2d', label: '2D' }, { value: '3d', label: '3D' }]}
                  value="2d" onChange={() => {}} />
              </div>
              <p style={{ color: 'var(--mist-600)', fontSize: 14, lineHeight: 1.5, minHeight: 44, margin: '0 0 16px' }}>
                {v.pitch}
              </p>
              <div style={{ border: '1px solid var(--mist-100)', borderRadius: 8, padding: 8, background: 'var(--canvas-2)' }}>
                <FloorPlan zones={v.zones} size={{ w: 400, h: 260 }} />
              </div>

              {/* Metrics row */}
              <div style={{ display: 'flex', gap: 20, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--mist-100)' }}>
                <MetricBadge label="Desks" value={v.metrics.desks}/>
                <MetricBadge label="m²/FTE" value={v.metrics.density}/>
                <MetricBadge label="Flex" value={v.metrics.flex}/>
                <MetricBadge label="Adj." value={v.metrics.adjacency}/>
              </div>

              {/* Warnings */}
              {v.warnings.length > 0 && (
                <div style={{
                  marginTop: 14, padding: 12,
                  background: 'rgba(160, 82, 45, 0.08)',
                  borderLeft: '3px dashed var(--clay)', borderRadius: 4,
                  display: 'flex', gap: 10, alignItems: 'start'
                }}>
                  <Icon name="alert-triangle" size={14} style={{ color: 'var(--clay)', marginTop: 2 }}/>
                  <span style={{ color: 'var(--clay)', fontSize: 12 }}>{v.warnings[0].text}</span>
                </div>
              )}

              {isSel && (
                <button onClick={onDrill} className="btn btn-ghost" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}>
                  Drill into micro-zoning <Icon name="arrow-right" size={12}/>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 18, marginTop: 32, padding: '14px 20px', background: 'var(--canvas-2)', borderRadius: 8, border: '1px solid var(--mist-200)' }}>
        <Eyebrow>ZONE LEGEND</Eyebrow>
        {[
          ['work', 'Focus'], ['collab', 'Collab'], ['hospitality', 'Hospitality'],
          ['support', 'Support'], ['biophilic', 'Biophilic']
        ].map(([k, l]) => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, background: ZONE_COLORS[k].fill, border: `1px solid ${ZONE_COLORS[k].stroke}`, borderRadius: 2 }}/>
            {l}
          </span>
        ))}
      </div>

      {/* Agent trace + iterate */}
      <div style={{ marginTop: 48 }}>
        <Eyebrow style={{ marginBottom: 18 }}>AGENTS AT WORK · MACRO RUN #2</Eyebrow>
        <AgentTrace agents={[
          { roman: 'I',   name: 'Programme Reader',  status: 'done', message: '8 sections · 137 seats budgeted' },
          { roman: 'II',  name: 'Adjacency Solver',  status: 'done', message: '3 variants generated · avg. 91.7%' },
          { roman: 'III', name: 'Density Validator', status: 'done', message: 'All within 14–17 m²/FTE window' }
        ]} />
      </div>

      <div style={{ marginTop: 36, padding: 20, background: '#FFFDF9', border: '1px solid var(--mist-200)', borderRadius: 12 }}>
        <Eyebrow style={{ marginBottom: 10 }}>ITERATE · NATURAL LANGUAGE</Eyebrow>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Icon name="corner-down-right" size={14} style={{ color: 'var(--mist-400)' }}/>
          <input className="input-underline" style={{ borderBottom: 'none', flex: 1, fontSize: 16 }}
            placeholder="e.g. give me a variant with more phone booths and less hoteling…" />
          <button className="btn btn-primary btn-sm"><Icon name="sparkles" size={12}/> Generate</button>
        </div>
      </div>
    </>
  );
}

function MicroView({ selected, zoneDrawer, setZoneDrawer }) {
  const variant = L2.macroVariants.find(v => v.id === selected) || L2.macroVariants[1];
  return (
    <>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: 'var(--forest-ghost)', borderRadius: 999, marginBottom: 28 }}>
        <span className="mono" style={{ color: 'var(--forest)' }}>DRILLING INTO</span>
        <span style={{ fontFamily: 'var(--f-display)', fontSize: 16, fontStyle: 'italic', color: 'var(--forest)' }}>
          · {variant.name}
        </span>
        <span style={{ width: 3, height: 3, background: 'var(--forest)', borderRadius: 2 }}/>
        <span className="mono" style={{ color: 'var(--forest)' }}>{variant.metrics.desks} desks</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 32 }}>
        <div style={{ border: '1px solid var(--mist-200)', borderRadius: 12, padding: 16, background: '#FFFDF9' }}>
          <FloorPlan zones={variant.zones} numbered
            size={{ w: 720, h: 460 }}
            onZoneClick={(_, i) => setZoneDrawer(L2.microZones[i])} />
        </div>
        <div>
          <Eyebrow style={{ marginBottom: 14 }}>ZONES · 12</Eyebrow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 520, overflow: 'auto', paddingRight: 4 }}>
            {L2.microZones.map(z => (
              <div key={z.n}
                onClick={() => setZoneDrawer(z)}
                className="card"
                style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
                <span className="mono" style={{ color: 'var(--mist-400)', width: 22, fontSize: 11 }}>{String(z.n).padStart(2, '0')}</span>
                <div style={{
                  width: 28, height: 28, borderRadius: 4, background: 'var(--canvas-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--forest)'
                }}>
                  <Icon name={z.icon} size={14}/>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{z.name}</div>
                  <div className="mono" style={{ color: 'var(--mist-500)' }}>{z.surface} m²</div>
                </div>
                <span title={z.status === 'ok' ? 'OK' : 'Review'} style={{
                  width: 8, height: 8, borderRadius: 4,
                  background: z.status === 'ok' ? 'var(--mint)' : 'var(--sun)'
                }}/>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Drawer open={!!zoneDrawer} onClose={() => setZoneDrawer(null)} width={520}>
        {zoneDrawer && (
          <div style={{ padding: 36, overflow: 'auto', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Eyebrow>ZONE · {String(zoneDrawer.n).padStart(2, '0')}</Eyebrow>
              <button onClick={() => setZoneDrawer(null)} style={{ color: 'var(--mist-500)' }}><Icon name="x" size={18}/></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--forest-ghost)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--forest)' }}>
                <Icon name={zoneDrawer.icon} size={20}/>
              </div>
              <div>
                <h2 className="display" style={{ fontSize: 30, margin: 0, fontStyle: 'italic' }}>{zoneDrawer.name}</h2>
                <span className="mono" style={{ color: 'var(--mist-500)' }}>{zoneDrawer.surface} m² · ATELIER</span>
              </div>
            </div>

            <Placeholder tag={`ZOOMED PLAN · ZONE ${zoneDrawer.n}`} ratio="16/9"
              style={{ margin: '24px 0', border: '1px solid var(--mist-200)' }}/>

            <Eyebrow style={{ marginTop: 20, marginBottom: 10 }}>FURNITURE</Eyebrow>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                ['Herman Miller Jarvis sit-stand', '× 12 · 160×80 cm'],
                ['Vitra Eames Segmented', '× 1 · 300×100 cm'],
                ['Framery O acoustic pod', '× 2 · 1 pers.'],
                ['+Halle Embrace lounge', '× 1 · 180×80 cm']
              ].map(([n, d]) => (
                <div key={n} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '6px 0', borderBottom: '1px solid var(--mist-100)' }}>
                  <span>{n}</span>
                  <span className="mono" style={{ color: 'var(--mist-500)' }}>{d}</span>
                </div>
              ))}
            </div>

            <Eyebrow style={{ marginTop: 28, marginBottom: 10 }}>ACOUSTIC</Eyebrow>
            <div style={{ background: 'var(--canvas-2)', padding: 14, borderRadius: 8, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span>Rw target</span><span className="mono">≥ 44 dB</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>DnT,A target</span><span className="mono">≥ 38 dB</span>
              </div>
              <div className="mono" style={{ color: 'var(--mist-500)', marginTop: 10, fontSize: 10 }}>
                → NF S 31-080 · Performant level
              </div>
            </div>

            <Eyebrow style={{ marginTop: 28, marginBottom: 10 }}>MATERIALS</Eyebrow>
            <div style={{ fontSize: 13, color: 'var(--mist-700)', lineHeight: 1.8 }}>
              <div><span className="mono" style={{ color: 'var(--mist-500)', marginRight: 10 }}>FLOOR</span> Amtico Worn Oak plank</div>
              <div><span className="mono" style={{ color: 'var(--mist-500)', marginRight: 10 }}>WALLS</span> Farrow & Ball Lime Plaster</div>
              <div><span className="mono" style={{ color: 'var(--mist-500)', marginRight: 10 }}>CEILING</span> BAUX Wood-wool acoustic</div>
            </div>

            <div style={{ marginTop: 28, padding: 14, borderRadius: 8,
              background: zoneDrawer.status === 'ok' ? 'rgba(107, 143, 127, 0.12)' : 'rgba(232, 197, 71, 0.18)',
              borderLeft: `3px solid ${zoneDrawer.status === 'ok' ? 'var(--mint)' : 'var(--sun)'}`
            }}>
              <Eyebrow style={{ marginBottom: 4 }}>ADJACENCY CHECK</Eyebrow>
              <div style={{ fontSize: 13 }}>
                {zoneDrawer.status === 'ok'
                  ? '✓ Adjacencies respected. Quiet-loud buffer ≥ 1 partition.'
                  : '⚠ Adjacent to high-traffic zone. Consider acoustic buffer or relocation.'}
              </div>
            </div>

            <button className="btn btn-primary" style={{ marginTop: 24, width: '100%', justifyContent: 'center' }}>
              <Icon name="edit-3" size={12}/> Edit zone
            </button>
          </div>
        )}
      </Drawer>
    </>
  );
}

// ───── 6. MOOD BOARD ──────────────────────────────────────────
function MoodBoardScreen({ go }) {
  const [drawer, setDrawer] = React.useState(null);
  const M = L2.moodBoard;

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: '48px 48px 80px' }}>
      <Eyebrow style={{ marginBottom: 12 }}>III · MOOD BOARD · ATELIER</Eyebrow>
      <h1 className="display" style={{
        fontSize: 56, margin: 0, fontStyle: 'italic', fontWeight: 300,
        letterSpacing: '-0.02em', maxWidth: 1200, lineHeight: 1.08
      }}>
        "{M.tagline}"
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 48, marginTop: 48 }}>
        {/* Pinterest collage */}
        <div style={{
          columnCount: 3, columnGap: 14,
        }}>
          {M.tiles.map((t, i) => (
            <div key={i} style={{
              breakInside: 'avoid', marginBottom: 14,
              transform: `rotate(${(i % 3 - 1) * 0.4}deg)`,
              boxShadow: '0 1px 2px rgba(28,31,26,0.06), 0 10px 20px rgba(28,31,26,0.06)',
              background: 'white', padding: 6, borderRadius: 4
            }}>
              <Placeholder tag={t.tag} tint={t.tint} ratio={t.ratio} />
            </div>
          ))}
        </div>

        {/* Drilldown cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { k: 'atmosphere', title: 'Atmosphere', icon: 'feather', tldr: '6 pigments · warm-ivory canvas, forest anchor.' },
            { k: 'materials', title: 'Materials', icon: 'layers', tldr: '6 finishes, sourced Amtico · Kvadrat · BAUX.' },
            { k: 'furniture', title: 'Furniture', icon: 'armchair', tldr: '4 signature pieces with exact dimensions.' },
            { k: 'planting', title: 'Planting', icon: 'leaf', tldr: '4 species, biophilic strategy by zone.' },
            { k: 'light', title: 'Light', icon: 'sun', tldr: '2700–3000 K · Bocci · Flos · Artemide.' },
            { k: 'sources', title: 'Sources', icon: 'file-text', tldr: '23 citations · MCP + adjacency rules.' }
          ].map(c => (
            <div key={c.k} className="card" style={{
              display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', padding: 20
            }} onClick={() => setDrawer(c.k)}>
              <div style={{
                width: 40, height: 40, borderRadius: 6,
                background: 'var(--forest-ghost)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: 'var(--forest)'
              }}>
                <Icon name={c.icon} size={18}/>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 400 }}>{c.title}</div>
                <div style={{ color: 'var(--mist-600)', fontSize: 13 }}>{c.tldr}</div>
              </div>
              <Icon name="chevron-right" size={16} style={{ color: 'var(--mist-400)' }}/>
            </div>
          ))}
        </div>
      </div>

      {/* Palette strip */}
      <div style={{ marginTop: 56 }}>
        <Eyebrow style={{ marginBottom: 14 }}>PALETTE · ORGANIC MODERN</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${M.palette.length}, 1fr)`, border: '1px solid var(--mist-200)', borderRadius: 10, overflow: 'hidden' }}>
          {M.palette.map(p => (
            <div key={p.name} style={{ padding: '36px 20px 18px', background: p.hex, color: ['#FAF7F2', '#E8DCC4', '#C9B79C'].includes(p.hex) ? 'var(--ink)' : 'white' }}>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, fontStyle: 'italic', fontWeight: 400 }}>{p.name}</div>
              <div className="mono" style={{ marginTop: 6, opacity: 0.75 }}>{p.hex.toUpperCase()}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 40 }}>
        <button className="btn btn-ghost"><Icon name="download" size={12}/> Download A3 PDF</button>
        <button onClick={() => go('justify')} className="btn btn-ghost"><Icon name="arrow-right" size={12}/> Add to client deck</button>
      </div>

      <Drawer open={!!drawer} onClose={() => setDrawer(null)}>
        {drawer && (
          <MoodDrawerContent k={drawer} M={M} onClose={() => setDrawer(null)} />
        )}
      </Drawer>
    </div>
  );
}

function MoodDrawerContent({ k, M, onClose }) {
  return (
    <div style={{ padding: 36, overflow: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <Eyebrow>MOOD BOARD · {k.toUpperCase()}</Eyebrow>
        <button onClick={onClose} style={{ color: 'var(--mist-500)' }}><Icon name="x" size={18}/></button>
      </div>
      {k === 'materials' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          {M.materials.map(m => (
            <div key={m.name}>
              <Placeholder tag={m.name.toUpperCase()} ratio="1/1"/>
              <div style={{ marginTop: 8, fontSize: 13 }}>{m.name}</div>
              <div className="mono" style={{ color: 'var(--mist-500)' }}>SOURCE · {m.source.toUpperCase()}</div>
            </div>
          ))}
        </div>
      )}
      {k === 'furniture' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {M.furniture.map(f => (
            <div key={f.name} style={{ display: 'flex', gap: 14, padding: 14, border: '1px solid var(--mist-100)', borderRadius: 8 }}>
              <div style={{ width: 100, flexShrink: 0 }}>
                <Placeholder tag="PRODUCT" ratio="1/1"/>
              </div>
              <div>
                <div className="mono" style={{ color: 'var(--mist-500)' }}>{f.brand.toUpperCase()}</div>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 20 }}>{f.name}</div>
                <div className="mono" style={{ color: 'var(--mist-600)', marginTop: 6 }}>{f.dims}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {k === 'planting' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {M.planting.map(p => (
            <div key={p} style={{ padding: '12px 14px', background: 'rgba(107,143,127,0.12)', borderLeft: '3px solid var(--mint)', borderRadius: 4, fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 16 }}>
              {p}
            </div>
          ))}
        </div>
      )}
      {k === 'light' && (
        <div>
          <div className="mono" style={{ color: 'var(--mist-500)', marginBottom: 6 }}>COLOUR TEMPERATURE</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 36 }}>{M.light.kelvin}</div>
          <Eyebrow style={{ marginTop: 26, marginBottom: 10 }}>FIXTURES</Eyebrow>
          <ul style={{ paddingLeft: 16, lineHeight: 1.8 }}>
            {M.light.fixtures.map(f => <li key={f} style={{ fontSize: 14 }}>{f}</li>)}
          </ul>
        </div>
      )}
      {k === 'atmosphere' && (
        <div>
          <p className="serif" style={{ fontSize: 20, color: 'var(--mist-700)' }}>
            A warm-ivory canvas held by forest ink. Sand neutrals soften the transitions; sun glints punctuate ritual moments; mint ties indoor and courtyard.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 18 }}>
            {M.palette.map(p => (
              <div key={p.name} style={{ height: 80, background: p.hex, borderRadius: 6 }}/>
            ))}
          </div>
        </div>
      )}
      {k === 'sources' && (
        <div className="mono" style={{ lineHeight: 2, fontSize: 12, color: 'var(--mist-700)' }}>
          → Leesman 2024 · Fintech subset<br/>
          → Gensler Workplace Survey EU 2024<br/>
          → Human Spaces Report 2023<br/>
          → Kvadrat · Textiles catalogue<br/>
          → BAUX · Wood-wool acoustics spec<br/>
          → Framery · O pod dimensions<br/>
          → Farrow & Ball · Lime Plaster<br/>
          → Amtico · Worn Oak plank<br/>
          → Bocci · 28 series<br/>
          → Flos · IC pendant<br/>
          → NF S 31-080 · acoustic performance<br/>
          → ERP Type W · Arrêté 25 juin 1980<br/>
          → adjacency-rules · MCP/fintech
        </div>
      )}
    </div>
  );
}

// ───── 7. JUSTIFY ─────────────────────────────────────────────
function JustifyScreen({ go, view }) {
  const [drawer, setDrawer] = React.useState(null);
  const activeSection = drawer !== null ? L2.justify[drawer] : null;
  const isClient = view === 'client';

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: '48px 48px 80px' }}>
      <Eyebrow style={{ marginBottom: 12 }}>IV · {isClient ? 'STORY' : 'JUSTIFY'}</Eyebrow>
      <h1 className="display" style={{ fontSize: 56, margin: 0, fontStyle: 'italic', fontWeight: 300, letterSpacing: '-0.02em', maxWidth: 1100, lineHeight: 1.08 }}>
        {isClient ? 'The story behind this space.' : 'A sourced argumentaire, in the client\'s language.'}
      </h1>

      <div style={{ marginTop: 28, display: 'flex', gap: 8 }}>
        <span className="pill pill-active" style={{ background: 'var(--forest)', color: 'var(--canvas)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--sand)', transform: 'rotate(45deg)' }}/>
          Atelier retained
        </span>
        <span className="pill">130 desks</span>
        <span className="pill">14.6 m²/FTE</span>
      </div>

      <div style={{ marginTop: 48, display: 'grid', gridTemplateColumns: isClient ? '1fr' : '1fr 280px', gap: 48 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
          {L2.justify.map((s, i) => (
            <div key={i} className="card" style={{ cursor: 'pointer', padding: 26, position: 'relative', minHeight: 180 }}
              onClick={() => setDrawer(i)}>
              <div style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 36, fontWeight: 300, color: 'var(--sand)', lineHeight: 1 }}>
                {s.roman}.
              </div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 24, fontWeight: 400, marginTop: 14, letterSpacing: '-0.01em' }}>{s.title}</div>
              <div style={{ color: 'var(--mist-600)', fontSize: 14, marginTop: 10, lineHeight: 1.5 }}>{s.tldr}</div>
              <div style={{
                position: 'absolute', bottom: 22, right: 22,
                display: 'flex', alignItems: 'center', gap: 6
              }}>
                <span className="mono" style={{ color: 'var(--forest)' }}>{s.citations} CITATIONS</span>
                <Icon name="chevron-right" size={14} style={{ color: 'var(--forest)' }}/>
              </div>
            </div>
          ))}
        </div>

        {!isClient && (
          <aside>
            <Eyebrow style={{ marginBottom: 14 }}>RESEARCH TRACE</Eyebrow>
            <div style={{ background: 'var(--canvas-2)', padding: 20, borderRadius: 10, border: '1px solid var(--mist-200)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  ['Acoustic Agent', '14,200 tok'],
                  ['Biophilic Agent', '11,800 tok'],
                  ['Ergonomics Agent', '9,400 tok'],
                  ['Compliance Agent', '13,700 tok']
                ].map(([n, t]) => (
                  <div key={n} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{n}</span>
                    <span className="mono" style={{ color: 'var(--mist-500)' }}>{t}</span>
                  </div>
                ))}
              </div>
              <hr className="rule" style={{ margin: '14px 0' }}/>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ fontWeight: 500 }}>Total</span>
                <span className="mono" style={{ color: 'var(--forest)', fontWeight: 600 }}>49,100 tok</span>
              </div>
            </div>
          </aside>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 48 }}>
        <button onClick={() => go('export')} className="btn btn-ghost"><Icon name="file-text" size={12}/> Compose client deck (PPTX)</button>
        <button className="btn btn-ghost"><Icon name="download" size={12}/> Download report (PDF)</button>
      </div>

      <Drawer open={drawer !== null} onClose={() => setDrawer(null)} width={560}>
        {activeSection && (
          <div style={{ padding: 36, overflow: 'auto', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
              <Eyebrow>JUSTIFY · {activeSection.roman}</Eyebrow>
              <button onClick={() => setDrawer(null)} style={{ color: 'var(--mist-500)' }}><Icon name="x" size={18}/></button>
            </div>
            <div style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 56, color: 'var(--sand)', lineHeight: 1 }}>{activeSection.roman}.</div>
            <h2 className="display" style={{ fontSize: 36, margin: '8px 0 14px', letterSpacing: '-0.01em' }}>{activeSection.title}</h2>
            <p className="serif" style={{ fontSize: 20, color: 'var(--mist-700)', marginTop: 0 }}>{activeSection.tldr}</p>

            <p style={{ fontSize: 15, lineHeight: 1.75, color: 'var(--ink-2)', marginTop: 22 }}>
              Applied to Lumen, this means delivering performant-class acoustics across every project room, boardroom and phone booth, while preserving the open editorial nave of the Atelier variant. The solution layers wood-wool ceilings, upholstered felt partitions and pile-floor flanking control.
            </p>

            <blockquote style={{
              borderLeft: '3px solid var(--forest)',
              padding: '14px 0 14px 20px', margin: '28px 0',
              fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 19,
              color: 'var(--forest)'
            }}>
              "Office workers in acoustically-treated environments report 23% fewer distractions — a material uplift in measured focus time."
              <div className="mono" style={{ marginTop: 10, fontSize: 11, fontStyle: 'normal', color: 'var(--mist-500)' }}>
                — LEESMAN INDEX · 2024 · FINTECH SUBSET
              </div>
            </blockquote>

            <Eyebrow style={{ marginTop: 10, marginBottom: 10 }}>CITATIONS · {activeSection.citations}</Eyebrow>
            <div className="mono" style={{ lineHeight: 2, fontSize: 11, color: 'var(--mist-700)' }}>
              → NF S 31-080 · performant level<br/>
              → Leesman Index 2024<br/>
              → Gensler Workplace Survey EU 2024<br/>
              → BAUX wood-wool technical spec<br/>
              → Saint-Gobain acoustic guide<br/>
              → Kvadrat felt absorption data
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

Object.assign(window, { TestFitScreen, MoodBoardScreen, JustifyScreen });
