# iter-31 — Investigation : markdown brut + scroll cassé

Saad a signalé deux régressions UX visibles à 24h de la démo. Cette
note documente l'investigation, l'évidence empirique recueillie en
live (preview-eval contre le frontend en marche), et les root-causes
confirmées. Les fixes suivront en commits atomiques.

---

## Bug 1 — Markdown brut affiché dans les cards et drawers

### Symptôme

Sur `/justify`, les cards de la grille principale ET le drawer
ouvert sur une carte affichent les marqueurs Markdown littéralement :

- `**type W**`, `**catégorie 5**`, `**arrêté 8 décembre 2014**` —
  les astérisques sont visibles, le bold n'est pas appliqué
- `` `[À VÉRIFIER ...]` `` — les backticks encadrent visuellement
  le code inline

### Évidence empirique

Données injectées via `preview_eval` dans le projectState (un
argumentaire fictif imitant le style LLM réel), puis page rechargée :

```
cardCount: 4
hasStarStar: true
hasBacktick: true
tldrSamples: [
  "I.I. Acoustic strategy**Rw ≥ 44 dB** project rooms ...",
  "II.II. Biophilic & neuroPlants reduce stress 8-12% per **Human Spaces 2023**.",
  "III.III. What the regulation says ERP **type W**, single ground-floor plateau...",
]
```

Inspection du `<code>` inline dans le drawer body (parsé par
`ReactMarkdown` + `prose`) :

```
codeBeforeContent: "\"`\""
codeAfterContent: "\"`\""
codeText: "[À VÉRIFIER catégorie exacte une fois l'effectif public déclaré]"
```

### Diagnostic — deux causes distinctes

**Cause A — tldrs rendus sans parser.**
- `frontend/src/routes/Justify.tsx:280` — `<div>{s.tldr}</div>` dans
  la grille de cards
- `frontend/src/routes/Justify.tsx:498` — `<p>{card.tldr}</p>` dans
  le drawer
- Le `parseJustifyCards` (`adapters/justifySections.ts`) extrait la
  première phrase du body verbatim, en conservant les `**` et `` ` ``
  émis par le LLM.

Sur `/brief`, les tldrs passent par `stripInlineMarkdown(s.tldr)`
(`Brief.tsx:361, 670`) — donc les astérisques disparaissent, mais le
bold est aussi perdu. Symétrie incomplète : éditorial sur Brief mais
lourdement lossy. Pas un bug visible mais un appauvrissement.

**Cause B — Tailwind Typography ajoute des backticks via pseudo-éléments.**
Le plugin `@tailwindcss/typography` (`prose` class) injecte par
défaut :

```css
.prose code::before { content: "`"; }
.prose code::after  { content: "`"; }
```

Donc même quand `ReactMarkdown` convertit `` `foo` `` en `<code>foo</code>`,
le rendu affiche `` `foo` ``. C'est un comportement upstream connu et
documenté.

Le body de `/justify` drawer (`Justify.tsx:503` — wrappé dans `prose`)
et tous les autres usages de `prose` dans le repo sont touchés :
- `Brief.tsx:675` — drawer body (programme)
- `Justify.tsx:502` — drawer body (argumentaire)
- `globals.css:343` — `.prose-chat` (ChatPanel)

### Sites supplémentaires d'output LLM rendu raw

Hors tldrs, deux autres sites rendent du texte LLM via `{strategy}` :

- `MoodBoard.tsx` — `PlantingPanel` rend `selection.planting.strategy`
- `MoodBoard.tsx` — `LightPanel` rend `selection.light.strategy`

Pas confirmé en live qu'ils contiennent `**`, mais le LLM peut en
émettre. À fixer par cohérence.

### Stratégie de fix

1. Petit composant `<InlineMarkdown>` réutilisable qui rend du
   markdown via `react-markdown` mais retire le wrapping `<p>` (sinon
   `<p><div></div></p>` invalide HTML quand utilisé dans des contextes
   inline). Approche : `components={{ p: Fragment-like }}`.
2. Remplacer chaque `{tldr}` / `{strategy}` raw par
   `<InlineMarkdown>{...}</InlineMarkdown>`.
3. Supprimer `stripInlineMarkdown` des Brief tldrs (Brief.tsx:361,
   670) et utiliser `<InlineMarkdown>` à la place — restaure le bold
   éditorial.
4. Dans `tailwind.config.ts`, étendre la config typography pour
   override `code::before` et `code::after` à `content: "none"`. Fix
   global, un seul point de contrôle. ChatPanel garde son styling
   `prose-code:bg-mist-100 prose-code:px-1` pour la chip-like
   apparence.

---

## Bug 2 — Scroll cassé sur drawers + modals

### Symptôme

- Modal `New Project` (créé depuis `/project`) : impossible de
  scroller jusqu'au bouton "Create project" en bas
- Drawer `/justify` (clic sur card) : contenu coupé, scroll inopérant
- Drawer `/brief` (clic sur card programme) : idem
- Drawer `/moodboard` (clic Materials/Furniture/Planting/Light) : idem

### Évidence empirique

Drawer `/justify` ouvert à 1280×720 :

```
asideClass: "fixed inset-y-0 right-0 z-[90] flex min-h-0 flex-col overflow-hidden bg-canvas"
asideHeight: 869.03px
asideTop: 149px
viewport: { w: 1280, h: 720 }
innerScrollHeight: 1130
innerClientHeight: 869
innerOverflows: true
```

Avec `position: fixed; inset-y-0` (top: 0, bottom: 0), l'aside DEVRAIT
faire 720px et démarrer à top=0. **Au lieu de cela**, top=149 et
height=869 — la totalité du drawer dépasse de 298px sous le viewport.
Le scroll interne fonctionne (`scrollTop=200` programmatique réussit)
mais l'utilisateur ne le perçoit pas : la zone visible reste fixe et
le bas du drawer est invisible.

Modal `New Project` à 1280×720 :

```
top: 147
height: 1135.98
bottom: 1282.98
viewport: { w: 1280, h: 720 }
```

Le modal entier déborde de 562px sous le viewport. Le inner
`max-h-[calc(100vh-96px)] overflow-auto` calcule sa hauteur contre le
viewport (`100vh = 720px`), mais comme l'overlay est shifté de 147px
vers le bas, le panneau interne dépasse aussi.

### Diagnostic — root cause unique

Scan des ancêtres du `<aside role=dialog>` à la recherche de
propriétés CSS qui créent un *containing block* pour
`position: fixed` (transform, filter, perspective, will-change,
contain) :

```
[
  {
    tag: "MAIN",
    cls: "mx-auto max-w-[1440px] px-6 pb-28 pt-8 animate-fade-rise md:px-12",
    offending: ["transform=matrix(1, 0, 0, 1, 0, 6)"]
  }
]
```

**Le `<main>` global de `App.tsx` porte `animate-fade-rise`**, dont
les keyframes (`tailwind.config.ts`) sont :

```
"0%":   { opacity: "0", transform: "translateY(6px)" }
"100%": { opacity: "1", transform: "translateY(0)"   }
```

Avec `animation-fill-mode: both` la valeur finale persiste. Mais
`translateY(0)` reste un `transform` non-`none` → la spec CSS dit
qu'**un ancêtre avec `transform` ≠ `none` devient le containing
block des descendants `position: fixed`**, à la place du viewport.

Donc `inset-y-0` (top:0, bottom:0) sur l'aside est interprété par
rapport au `<main>` (qui a top=149, height=...), pas par rapport au
viewport. Le résultat : l'aside est positionné dans une "boîte
parent" qui dépasse de l'écran, et le scroll interne ne sauve rien
parce que la zone visible du drawer reste celle qui chevauche le
viewport.

Note : comme l'animation est `both` et dure 360ms, le matrix
observé (`translateY=6`) suggère que la mesure a été prise avant que
l'animation se termine. Mais même après terminaison à `translateY(0)`,
le `transform` reste défini → containing block toujours cassé. Le
problème est donc permanent, pas seulement pendant l'animation.

### Stratégie de fix

**Portal au document.body**. C'est la solution canonique React/CSS
pour les modals/drawers : ils sortent du sous-arbre du `<main>` via
`createPortal` et atterrissent en sibling de `<App>`. Aucun ancêtre
transformé → `position: fixed` retrouve son comportement viewport-
relatif.

Avantages :
1. Fix global pour les deux primitives `Drawer` + `Modal` — toutes
   les pages héritent automatiquement
2. Pas de régression sur l'animation `fade-rise` (gardée intacte)
3. Sémantique plus correcte : un drawer / modal est document-level,
   pas subtree-level
4. Tous les futurs usages de Drawer/Modal sont protégés

Alternatives écartées :
- Retirer `transform` de `animate-fade-rise` → casserait le ressenti
  éditorial de chaque arrivée de page
- `position: absolute` sur l'aside → idem mauvais (containing block
  toujours mauvais)
- Override `inset-y-0` avec `style={{top: 0, bottom: 0}}` directs →
  ne change rien (top:0 reste relatif au containing block transformé)

---

## Plan d'exécution

### Commit 1 — Bug 1 (markdown rendering)

1. Crée `frontend/src/components/ui/InlineMarkdown.tsx` — wrapper
   `react-markdown` avec `components.p = Fragment` pour éviter
   `<p><div></div></p>` invalide.
2. Étends `tailwind.config.ts` avec
   `typography.DEFAULT.css['code::before']={content:'none'}` (idem
   `::after`).
3. Remplace dans `Justify.tsx:280` et `:498` les `{...tldr}` raw par
   `<InlineMarkdown>{...}</InlineMarkdown>`. Change le wrapper outer
   `<p>` du drawer en `<div>` pour rester valide HTML.
4. Remplace `stripInlineMarkdown` par `<InlineMarkdown>` dans
   `Brief.tsx:361` et `:670`.
5. Idem `MoodBoard.tsx` : `PlantingPanel` strategy + `LightPanel`
   strategy.
6. Vérifie `prose-chat` dans `globals.css` reste lisible (la chip
   `bg-mist-100 px-1` autour du code suffit pour le distinguer du
   prose body, sans backticks).

### Commit 2 — Bug 2 (Drawer + Modal portal)

1. Modifie `Drawer.tsx` : wrappe le retour dans `createPortal(...,
   document.body)`. Garde le SSR-safe guard (`typeof document !==
   "undefined"`).
2. Modifie `Modal.tsx` : idem.
3. Toast et autres overlays ne sont pas concernés (ne dépendent pas
   du containing block du `<main>` car leur z-index est très haut et
   ils sont déjà document-level dans la pratique).

### Vérification live (avant gates)

- `/justify` : ouvre une card → drawer scrolle correctement,
  asideTop=0, asideHeight=720
- `/brief` : drawer programme scrolle
- `/moodboard` : drawer Materials scrolle, images visibles
- `/project` → New project modal : scroll jusqu'au bouton Create
- Drawer body `/justify` : pas de backticks visibles autour des
  inline code spans
- Cards `/justify` : pas de `**` visibles, bold appliqué

### Gates

- `pytest -q` reste à 176+
- `vitest run` reste à 51+
- `tsc --noEmit` clean
- Aucune régression sur le mood board demo mode (toujours pas de
  fal.ai call)

### Risques / non-régression

- **Portal + body-scroll lock** : `Drawer` et `Modal` mettent déjà
  `body.style.overflow=hidden` quand ouverts. Avec portal, ce
  comportement est inchangé (le body est toujours le body).
- **z-index inchangé** : `z-[80]` backdrop, `z-[90]` aside, `z-[95]`
  modal restent valides en portail.
- **Animation fade-rise sur les pages** : pas touchée. Les drawers
  ont leur propre animation transform translateX qui reste sur
  l'aside, dans le portail — pas de conflit.
