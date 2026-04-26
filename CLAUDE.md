# Archoff — Mission CTO pour Claude Code

## 0. Contexte et cadre d'exécution

Tu es l'ingénieur de build autonome pour **Archoff**, un produit web destiné au hackathon Anthropic "Built with Opus 4.7" (deadline dimanche 26 avril 2026, 20h EST).

Le développeur humain (Saad) est solo, non-codeur direct, et dort pendant que tu construis. Tu travailles en **mode boucle autonome** via `/loop` : tu planifies, implémentes, testes, itères, journalises ton avancement, et tu ne t'arrêtes que sur les points de blocage explicitement listés en section 12 qui nécessitent son intervention physique.

**Ce document est ton cahier des charges complet.** Tu peux l'enrichir via commits mais pas en dévier sans raison technique justifiée documentée dans `BUILD_LOG.md`.

**Machine** : Windows 10/11 natif. SketchUp Pro et AutoCAD seront installés au réveil de Saad.

**Clé API Opus 4.7** : fournie dans `.env` sous la variable `ANTHROPIC_API_KEY`. Modèle à utiliser : `claude-opus-4-7`.

---

## 1. Objectif produit

**Archoff** est un copilote IA pour architectes d'intérieur et space planners qui aménagent des bureaux tertiaires (office fit-out). Il couvre 4 surfaces fonctionnelles :

1. **Brief intelligent** — transformation d'un brief client textuel en programme fonctionnel chiffré et sourcé
2. **Test fit 3D** — lecture d'un plan PDF de plateau + programme → 3 variantes 3D générées dans SketchUp avec itération langage naturel
3. **Justification design sourcée** — argumentaire client avec citations (acoustique, ergonomie, neuroarchitecture, réglementation PMR/ERP)
4. **Export technique** — DWG A1 coté avec cartouche via AutoCAD MCP

**Cible utilisateur** : space planners en agence (Saguez, Gensler, Bigbang), brokers test-fit (JLL, CBRE, Cushman), space planners chez fabricants mobilier (Steelcase, MillerKnoll, Haworth).

**Positionnement** : augmenter l'architecte d'intérieur sur les phases programming (amont) et test fit (création), là où aujourd'hui il n'y a aucun outil IA sérieux.

---

## 2. Critères de victoire hackathon (garde-les en tête à chaque décision)

Le hackathon est jugé sur :

- **Impact (30%)** — problème réel, marché tangible, défendable
- **Demo quality (25%)** — 3 min vidéo, visuel, wow factor
- **Creative Opus 4.7 use (25%)** — exploiter des capacités uniques du modèle
- **Depth (20%)** — profondeur technique, pas juste un wrapper API

**Prix annexes visés (5 000 $ chacun)** :
- **Best use of Managed Agents** — orchestration à 3 niveaux structurée (section 6)
- **Most Creative Opus 4.7 Exploration** — Vision HD sur plans + double MCP CAD
- **Keep Thinking Prize** — MCP Resources métier consultées à la volée

**Règles obligatoires** :
- 100% open source, licence MIT
- Construit from scratch pendant le hackathon (dépendances publiques OK)
- Repo GitHub public avec README clair
- Démo vidéo 3 minutes
- Written summary

---

## 3. Architecture technique verrouillée

```
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND (React 18 + TypeScript + Tailwind + Framer Motion)    │
│  - Landing page premium (esthétique agence de design)           │
│  - 4 écrans : Brief / Test Fit / Justify / Export               │
│  - Visualisation 3D SketchUp via screenshots streamés           │
│  - Chat langage naturel avec Claude                             │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTP/WebSocket
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND (FastAPI + Python 3.11)                                │
│  - Orchestrateur Claude Opus 4.7 (claude-opus-4-7)              │
│  - Parsing PDF hybride (Vision HD prioritaire + PyMuPDF)        │
│  - Managed Agents orchestration (3 niveaux)                     │
│  - Gestionnaire MCP (SketchUp + AutoCAD)                        │
│  - Bibliothèque mobilier (JSON)                                 │
│  - MCP Resources métier (Markdown structuré)                    │
└──────────────┬───────────────────────────────┬──────────────────┘
               │                               │
               ▼                               ▼
┌──────────────────────────────┐  ┌────────────────────────────────┐
│  SKETCHUP MCP                │  │  AUTOCAD MCP                   │
│  (fork mhyrr/sketchup-mcp)   │  │  (fork puran-water/autocad-mcp)│
│                              │  │                                │
│  + Extensions Archoff: │  │  v3.1, 8 outils consolidés     │
│    create_workstation_cluster│  │  Backend ezdxf (headless)      │
│    create_meeting_room       │  │  Backend File IPC (AutoCAD live)│
│    create_phone_booth        │  │  Cotations natives             │
│    create_partition_wall     │  │  Plot PDF                      │
│    create_collab_zone        │  │                                │
│    apply_biophilic_zone      │  │                                │
│  SKETCHUP PRO (local)        │  │  AUTOCAD (local)               │
└──────────────────────────────┘  └────────────────────────────────┘
```

**Repos à forker (premier commit de Saad au réveil)** :
- `https://github.com/mhyrr/sketchup-mcp` → `vendor/sketchup-mcp/`
- `https://github.com/puran-water/autocad-mcp` → `vendor/autocad-mcp/`

---

## 4. Structure du monorepo

```
design-office/
├── README.md
├── BUILD_LOG.md                 # Journal d'avancement, maj à chaque boucle
├── BLOCKERS.md                  # Blocages nécessitant Saad (section 12)
├── .env.example
├── .gitignore
├── LICENSE                      # MIT
│
├── backend/
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py              # FastAPI app
│   │   ├── config.py
│   │   ├── claude_client.py     # Wrapper Opus 4.7
│   │   ├── agents/              # Managed Agents orchestration
│   │   │   ├── orchestrator.py
│   │   │   ├── variant_generator.py
│   │   │   ├── research_agent.py
│   │   │   └── review_agent.py
│   │   ├── surfaces/
│   │   │   ├── brief.py         # Surface 1
│   │   │   ├── testfit.py       # Surface 2
│   │   │   ├── justify.py       # Surface 3
│   │   │   └── export.py        # Surface 4
│   │   ├── pdf/
│   │   │   ├── parser.py        # Pipeline hybride Vision HD + PyMuPDF
│   │   │   └── geometry.py      # Extraction géométries
│   │   ├── mcp/
│   │   │   ├── sketchup_client.py
│   │   │   ├── autocad_client.py
│   │   │   └── helpers.py       # Wrappers métier
│   │   ├── data/
│   │   │   ├── furniture/       # Bibliothèque mobilier JSON
│   │   │   ├── resources/       # MCP Resources Markdown
│   │   │   └── benchmarks/      # Ratios métier
│   │   ├── prompts/             # Prompts système versionnés
│   │   └── models.py            # Pydantic models
│   └── tests/
│
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── routes/
│   │   │   ├── Landing.tsx
│   │   │   ├── Brief.tsx
│   │   │   ├── TestFit.tsx
│   │   │   ├── Justify.tsx
│   │   │   └── Export.tsx
│   │   ├── components/
│   │   │   ├── ui/              # Primitives custom (pas de shadcn générique)
│   │   │   ├── viewer/          # Viewer 3D screenshots
│   │   │   ├── chat/            # Chat Claude
│   │   │   └── results/
│   │   ├── hooks/
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   └── types.ts
│   │   └── styles/
│   │       └── globals.css
│   └── public/
│
├── vendor/
│   ├── sketchup-mcp/            # Fork mhyrr
│   └── autocad-mcp/             # Fork puran-water
│
├── sketchup-plugin/
│   └── design_office_extensions.rb  # Extensions propriétaires
│
├── docs/
│   ├── DEMO_SCRIPT.md           # Script vidéo 3 min
│   ├── USE_CASE.md              # Cas d'usage Lumen
│   ├── ARCHITECTURE.md
│   └── HACKATHON_SUMMARY.md
│
└── scripts/
    ├── setup.ps1                # Setup Windows
    ├── run_dev.ps1              # Lancement dev
    └── package_demo.ps1         # Package soumission
```

---

## 5. Cas d'usage fictif verrouillé (utiliser partout dans la démo)

**Client fictif** : **Lumen**, startup fintech française basée à Paris, 120 employés, croissance +40% sur 24 mois.

**Brief en langage naturel** (hardcoder comme exemple par défaut dans le frontend) :

```
Lumen, startup fintech, 120 personnes aujourd'hui, 170 projetées d'ici 24 mois.
Politique de présence : 3 jours au bureau, 2 télétravail, équipes tech largement en pair programming.
Culture plat, transparente, forte identité par équipe (produit, tech, data, growth, ops).
Modes de travail dominants : collaboration synchrone, design sprints, pair programming, 
focus profond pour les devs, rituels all-hands hebdomadaires.
Demandes explicites : beaucoup d'espaces collab, cafétéria centrale pas reléguée, 
zones calmes pour concentration, pas d'open space géant indifférencié, 
expression de la marque forte.
Surface disponible : 2400 m² utiles sur 2 niveaux reliés par escalier central.
Budget Cat B : 2,2 M€ HT.
Climat : Paris, façade sud donnant sur rue, façade nord donnant sur cour intérieure.
```

**Plan PDF** : si aucun plan réel n'est fourni, génère-en un fictif pour les tests (rectangle 60m × 40m, colonnes tous les 7m, deux noyaux techniques ascenseurs, escalier central).

Utilise ce cas d'usage partout : exemples frontend, données seed, fixtures de tests.

---

## 6. Orchestration Managed Agents — 3 niveaux structurés

Pièce centrale pour le prix "Best use of Managed Agents". Chaque niveau doit avoir un gain métier réel, pas du parallélisme cosmétique.

### Niveau 1 — Programme Synthesizer (Surface 1)

Quand l'utilisateur soumet un brief :

**3 sub-agents en parallèle** :
- **Agent Effectifs** : calcule la matrice d'espaces (postes, salles, collab, support) avec ratios argumentés
- **Agent Benchmarks** : cherche dans `data/benchmarks/` les ratios applicables (Leesman, études industry) et les cite
- **Agent Contraintes** : identifie contraintes réglementaires (PMR, ERP, code du travail) et climatiques

Puis un **agent consolidateur** merge les 3 sorties en un programme fonctionnel cohérent, avec sources inline.

### Niveau 2 — Variant Generator (Surface 2)

Après lecture du plan PDF, **3 sub-agents en parallèle** génèrent 3 variantes aux partis pris différents :

- **Variante "Villageois"** : zones collab centrales, quartiers par équipe, beaucoup de tiers-lieux
- **Variante "Atelier"** : postes en façade lumineuse, concentration prioritaire, salles de réunion au centre
- **Variante "Hybride flex"** : ratio flex 0.7, zones neutres reconfigurables, expression marque forte

Chaque sub-agent pilote SketchUp MCP indépendamment pour construire sa variante. Un **agent Reviewer** valide chacune contre les contraintes (surfaces, PMR, distances issues de secours).

### Niveau 3 — Research & Cite (Surface 3)

Pour chaque choix de design de la variante retenue, **un agent récupère 2-4 sources scientifiques ou réglementaires** :

- Littérature scientifique (acoustique open space, neuroarchitecture biophilic, ergonomie POS)
- Benchmarks Leesman / Gensler Workplace Survey
- Réglementation française (arrêté 25 juin 1980 ERP, code du travail)

Résultat : argumentaire client avec citations vérifiables.

### Implémentation technique

- Utiliser l'API Anthropic avec `parallel_tool_calls` quand pertinent
- Module `backend/app/agents/orchestrator.py` expose `run_parallel_agents(agents, context)` réutilisable
- Chaque agent a son système prompt dans `backend/app/prompts/agents/`
- Tous les agents loguent leurs décisions dans une trace visible côté frontend (prix "Keep Thinking")

---

## 7. MCP Resources métier (pattern Keep Thinking)

Claude consulte ces resources **à la volée** pendant ses raisonnements. Elles doivent être :

- Chargées via pattern MCP standard (URI `design://...`)
- Écrites en Markdown structuré
- Riches et sourcées

**Resources à créer dans `backend/app/data/resources/`** :

1. `design://office-programming` — ratios métier, benchmarks Leesman, Gensler, HOK
2. `design://acoustic-standards` — R'w, bruits de fond, Sabine, normes NF S 31-080, WELL
3. `design://pmr-requirements` — arrêté français PMR, circulations 1.40m/1.50m, sanitaires
4. `design://erp-safety` — ERP type W : issues de secours, désenfumage, compartimentage
5. `design://ergonomic-workstation` — NF EN 527, hauteurs, espaces, éclairage 500 lux
6. `design://neuroarchitecture` — biophilic design Browning 14 patterns, restorative environments
7. `design://flex-ratios` — politiques flex, ratios 0.6-1.0, benchmarks par culture
8. `design://furniture-brands` — catalogues Steelcase, MillerKnoll, Vitra, Haworth, Kinnarps
9. `design://collaboration-spaces` — typologies phone booth, huddle 4p, medium 8p, boardroom
10. `design://biophilic-office` — plantes, matériaux naturels, études Heerwagen, Kellert

Chaque fichier fait 50-200 lignes, avec sources en bas, et inclut des chiffres concrets exploitables par Claude.

**Ces resources doivent être réelles et vérifiables, pas inventées.** Si tu n'es pas sûr d'une source, marque-la `[À VÉRIFIER]` et Saad la corrigera au réveil.

---

## 8. Bibliothèque mobilier (dimensions réelles)

Fichier `backend/app/data/furniture/catalog.json`, couvre minimum 40 produits :

- postes de travail (Steelcase Migration SE, MillerKnoll Jarvis, Vitra Tyde...)
- tables de réunion (Vitra Eames Segmented, Herman Miller Everywhere...)
- chaises (Steelcase Series 1, Herman Miller Aeron, Vitra ID Chair...)
- phone booths (Framery One, Poppin Hush...)
- huddle rooms pré-meublées
- seating lounge
- cloisons mobiles

Structure type :

```json
{
  "id": "steelcase_migration_se",
  "brand": "Steelcase",
  "model": "Migration SE",
  "type": "desk_electric",
  "dimensions_mm": { "width": 1600, "depth": 800, "height_min": 650, "height_max": 1250 },
  "footprint_m2": 1.28,
  "recommended_clearance_mm": { "front": 1200, "side": 900 }
}
```

Dimensions réelles vérifiées (pas inventées). Sources : sites officiels fabricants.

---

## 9. Pipeline de parsing PDF

**Approche hybride, Opus 4.7 Vision HD prioritaire** :

1. **Vision Claude Opus 4.7 HD (outil principal)** : image rendue du plan à 2576px, Claude extrait :
   - Contour de l'enveloppe (polygone)
   - Colonnes (coordonnées + rayon)
   - Noyaux techniques (gaines, WC, ascenseurs)
   - Fenêtres en façade (positions, longueurs)
   - Portes principales
   - Escaliers
   - Échelle si cotation visible
   - Labels texte (noms de pièces, cotations)
2. **PyMuPDF en complément** : si le PDF est vectoriel, extraction des polylignes, rectangles, cercles comme validation croisée
3. **Fusion** : un agent compare les deux sorties, résout les conflits, produit un `FloorPlan` (Pydantic)

Le `FloorPlan` est transmis au SketchUp MCP pour reconstruction 3D.

**Claude Vision est le cerveau de ce pipeline.** C'est ce qui fait gagner "Creative Opus 4.7 Exploration".

---

## 10. Extensions propriétaires SketchUp MCP

Dans `sketchup-plugin/design_office_extensions.rb`, ajouter au fork mhyrr ces fonctions Ruby haute-niveau :

- `create_workstation_cluster(position, orientation, count, row_spacing, product_id)` — rangée de postes avec mobilier réel
- `create_meeting_room(corner1, corner2, capacity, name)` — salle cloisonnée + table + chaises + écran
- `create_phone_booth(position, product_id)` — phone booth Framery ou équivalent
- `create_partition_wall(start, end, type)` — cloison acoustique typée (placo, vitrée, semi-vitrée)
- `create_collab_zone(bounding_box, style)` — zone collab avec lounge, plantes, claustras
- `apply_biophilic_zone(bounding_box)` — plantes, bois, couleurs naturelles
- `validate_pmr_circulation(paths)` — vérifie circulations ≥1.40m
- `compute_surfaces_by_type()` — retourne dict surfaces par typologie

Chaque fonction exposée comme tool MCP via l'API Python de mhyrr.

---

## 11. Design UI premium — directive stricte

**La cible (architectes d'intérieur) est visuellement exigeante. Une UI moche tue le projet.**

### Références visuelles
Inspiration : **Linear, Arc browser, Things 3, Framer, Vercel**. Jamais de SaaS générique bleu Salesforce.

### Palette
- Fond principal : `#0E0E0C` (noir profond chaud) ou mode clair `#FAF9F5`
- Texte principal : `#ECEBE4` (blanc cassé sur sombre) / `#181816` (sur clair)
- Accent unique : `#C9694E` (terracotta) OU `#A68A5B` (ochre) — choisis-en un et tiens-le
- Gris neutres : échelle de 8 tons

### Typographie
- Titres : **Fraunces** (serif, via Google Fonts — Editorial New est payant)
- Corps : **Inter**
- Mono (code, cotations) : **JetBrains Mono**

### Composants
- Pas de shadcn/ui générique. Tailwind + primitives custom Radix pour l'accessibilité.
- Coins arrondis cohérents : `rounded-lg` (8px) partout, `rounded-2xl` pour cartes importantes
- Ombres subtiles, max `shadow-lg` avec blur doux
- Transitions `ease-out` 200-300ms, Framer Motion pour entrées et changements d'état
- Aucune emoji dans l'UI. Icônes Lucide React ou SVG custom.
- Toasts discrets, pas de couleurs agressives

### Layouts
- Grille généreuse, blancs larges (24-48px gap)
- Pas de sidebar gauche lourde. Navigation horizontale minimaliste en haut.
- Viewer 3D prend 60-70% de l'écran sur Test Fit et Justify
- Mobile fonctionne mais priorité desktop (démo en desktop)

### 4 écrans principaux

**Landing (`/`)** : titre éditorial type "Archoff. Your AI co-architect for office interiors." + hero visuel statique + CTA "Start a project" + "How it works" en 4 étapes.

**Brief (`/brief`)** : gros champ texte style éditeur, exemple Lumen pré-rempli en placeholder. Bouton "Generate program". Pendant calcul : animation discrète des 3 sub-agents au travail. Résultat : programme en tableau élégant, sources en footnotes hover.

**Test Fit (`/testfit`)** : à gauche zone upload PDF + résumé programme, à droite viewer 3D avec onglets 3 variantes. En bas : chat "Dis à Archoff de modifier la variante". Sortie SketchUp en screenshots haute qualité refreshés.

**Justify (`/justify`)** : variante retenue à gauche en 3D, à droite document argumentaire avec citations cliquables. Bouton "Generate client PDF".

**Export (`/export`)** : bouton central "Generate technical DWG" avec état (generating / ready / error). Une fois prêt : preview DWG, bouton download, bouton "Open in AutoCAD" qui déclenche File IPC.

---

## 12. Points de blocage nécessitant Saad (BLOCKERS.md)

À son réveil, Saad devra :

1. **Installer SketchUp Pro** (trial 7j : https://www.sketchup.com/try-sketchup)
2. **Installer AutoCAD** (trial 30j LT 2024+ : https://www.autodesk.com/products/autocad-lt/free-trial)
3. **Charger l'extension SketchUp MCP** : copier `vendor/sketchup-mcp/sketchup_plugin/*` dans dossier Plugins SketchUp, redémarrer
4. **Charger le LISP AutoCAD MCP** : dans AutoCAD, APPLOAD, charger `vendor/autocad-mcp/lisp-code/mcp_dispatch.lsp`, ajouter au Startup Suite
5. **Valider le rendu visuel final** : les 4 écrans tournent, fonctionnent, sont beaux
6. **Enregistrer la démo vidéo** : Saad le fait lui-même avec son scénario

Tout le reste doit être buildable sans lui. Si tu rencontres un blocage imprévu, documente-le dans `BLOCKERS.md` avec contexte complet.

---

## 13. Ordre de build strict

Exécute dans cet ordre. **Ne passe pas au N+1 si le N n'a pas de test qui passe.**

### Phase 1 — Fondations (objectif 2h)
1. Créer le monorepo, init git, .gitignore, LICENSE MIT
2. Scaffolder le backend FastAPI avec endpoint `/health`
3. Scaffolder le frontend Vite + React + Tailwind avec landing minimum viable
4. Fork les 2 MCPs dans `vendor/` (git clone puis désactivation des .git internes)
5. Créer `BUILD_LOG.md` et `BLOCKERS.md`

### Phase 2 — Surface 1 Brief (objectif 3h)
1. Wrapper Claude client avec gestion tokens et logging
2. Créer les 10 MCP Resources Markdown dans `backend/app/data/resources/` (contenu réel sourcé)
3. Créer `backend/app/data/benchmarks/` avec ratios métier JSON
4. Implémenter orchestration Niveau 1 (3 sub-agents + consolidateur)
5. Endpoint `POST /api/brief/synthesize`
6. Frontend `/brief` avec exemple Lumen pré-rempli

### Phase 3 — Pipeline PDF + Surface 2 Test Fit (objectif 5h)
1. Pipeline parsing hybride (Vision HD prioritaire + PyMuPDF complément)
2. Modèle `FloorPlan` Pydantic
3. Extensions propriétaires SketchUp (design_office_extensions.rb)
4. Bibliothèque mobilier catalog.json (40+ produits)
5. Orchestration Niveau 2 (Variant Generator × 3 + Reviewer)
6. Endpoint `POST /api/testfit/generate`
7. Endpoint chat `POST /api/testfit/iterate`
8. Frontend `/testfit` avec viewer screenshots

### Phase 4 — Surface 3 Justify (objectif 2h)
1. Orchestration Niveau 3 (Research & Cite)
2. Endpoint `POST /api/justify/generate`
3. Génération PDF client (ReportLab)
4. Frontend `/justify`

### Phase 5 — Surface 4 Export (objectif 2h)
1. Client AutoCAD MCP (ezdxf prioritaire, File IPC bonus)
2. Génération DWG A1 avec cartouche, cotations, layers métier (AGENCEMENT, MOBILIER, COTATIONS, CLOISONS, CIRCULATIONS)
3. Endpoint `POST /api/export/dwg`
4. Frontend `/export`

### Phase 6 — Polish UI (objectif 3h)
1. Charger Fraunces + Inter + JetBrains Mono
2. Appliquer palette stricte sur tous les écrans
3. Framer Motion sur transitions
4. États loading élégants (skeleton, pas spinners génériques)
5. Responsive desktop prioritaire
6. Landing finale avec hero visuel

### Phase 7 — Documentation et démo (objectif 2h)
1. README.md complet (architecture, captures, setup)
2. `docs/DEMO_SCRIPT.md` — script minute par minute
3. `docs/HACKATHON_SUMMARY.md` — written summary soumission
4. `scripts/run_dev.ps1` qui lance tout en une commande

### Phase 8 — Bonus (si temps)
- Tests E2E Playwright
- Export PowerPoint argumentaire via python-pptx
- Mode sombre/clair toggle
- Prise en compte façade N/S pour orientation postes

---

## 14. Règles de travail en boucle autonome

À chaque itération :

1. Avant de coder, réfléchis avec thinking xhigh
2. Implémente un module ou une feature de la phase en cours
3. Écris un test qui vérifie (pytest backend, Vitest frontend)
4. Lance le test. S'il échoue, itère jusqu'à réussite.
5. Commit descriptif : `feat(surface-1): add programme synthesis with 3-agent orchestration`
6. Mets à jour `BUILD_LOG.md` (phase courante, durée restante estimée)
7. Passe au suivant

**Anti-gaspillage** :
- Pas de sur-ingénierie. Code clair > code clever.
- Pas de dépendance lourde inutile. 50 lignes custom > lib de 500MB.
- Pas de code mort. Tout sert à la démo.
- Commit fréquent (chaque feature testée).

**Qualité** :
- Type hints Python partout.
- TypeScript strict frontend.
- Pas de `any` TS, pas de `# type: ignore` sans raison.
- Imports organisés (isort / Biome).
- Lint avant commit.

**Échec** :
- Dépendance qui ne s'installe pas : fallback ou documente dans BLOCKERS.md
- Test qui échoue après 3 itérations : ajoute `TODO(saad): investigate failure X`, passe à la suite
- MCP qui ne répond pas : crée un mock simulant les réponses pour que le reste soit testable, documente dans BLOCKERS.md

---

## 15. Stack versions

- Python 3.11+
- FastAPI 0.115+
- `anthropic` Python SDK dernière version
- Pydantic v2
- Node 20 LTS
- React 18, Vite 5, TypeScript 5.4+
- Tailwind 3.4+, Framer Motion 11+
- PyMuPDF (fitz) dernière stable
- ezdxf 1.3+

---

## 16. Comportement API Claude Opus 4.7

Modèle : `claude-opus-4-7`

**Paramètres par défaut** :
- `max_tokens` : 8192 pour réponses structurées, 16384 pour raisonnements longs
- Tool use : `parallel_tool_calls` activé quand pertinent
- Temperature : 0.7 pour créatif (variantes), 0.2 pour structurel (parsing, export)

**Usage Vision HD** :
- Plans en PNG 2576px maximum
- Prompt système explicite sur le rôle d'architecte expert
- Toujours demander un JSON structuré en sortie pour les géométries

**Gestion tokens** :
- Logger chaque appel dans `backend/logs/api_calls.jsonl`
- Si rate limit approche, backoff exponentiel
- Budget estimé nuit : 300k tokens input + 100k tokens output. Alerter si dépasse.

---

## 17. Démo vidéo — structure à respecter

Script pressenti (oriente les UI states) :

```
00:00–00:15  Hook : "Un space planner passe 3 semaines à faire un test fit.
              Avec Archoff, c'est 3 minutes."
00:15–00:35  Surface 1 : brief Lumen collé → programme chiffré apparait,
              3 agents visibles au travail
00:35–01:15  Surface 2 : upload PDF plan → Claude lit (vision HD)
              → 3 variantes 3D se construisent en parallèle dans SketchUp
01:15–01:45  Itération langage naturel : "agrandis la boardroom, pousse les postes
              vers la façade sud" → modification en live SketchUp
01:45–02:15  Surface 3 : bouton Justify → argumentaire sourcé apparait
              (acoustique, biophilie, flex ratio) avec citations
02:15–02:45  Surface 4 : bouton Export → AutoCAD s'ouvre avec DWG coté A1
02:45–03:00  Outro : logos, GitHub, "Built with Opus 4.7"
```

Tous les écrans doivent être beaux sans data, avec data, et pendant loading.

---

## 18. Written summary (docs/HACKATHON_SUMMARY.md)

Structure :

- **Problem** : space planners passent 2-8 semaines en programming et 1-3 semaines en test fit. Pas d'IA sérieuse sur ce métier.
- **Solution** : Archoff augmente les 4 phases critiques.
- **Creative Opus 4.7** : Vision HD sur plans, orchestration Managed Agents à 3 niveaux, MCP Resources métier consultées à la volée (Keep Thinking).
- **MCP** : double MCP CAD (SketchUp + AutoCAD), rarement vu en combiné.
- **Tech** : FastAPI, React, MCPs forkés et étendus.
- **Business impact** : marché ~7M architectes d'intérieur mondial, agences type Gensler (6000+ pers), brokers (JLL, CBRE).
- **Future** : Revit MCP (design development), passerelle BIM IFC, intégration outils RH pour données occupation.

---

## 19. Commande d'exécution

Quand Saad lance `claude-code` avec ce prompt :

1. Lire ce document complet
2. Créer `BUILD_LOG.md` avec timestamp démarrage
3. Créer `BLOCKERS.md` vide
4. Commencer par **Phase 1**, ne pas s'arrêter jusqu'à un vrai blocage
5. Toutes les 30 min, maj `BUILD_LOG.md` avec estimation avancement

**Commande loop** : `/loop` — tu itères jusqu'à ce qu'une phase soit complète, puis tu passes à la suivante.

---

## 20. Note finale

Tu as carte blanche sur les choix d'implémentation tant qu'ils respectent :
- l'architecture section 3
- les 4 surfaces fonctionnelles
- les 3 niveaux d'orchestration agents
- le design UI section 11
- le cas d'usage Lumen

Tu peux enrichir, simplifier, optimiser. Pas dévier de la direction produit sans justification écrite dans `BUILD_LOG.md`.

**L'objectif** : Saad se réveille, lance `./scripts/run_dev.ps1`, installe SketchUp et AutoCAD, et voit Archoff fonctionner bout-en-bout sur le cas Lumen.

Bon build. Tu es responsable du résultat. Go.
