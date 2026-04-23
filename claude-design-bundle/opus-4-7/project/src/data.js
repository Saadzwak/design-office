// Sample data for Lumen — fictional Paris fintech, 120 → 170 staff, 2400m² / 2 floors
window.PROJECTS = [
  {
    id: 'lumen',
    name: 'Lumen',
    industry: 'Tech Startup',
    client: 'Lumen SAS',
    headcount: 120,
    headcountTarget: 170,
    surface: 2400,
    floors: 2,
    location: 'Paris, 9ᵉ',
    ref: 'LUM-2026-041',
    stage: 'Test fit',
    progress: 62,
    updatedAt: 'today · 14:32',
    tint: '#3C5D50',
    surfaces: {
      brief: { state: 'done', updatedAt: 'yesterday · 17:00', note: '8 programme sections · 120 → 170 FTE' },
      testfit: { state: 'active', updatedAt: 'today · 13:10', note: 'Atelier retained · 130 desks' },
      moodboard: { state: 'done', updatedAt: 'today · 14:32', note: 'Atelier · 10 tiles · 6 pigments' },
      justify: { state: 'draft', updatedAt: 'today · 14:40', note: '7 sections drafted · 31 citations' },
      export: { state: 'pending', updatedAt: '—', note: 'Not started' }
    }
  },
  {
    id: 'atrium',
    name: 'Atrium',
    industry: 'Law firm',
    client: 'Atrium Associés',
    headcount: 78,
    headcountTarget: 90,
    surface: 1650,
    floors: 1,
    location: 'Paris, 8ᵉ',
    ref: 'ATR-2026-028',
    stage: 'Justify',
    progress: 88,
    updatedAt: 'yesterday · 11:20',
    tint: '#8A7555',
    surfaces: {
      brief: { state: 'done', updatedAt: '3d ago · 10:00', note: 'Partners, associates, admin — tiered program' },
      testfit: { state: 'done', updatedAt: '2d ago · 16:14', note: 'Bibliothèque retained · 82 offices' },
      moodboard: { state: 'done', updatedAt: '2d ago · 18:02', note: 'Oak panels, leather, brass' },
      justify: { state: 'active', updatedAt: 'yesterday · 11:20', note: 'Client review tomorrow' },
      export: { state: 'pending', updatedAt: '—', note: 'Awaiting sign-off' }
    }
  },
  {
    id: 'forge',
    name: 'Forge',
    industry: 'Creative agency',
    client: 'Forge Studio',
    headcount: 45,
    headcountTarget: 60,
    surface: 980,
    floors: 1,
    location: 'Paris, 11ᵉ',
    ref: 'FRG-2026-019',
    stage: 'Brief',
    progress: 18,
    updatedAt: '4d ago · 09:48',
    tint: '#A0522D',
    surfaces: {
      brief: { state: 'active', updatedAt: '4d ago · 09:48', note: 'Awaiting floor plan upload' },
      testfit: { state: 'pending', updatedAt: '—', note: 'Not started' },
      moodboard: { state: 'pending', updatedAt: '—', note: 'Not started' },
      justify: { state: 'pending', updatedAt: '—', note: 'Not started' },
      export: { state: 'pending', updatedAt: '—', note: 'Not started' }
    }
  },
  {
    id: 'meridian',
    name: 'Meridian',
    industry: 'Bank & insurance',
    client: 'Meridian Group',
    headcount: 340,
    headcountTarget: 380,
    surface: 6200,
    floors: 4,
    location: 'La Défense',
    ref: 'MER-2026-007',
    stage: 'Export',
    progress: 100,
    updatedAt: '1w ago · 18:44',
    tint: '#2F4A3F',
    surfaces: {
      brief: { state: 'done', updatedAt: '3w ago', note: 'Delivered' },
      testfit: { state: 'done', updatedAt: '2w ago', note: 'Campus retained · 348 desks' },
      moodboard: { state: 'done', updatedAt: '2w ago', note: 'Terrazzo, blued steel, wool' },
      justify: { state: 'done', updatedAt: '1w ago', note: 'Client signed-off' },
      export: { state: 'done', updatedAt: '1w ago · 18:44', note: 'DXF + DWG delivered' }
    }
  }
];

window.LUMEN = {
  project: {
    name: 'Lumen',
    industry: 'Tech Startup',
    headcount: 120,
    headcountTarget: 170,
    surface: 2400,
    floors: 2,
    location: 'Paris, 9ᵉ',
    flex: '3 days on-site',
    ref: 'LUM-2026-041'
  },

  brief: {
    raw: `Lumen is a Paris-based fintech of 120 employees, projected to grow to 170 in 18 months. We are relocating to a 2400m² building over two floors in the 9ᵉ arrondissement. Our policy is 3 days on-site, 2 remote. We want a space that reflects a craft, editorial, slightly atelier-like culture — not the typical tech playground. We need room for deep focus, collaborative rituals, and generous hospitality for clients. Accessibility and ERP Type W compliance are required. Budget is serious but not lavish.`,
    synthesis: [
      { icon: 'users', title: 'Headcount Plan', tldr: '120 today, 170 at 18 months · 1.42× growth absorbed.', body: 'Bake capacity for 170 from day one. Leesman 2024 ratios suggest 0.7 desk per FTE under a 3-days policy, giving a target of 119 desks + 15% buffer = 137 seats. Two floors split: 65 / 55 seats at entry, reservable growth block in Wing B.' },
      { icon: 'layout-grid', title: 'Workspace Mix', tldr: '55% focus · 25% collab · 20% hospitality & support.', body: 'Primary spine of focus rooms and quiet open work north-facing. Collaborative spine south with daylight and terraces. Hospitality clustered at the entry level around reception and a large social stair.' },
      { icon: 'messages-square', title: 'Collaboration Spaces', tldr: '8 huddle · 4 project rooms · 1 boardroom · 1 all-hands.', body: 'Distribution honours the "5-minute rule": no employee more than 5 minutes from a bookable room. All-hands absorbs 170 with tiered seating. Acoustic target Rw ≥ 44 dB for project rooms.' },
      { icon: 'coffee', title: 'Hospitality', tldr: 'Entry café, client lounge, 2 tea points, terrace bar.', body: 'Entry café doubles as breakfast ritual and late-afternoon debrief. Client lounge is the first room crossed after reception — editorial, warm, not branded. Terrace bar is seasonal, overlooks the courtyard.' },
      { icon: 'package', title: 'Support Functions', tldr: 'Lockers, post, repro, 2 wellness rooms, 1 parents room.', body: 'Lockers on every floor near core. Wellness rooms fully private, bookable in 30-min slots, equipped for prayer, meditation or rest. Parents room with changing table, fridge, privacy screen.' },
      { icon: 'shield-check', title: 'Compliance Notes', tldr: 'ERP Type W · PMR · accessibility full-stack.', body: 'ERP Type W (bureaux) with capacity < 500 places the project in 4th category. Two compliant evac routes per floor, widths > 1.4m, clear to stair cores. PMR WC on each floor, turning diameter ≥ 1.5m.' },
      { icon: 'alert-triangle', title: 'Red Flags', tldr: '2 risks flagged in brief — review with client.', body: 'Brief states 3 days on-site but expected peak days (Tue/Wed/Thu) may exceed capacity without hoteling. Also: mention of "all-hands for 170" conflicts with 2400m² envelope unless divisible wall is used in largest collab zone.' },
      { icon: 'gauge', title: 'Recommended Density', tldr: '14 m² NIA / FTE at steady state.', body: 'Below Gensler US median (17) but above EU legal minimum (10). Aligns with craft-oriented agencies, allowing generous circulation, a defining social stair, and 2 biophilic cores without hotelling discomfort.' }
    ]
  },

  macroVariants: [
    {
      id: 'villageois',
      name: 'Villageois',
      pigment: 'forest',
      pitch: 'Neighborhoods of 12–14, each with its own ritual table and quiet corner.',
      metrics: { desks: 126, density: '15.2 m²/FTE', flex: '0.72', adjacency: '92%' },
      warnings: [],
      zones: [
        { label: 'Focus Village A', kind: 'work', x: 4, y: 6, w: 28, h: 34 },
        { label: 'Focus Village B', kind: 'work', x: 34, y: 6, w: 28, h: 34 },
        { label: 'Ritual Table', kind: 'collab', x: 64, y: 6, w: 20, h: 20 },
        { label: 'Hospitality', kind: 'hospitality', x: 64, y: 28, w: 20, h: 24 },
        { label: 'Biophilic Core', kind: 'biophilic', x: 4, y: 42, w: 16, h: 18 },
        { label: 'Support', kind: 'support', x: 22, y: 42, w: 14, h: 18 },
        { label: 'Boardroom', kind: 'collab', x: 38, y: 42, w: 22, h: 18 },
        { label: 'Phone Booths', kind: 'support', x: 62, y: 54, w: 22, h: 8 }
      ]
    },
    {
      id: 'atelier',
      name: 'Atelier',
      pigment: 'sand',
      pitch: 'A long editorial nave of focus, with collaboration arranged like production bays.',
      metrics: { desks: 130, density: '14.6 m²/FTE', flex: '0.76', adjacency: '95%' },
      warnings: [],
      zones: [
        { label: 'Long Focus Nave', kind: 'work', x: 4, y: 6, w: 58, h: 20 },
        { label: 'Collab Bay I', kind: 'collab', x: 64, y: 6, w: 20, h: 12 },
        { label: 'Collab Bay II', kind: 'collab', x: 64, y: 20, w: 20, h: 12 },
        { label: 'North Light Atelier', kind: 'work', x: 4, y: 28, w: 30, h: 22 },
        { label: 'South Forge', kind: 'hospitality', x: 36, y: 28, w: 26, h: 22 },
        { label: 'Biophilic Spine', kind: 'biophilic', x: 64, y: 34, w: 20, h: 16 },
        { label: 'Support', kind: 'support', x: 4, y: 52, w: 30, h: 10 },
        { label: 'Boardroom', kind: 'collab', x: 36, y: 52, w: 26, h: 10 }
      ]
    },
    {
      id: 'hybride',
      name: 'Hybride flex',
      pigment: 'mint',
      pitch: 'Activity-based settings, a hoteling ring, and a dense focus heart.',
      metrics: { desks: 112, density: '16.4 m²/FTE', flex: '0.65', adjacency: '88%' },
      warnings: [
        { text: 'Tuesday peak exceeds assigned capacity by 8 seats', kind: 'adjacency' }
      ],
      zones: [
        { label: 'Hoteling Ring', kind: 'work', x: 4, y: 6, w: 80, h: 12 },
        { label: 'Focus Heart', kind: 'work', x: 22, y: 20, w: 44, h: 26 },
        { label: 'Collab West', kind: 'collab', x: 4, y: 20, w: 16, h: 26 },
        { label: 'Collab East', kind: 'collab', x: 68, y: 20, w: 16, h: 26 },
        { label: 'Hospitality', kind: 'hospitality', x: 4, y: 48, w: 32, h: 14 },
        { label: 'Biophilic', kind: 'biophilic', x: 38, y: 48, w: 20, h: 14 },
        { label: 'Support', kind: 'support', x: 60, y: 48, w: 24, h: 14 }
      ]
    }
  ],

  microZones: [
    { n: 1, name: 'Boardroom', surface: 24, icon: 'presentation', status: 'ok' },
    { n: 2, name: 'Open work area', surface: 180, icon: 'layout-grid', status: 'ok' },
    { n: 3, name: 'Phone booth bank', surface: 12, icon: 'phone', status: 'ok' },
    { n: 4, name: 'Project room I', surface: 18, icon: 'users', status: 'warn' },
    { n: 5, name: 'Project room II', surface: 18, icon: 'users', status: 'ok' },
    { n: 6, name: 'Social stair', surface: 42, icon: 'stairs', status: 'ok' },
    { n: 7, name: 'Entry café', surface: 86, icon: 'coffee', status: 'ok' },
    { n: 8, name: 'Client lounge', surface: 38, icon: 'armchair', status: 'ok' },
    { n: 9, name: 'Wellness', surface: 8, icon: 'heart', status: 'ok' },
    { n: 10, name: 'Biophilic core', surface: 22, icon: 'leaf', status: 'ok' },
    { n: 11, name: 'Lockers & post', surface: 14, icon: 'archive', status: 'ok' },
    { n: 12, name: 'Terrace bar', surface: 54, icon: 'sun', status: 'warn' }
  ],

  moodBoard: {
    tagline: 'An atelier of focus on the north light, a bright social forge on the south.',
    palette: [
      { name: 'Worn Oak', hex: '#B89068' },
      { name: 'Forest Ink', hex: '#2F4A3F' },
      { name: 'Lime Plaster', hex: '#E8DCC4' },
      { name: 'Brushed Brass', hex: '#A88B5B' },
      { name: 'Mint Wash', hex: '#6B8F7F' },
      { name: 'Canvas', hex: '#FAF7F2' }
    ],
    tiles: [
      { tag: 'ATELIER · NORTH LIGHT', ratio: '4/5', tint: '#B89068' },
      { tag: 'OAK JOINERY', ratio: '1/1', tint: '#8B6B44' },
      { tag: 'LINEN & WOOL', ratio: '3/4', tint: '#C9B79C' },
      { tag: 'BRASS DETAIL', ratio: '1/1', tint: '#A88B5B' },
      { tag: 'BIOPHILIC CORE', ratio: '4/5', tint: '#6B8F7F' },
      { tag: 'PENDANT LIGHT', ratio: '3/4', tint: '#2A2E28' },
      { tag: 'SOCIAL STAIR', ratio: '4/3', tint: '#3C5D50' },
      { tag: 'WOOD-WOOL ACOUSTIC', ratio: '1/1', tint: '#D4C3A3' },
      { tag: 'CLIENT LOUNGE', ratio: '3/4', tint: '#8A7555' },
      { tag: 'TERRACE', ratio: '4/5', tint: '#6B8F7F' }
    ],
    materials: [
      { name: 'Worn Oak plank', source: 'Amtico' },
      { name: 'Natural linen upholstery', source: 'Kvadrat' },
      { name: 'Wood-wool acoustic', source: 'BAUX' },
      { name: 'Lime-washed walls', source: 'Farrow & Ball' },
      { name: 'Brushed brass hardware', source: 'Buster + Punch' },
      { name: 'Terrazzo entrance', source: 'Dzek' }
    ],
    furniture: [
      { name: 'Eames Segmented table', brand: 'Vitra', dims: '300 × 100 cm' },
      { name: 'Jarvis sit-stand', brand: 'Herman Miller', dims: '160 × 80 cm' },
      { name: 'Framery O acoustic pod', brand: 'Framery', dims: '1 pers.' },
      { name: 'Embrace lounge', brand: '+Halle', dims: '180 × 80 cm' }
    ],
    light: { kelvin: '2700–3000 K', fixtures: ['Bocci 28 cluster, social stair', 'Flos IC pendant, client lounge', 'Artemide Tolomeo task, desks'] },
    planting: ['Ficus Lyrata (entry)', 'Monstera Deliciosa (biophilic core)', 'Dracaena Marginata (focus aisles)', 'Sansevieria (wellness)']
  },

  justify: [
    { roman: 'I',   title: 'Acoustic strategy', tldr: 'Rw ≥ 44 dB project rooms · DnT,A ≥ 38 on partitions.', citations: 6 },
    { roman: 'II',  title: 'Biophilic & neuro', tldr: 'Cognitive uplift 8–12% per Human Spaces 2023.', citations: 4 },
    { roman: 'III', title: 'Ergonomics & wellbeing', tldr: '100% height-adjustable · Leesman index target > 70.', citations: 5 },
    { roman: 'IV',  title: 'Flex & density rationale', tldr: '14.6 m²/FTE absorbs 170 FTEs under 3-days policy.', citations: 7 },
    { roman: 'V',   title: 'PMR & accessibility', tldr: 'Full-stack WCAG + ERP Type W 4ᵉ catégorie.', citations: 3 },
    { roman: 'VI',  title: 'ERP & safety', tldr: '2 evac routes / floor · widths > 1.4m · 0 reroutes.', citations: 4 },
    { roman: 'VII', title: 'Brand identity & culture fit', tldr: 'Editorial, atelier-led — away from tech-playground.', citations: 2 }
  ],

  runs: [
    { id: 'r7', kind: 'moodboard', date: 'today', time: '14:32', label: 'Mood board · Atelier', variant: 'Atelier', active: false, starred: true },
    { id: 'r6', kind: 'micro',     date: 'today', time: '13:10', label: 'Micro-zoning #1 · Atelier', variant: 'Atelier', active: true,  starred: false },
    { id: 'r5', kind: 'macro',     date: 'today', time: '12:45', label: 'Macro-zoning #2 · 3 variants', variant: null, active: false, starred: true },
    { id: 'r4', kind: 'macro',     date: 'yesterday', time: '18:20', label: 'Macro-zoning #1 · 3 variants', variant: null, active: false, starred: false },
    { id: 'r3', kind: 'brief',     date: 'yesterday', time: '17:00', label: 'Brief synthesis #1', variant: null, active: false, starred: false }
  ]
};
