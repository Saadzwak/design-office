# iter-24 — SketchUp rendering desync : investigation report

**Date** : 2026-04-24
**Investigateur** : Claude Code (via `/loop` autonome)
**Scope** : Phase 1 (investigation) — aucune modification de code.
**Decision point** : attente du "Go Phase 3 fix" de Saad avant tout patch.

---

## A. Diagnostic exhaustif

### Contexte des 3 bugs signalés

Saad a monté un projet "Nordlight Studio" (Bâtiment A haussmannien, 6 lots à
reconvertir), uploadé le PDF, lancé "Generate macro-zoning". Résultat :

1. Les 3 cards variantes affichent un **rectangle rayé** avec le placeholder
   `SKETCHUP ISO · [NOM]` — aucune image.
2. Dans Network, les requêtes `/sketchup/sketchup_variant_*.png` **retournent
   du contenu (200 OK)**, et ouvrir ces URLs dans un onglet affiche bien une
   PNG iso SketchUp.
3. SketchUp ouvert sur son poste montre un modèle 3D "éparpillé" qui ne
   correspond à aucune des 3 variantes. Les images servies ressemblent à du
   Lumen (60×40m), pas à Nordlight (bâtiment haussmannien).

### Preuves techniques

#### Preuve 1 — Les fixtures sont figées au 23-avril

```
$ ls -la frontend/public/sketchup/
drwxr-xr-x ...
-rw-r--r-- 238498 Apr 23 02:15 sketchup_variant_atelier.png
-rw-r--r-- 289704 Apr 23 02:14 sketchup_variant_villageois.png
-rw-r--r-- 245383 Apr 23 02:15 sketchup_variant_hybride_flex.png
-rw-r--r-- … (+ 18 variantes d'angles : iso_ne, iso_nw, iso_se, iso_sw,
                top_down, eye_level — 6 angles × 3 styles)
```

21 fichiers PNG, **tous datés du 23 Apr entre 02:14 et 02:15**. Gelés depuis
2 jours. Servis en statique par Vite (`public/sketchup/` est la racine
publique). Aucun rafraîchissement automatique quand l'utilisateur génère
un nouveau projet.

Vérif live :
```
$ curl -s -o /dev/null -w "%{http_code} size=%{size_download}\n" \
    http://localhost:5173/sketchup/sketchup_variant_villageois.png
200 size=289704
```
Les PNGs sont bien distribuées par Vite, contenu intact.

#### Preuve 2 — Le composant VariantCard charge l'URL statique en dur

`frontend/src/routes/TestFit.tsx:598`

```tsx
const sketchupUrl = `/sketchup/sketchup_variant_${v.id}.png`;
```

`v.id` est un `VariantStyle` = `"villageois" | "atelier" | "hybride_flex"`.
L'URL construite pointe donc **systématiquement vers la fixture statique
Vite**, jamais vers un endpoint backend qui capturerait un render frais du
projet en cours.

#### Preuve 3 — CSS qui invalide l'attribut `hidden`

`frontend/src/routes/TestFit.tsx:659-677` — le composant utilise
HTML5 `<div hidden>` pour masquer le placeholder par défaut, avec un
`onError` qui révèle le placeholder si l'img échoue.

`frontend/src/styles/globals.css:300-317` :

```css
.placeholder-img {
  background: repeating-linear-gradient(135deg, ...); /* hachures */
  display: flex;        /* ← ÉCRASE [hidden] */
  align-items: center;
  justify-content: center;
  …
}
```

**Bug CSS classique** : `display: flex` dans la classe l'emporte sur
`[hidden]` (qui n'est qu'un `display: none` d'user-agent). Résultat : le
placeholder est **toujours rendu**, même quand l'img charge avec succès.

Combiné à `className="absolute inset-0"`, le div se positionne
au-dessus de l'`<img>` (qui, elle, charge correctement). L'utilisateur voit
le motif hachuré + "SKETCHUP ISO · [NAME]" en lieu et place de l'image
qui est pourtant présente dans le DOM et dans Network. Symptôme BUG 1 + 2.

#### Preuve 4 — Le backend ne capture pas de shot au `/generate` initial

`backend/app/surfaces/testfit.py:566` (chemin macro-zoning) :

```python
shot = facade.screenshot(view_name="iso")   # ← PAS de out_path !
…
screenshot_paths=[shot] if shot else [],
```

Regarde ce que fait `SketchUpFacade.screenshot` dans
`backend/app/mcp/sketchup_client.py:427-441` :

```python
def screenshot(self, view_name: str = "iso", out_path: str | None = None) -> str:
    if out_path is not None:
        response = self.backend.call("screenshot", view_name=view_name, path=out_path)
        return response.get("path") or out_path
    response = self.backend.call("screenshot", view_name=view_name)
    return response.get("path", "")    # ← sans path: SketchUp ne sauvegarde rien d'utilisable
```

Sans `out_path`, la méthode transite juste `view_name` au MCP. Sur le
RecordingMock (`:36-43`), on récupère une string `sketchup-mock/NNN.png`
qui n'existe pas sur disque. Sur le TcpJsonBackend, pareil — le MCP mhyrr
n'écrit rien car on ne lui a pas dit où. `shot` contient donc soit un
chemin mock inexistant, soit une string vide. Le champ
`VariantOutput.screenshot_paths` arrive au frontend soit vide, soit
pointant vers un fichier fantôme. Résultat : **l'endpoint
`/api/testfit/screenshot/…` renvoie 404 pour les 3 variantes macro**.

#### Preuve 5 — `/iterate` capture correctement (seul bon point)

`backend/app/surfaces/testfit.py:1240-1250` :

```python
SKETCHUP_SHOTS_DIR.mkdir(parents=True, exist_ok=True)
shot_filename = f"{request.variant.style.value}_{uuid.uuid4().hex[:12]}.png"
shot_path = SKETCHUP_SHOTS_DIR / shot_filename
try:
    facade.screenshot(view_name="iso", out_path=str(shot_path))   # ← OK
except Exception:
    pass
…
if shot_path.exists() and shot_path.stat().st_size > 1024:
    screenshot_url = f"/api/testfit/screenshot/{shot_filename}"
```

Ici `out_path` est fourni, donc SketchUp écrit le PNG, et le backend
retourne une URL `/api/testfit/screenshot/atelier_XXX.png`. Vérif disque :
```
$ ls backend/app/out/sketchup_shots/ | cut -d_ -f1 | sort | uniq -c
   58 atelier      ← Saad a beaucoup itéré sur atelier
    1 hybride
    2 villageois
```
Donc le pipeline iterate **fonctionne**. Le dernier shot est du 24 Apr
14:10 — récent. Mais …

#### Preuve 6 — L'URL `/iterate` n'arrive jamais à l'affichage

`frontend/src/routes/TestFit.tsx:197, 234-235` :

```tsx
// 197: chargé dans le state local
live_screenshots: project.testfit?.live_screenshots ?? {},

// 234-235: stocké après /iterate
if (resp.screenshot_url) {
  setLiveScreenshot(active, resp.screenshot_url);
}
```

`live_screenshots` est stocké en localStorage (clé
`design-office.testfit.live_screenshots`, `projectState.ts:192`), mais
**le composant `VariantCard` (ligne 598) ne lit jamais ce state**. La
variable `sketchupUrl` est construite en dur à partir de `v.id`, point.

Même quand l'itération fournit une URL backend fraîche, `VariantCard`
continue d'afficher la fixture statique de 2 jours. Le state est écrit,
jamais lu par le composant visuel.

#### Preuve 7 — `VariantOutput.screenshot_paths` totalement ignoré

`frontend/src/lib/api.ts:183` : le type TS déclare `screenshot_paths: string[]`.
Recherche `grep -r "screenshot_paths" frontend/src/` :

```
frontend/src/lib/api.ts:183                       screenshot_paths: string[];
frontend/src/lib/adapters/__tests__/adapters.test.ts:200  screenshot_paths: [],
frontend/src/lib/adapters/__tests__/variantSort.test.ts:64 screenshot_paths: [],
```

3 occurrences — **aucune consommation côté composant**. Le champ est
défini dans le type, initialisé à `[]` dans les tests, et jamais lu.

#### Preuve 8 — PseudoThreeDViewer orphelin depuis iter-18h

`frontend/src/components/viewer/PseudoThreeDViewer.tsx` (334 lignes,
6 angles, dock de thumbnails, orbit slider) est présent sur disque.

```
$ git log --oneline --all -S "PseudoThreeDViewer" -- frontend/src/
b9b2e50 feat(testfit-macro): 3-card grid + FloorPlan2D + iterate + legend
762a55e feat(testfit): Micro-zoning tab + PseudoThreeDViewer integration
ace874d feat(viewer): 6-angle SketchUp captures + PseudoThreeDViewer
```

Le commit `ace874d` crée la feature. `762a55e` l'intègre dans
TestFit. **`b9b2e50` (iter-18h) réécrit entièrement TestFit autour du
MacroView / 3-card grid et supprime l'import de PseudoThreeDViewer
sans supprimer le fichier**. Le composant est devenu orphelin par
refonte silencieuse. Aucun import dans `frontend/src/` aujourd'hui.

Conséquence : la feature 6-angle qui servait précisément à montrer
plusieurs vues d'un même render SketchUp depuis le navigateur
(sans ouvrir SketchUp) a été perdue.

#### Preuve 9 — Multi-angle côté backend pas câblé au pipeline

`sketchup-plugin/design_office_extensions.rb` définit bien
`DesignOffice.capture_multi_angle_renders()` (iso_ne/iso_nw/iso_se/iso_sw/
top_down/eye_level).

`backend/scripts/capture_variant_angles.py` est un script **standalone**
qui appelle cette méthode Ruby. Il n'est **jamais invoqué** par
`/api/testfit/generate` ni `/api/testfit/iterate`. Le pipeline live ne
capture qu'**un seul iso** (quand `out_path` est fourni).

Donc même si on répare VariantCard pour pointer sur les URLs live,
on n'aura qu'**une image** par variante, pas 6. PseudoThreeDViewer
aurait besoin de 6 fichiers pour afficher le dock.

#### Preuve 10 — Désynchro SketchUp ↔ images servies

Les fixtures `/sketchup/*.png` sont des renders **Lumen** (60×40m, 9×6
grille de colonnes) générés le 23 Apr. Saad travaille aujourd'hui sur
Nordlight (Bâtiment A, plan haussmannien différent). Comme VariantCard
charge systématiquement les fixtures (Preuve 2), Saad voit **du Lumen**
pour un projet **Nordlight**. Pendant ce temps, SketchUp sur son poste
reçoit les commandes Nordlight (via `/iterate` ou via `/generate`
sans `out_path`), construit un truc, et ça apparaît "éparpillé" parce
que soit :
  - la construction a marché mais aucun capture n'a sauvegardé l'état
    (macro : pas de `out_path`), ou
  - des commandes de plusieurs runs consécutifs s'empilent sur la même
    scène SketchUp (pas de clear entre runs).

On a bien identifié un `facade.new_scene(name=…)` à `testfit.py:558`
mais :
```python
facade.new_scene(name=f"{client_name} — {style.value}")
```
Ce « new_scene » sur le MCP mhyrr n'est pas garanti de reset la scène ;
il peut juste créer un Scene Tab. À creuser au fix, mais ça expliquerait
l'aspect "empilé" que Saad observe. (Non vérifié en Phase 1 car
nécessiterait d'exécuter côté SketchUp.)

---

## B. Causes racines, par bug

### BUG 1 — Cards vides (placeholder visible)
**Cause racine CSS** : `.placeholder-img { display: flex }` écrase
l'attribut HTML5 `[hidden]` dans `globals.css:300`. Le div absolutely-
positioned couvre l'img (qui charge pourtant correctement).

**Ce n'est pas** une régression iter-23. Ce bug préexiste au moins
depuis iter-22b (commit 3555962 "remove 2D React cards") où la
structure actuelle `<img><div placeholder hidden>` a été introduite.
La classe `.placeholder-img` date d'avant (iter-11 ou plus tôt).

### BUG 2 — Images existent mais n'apparaissent pas
**Même cause que BUG 1** : images dans le DOM + Network, mais masquées
par le placeholder qui viole `[hidden]`. BUG 1 et BUG 2 sont la même
racine vue sous deux angles (UI vs Network).

### BUG 3 — Contenu SketchUp désynchro
**3 causes racines imbriquées** :

3a. **Fixtures statiques hardcodées** (TestFit.tsx:598) — `VariantCard`
    charge `/sketchup/sketchup_variant_{id}.png` en statique Vite,
    jamais les URLs backend. Les 21 fichiers sous `public/sketchup/`
    sont des fixtures Lumen datées du 23 Apr 02:14.

3b. **Macro `/generate` ne sauve aucun screenshot** (testfit.py:566) —
    `facade.screenshot(view_name="iso")` sans `out_path`. Donc même
    si VariantCard lisait `v.screenshot_paths`, ce serait vide.

3c. **`live_screenshots` écrit mais jamais lu** (TestFit.tsx:234 vs :598) —
    `/iterate` renvoie bien un `screenshot_url` et le state le persiste
    en localStorage, mais le composant d'affichage ne branche pas
    ce state sur `<img src>`. Code mort intéressant : quelqu'un a
    préparé le plumbing et oublié la dernière étape.

### BONUS — Régression PseudoThreeDViewer
Non signalé par Saad mais dans son scope. Orphelin depuis iter-18h
(commit b9b2e50). 6-angle capture côté Ruby existe mais n'est pas câblé
côté pipeline Python.

### iter-23 n'est responsable de rien
La migration `tool_use` ne touche pas le pipeline SketchUp ni le
composant UI. Les 3 bugs préexistent à iter-23. Les nombreux shots
récents dans `backend/app/out/sketchup_shots/` (58 atelier, 2
villageois, 1 hybride_flex, derniers datés du 24 Apr 14:10) le
prouvent : `/iterate` a continué d'écrire des PNG pendant et après
iter-23. Le problème est côté frontend-lit-jamais-ces-URLs.

---

## C. Plan de fix priorisé

### P0 — CSS `[hidden]` respecté (15 min)
`frontend/src/styles/globals.css:300` : ajouter

```css
.placeholder-img[hidden] {
  display: none !important;
}
```

ou (plus propre) remplacer l'usage de `hidden` attr par un state React
`imgFailed: boolean` dans `VariantCard` avec conditional render.

**Impact** : BUG 1 + BUG 2 résolus instantanément. Les cards afficheront
les **fixtures Lumen** (tant que 3a n'est pas fixé), donc Saad verra
enfin quelque chose — mais pas encore Nordlight. Ne suffit pas
isolément ; à combiner avec P1.

**Risque régression** : nul. `[hidden]` doit toujours valoir
`display: none` ; c'est la sémantique HTML5.

### P1 — Macro screenshot sauvegardé sur disque (30 min)
`backend/app/surfaces/testfit.py:566` : dupliquer le pattern de
l'`/iterate` (lignes 1240-1250).

```python
SKETCHUP_SHOTS_DIR.mkdir(parents=True, exist_ok=True)
shot_filename = f"{style.value}_macro_{uuid.uuid4().hex[:12]}.png"
shot_path = SKETCHUP_SHOTS_DIR / shot_filename
try:
    facade.screenshot(view_name="iso", out_path=str(shot_path))
except Exception:
    pass
screenshot_url = None
if shot_path.exists() and shot_path.stat().st_size > 1024:
    screenshot_url = f"/api/testfit/screenshot/{shot_filename}"
# ... puis ajouter screenshot_url au VariantOutput (nouveau champ,
#     ou passer par screenshot_paths)
```

**Impact** : les `VariantOutput` reviennent avec des URLs backend valides.

**Risque régression** : touche le pipeline principal. Tests à
ajouter/adapter : `test_testfit.py` (vérifier `screenshot_paths` non
vide après génération), fixtures `RecordingMockBackend` (mock peut
renvoyer un path factice mais on doit vérifier que le macro ne crashe
pas si le fichier n'existe pas).

### P2 — VariantCard consomme `live_screenshots` / backend URL (45 min)
`frontend/src/routes/TestFit.tsx:598` : remplacer par lecture
hiérarchique.

```tsx
const liveUrl = state.live_screenshots?.[v.id];       // post-iterate
const backendUrl = v.screenshot_paths?.[0]            // post-generate
  ? `/api/testfit/screenshot/${path.basename(v.screenshot_paths[0])}`
  : null;
const fixtureUrl = `/sketchup/sketchup_variant_${v.id}.png`;
const sketchupUrl = liveUrl ?? backendUrl ?? fixtureUrl;
```

Ordre de priorité : itération live > macro initial > fixture Lumen.
Ajouter `v.screenshot_paths` comme prop `DesignVariant` (extension
de l'adapter `variantAdapter.ts`).

**Impact** : Saad voit enfin le vrai Nordlight, pas le Lumen figé.

**Risque régression** : nul sur Lumen tant que la fixture reste en
`public/sketchup/` (fallback). Les tests Jest/Vitest adapters testent
avec `screenshot_paths: []` — restent valides.

### P3 — Investigation `new_scene` vs reset (45 min, pré-fix)
Avant de fixer la désynchro "éparpillé", valider comportement de
`facade.new_scene(name=...)` sur le MCP mhyrr. Peut-être que chaque
variante ne reset pas la scène, empilant 3 × les zones. À tester :
lancer 3 générations consécutives, regarder compteurs d'entités
SketchUp entre chaque.

Si bug confirmé, P3 = ajouter un `facade.clear_scene()` ou
`facade.new_file()` en tête de variante. Sinon, rien à faire.

**Risque régression** : moyen sur Lumen (workflow déjà connu qui
marche). À tester avant commit.

### P4 (bonus) — Restaurer PseudoThreeDViewer (1h30)
1. Ajouter un bouton "See more angles" sur la card active dans
   MacroView.
2. Onglet modal ouvre `<PseudoThreeDViewer sources={...}>`.
3. `sources` vient soit des 6 fixtures (Lumen : déjà sur disque
   `/sketchup/sketchup_variant_{style}_iso_ne.png` etc.), soit des
   6 shots live (nouveau endpoint backend `/api/testfit/capture_angles`
   qui wrap le script standalone + retourne 6 URLs).

**Impact** : feature démo importante (Saad l'a dit). Ajoute la
profondeur "Keep Thinking" en permettant de visualiser le modèle 3D
sans SketchUp.

**Risque régression** : nul (feature nouvelle / restaurée, pas une
modification).

### Ordre recommandé
1. P0 (15 min) — débloque visuellement tout de suite.
2. P2 (45 min) — frontend lit les bons URLs avant que le backend
   les produise (dégradation gracieuse sur fixture).
3. P1 (30 min) — backend produit les vrais shots macro.
4. P3 (45 min, conditionnel) — si Saad confirme l'aspect "éparpillé".
5. P4 (1h30, bonus) — restauration PseudoThreeDViewer.

Total P0→P3 : **~2h15** pour un fix complet.
Total + P4 : **~3h45**.

---

## D. Estimations temps (récap)

| Fix | Effort | Test | Risque | Prio |
|-----|--------|------|--------|------|
| P0 CSS `[hidden]` | 15 min | visuel + unit | nul | 🔴 |
| P1 Macro screenshot out_path | 30 min | pytest + live | moyen | 🔴 |
| P2 VariantCard lit backend URL | 45 min | Vitest + live | faible | 🔴 |
| P3 SketchUp reset scene | 45 min | live SketchUp | moyen | 🟡 |
| P4 PseudoThreeDViewer restore | 1h30 | live + visuel | nul | 🟢 |

---

## E. Risques de régression sur Lumen

Le fixture `Lumen` dans `frontend/public/sketchup/*.png` **doit
rester intacte** pour que le fallback de P2 fonctionne (démo froide
sans backend → Saad continue de voir quelque chose de crédible).

Le pipeline `/api/testfit/fixture?use_vision=false` (fixture Lumen
pré-bakée) et `/api/testfit/sample` (saved 3-variant + 3-reviewer
run) **ne dépendent pas** de SketchUp MCP. Ces endpoints fonctionneront
toujours après les fixes, puisqu'on ne touche pas à leur code.

**Seul risque notable** : P1 modifie le pipeline `/generate`
principal qui est **commun** à Lumen et Nordlight. Tests pytest
doivent couvrir :
  - `RecordingMockBackend` + `/generate` → `screenshot_paths`
    peut être `[]` (fichier pas écrit physiquement avec le mock),
    pas de crash ;
  - `TcpJsonBackend` live + SketchUp up → shot existe, URL valide ;
  - `TcpJsonBackend` + SketchUp down → `facade.screenshot` lève,
    capturé en try/except, `screenshot_paths=[]`, variant
    reste livrée.

P3 est le fix le plus risqué côté régression Lumen (`new_scene` / reset).
À conditionner à une validation visuelle explicite de Saad entre
deux générations consécutives.

---

## F. Conclusion

**Le diagnostic est complet et les 3 bugs sont indépendants** :

- BUG 1/2 = **1 ligne de CSS** qui casse `[hidden]`. 15 minutes.
- BUG 3 = **3 causes imbriquées** (fixture hardcoded + macro sans
  out_path + state live_screenshots orphelin). Toutes fixables en
  composants séparés et testables indépendamment.

**iter-23 n'a RIEN cassé.** Les bugs préexistent (iter-18h pour le
VariantCard hardcoded, iter-22b pour le CSS placeholder, pipeline
macro sans `out_path` encore plus ancien).

**PseudoThreeDViewer** peut être restauré en bonus (P4) — les 6-angle
fixtures existent déjà, et le composant React est 100% fonctionnel,
juste orphelin.

**Prochaine étape** : attente du "Go Phase 3 fix" de Saad.
