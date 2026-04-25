# iter-27 — SketchUp alignment investigation report

**Date** : 2026-04-25
**Investigateur** : Claude Code (`/loop` autonome)
**Scope** : Phase 1 (investigation pure, aucune modification de code)
**Decision point** : attente du "Go Phase 2" de Saad avant tout fix

---

## Contexte

Saad a fait son premier vrai test post-iter-26 avec le PDF Bâtiment A
(`f616c5f508eacfc7deac6f311f31ceaa.pdf`, 135 KB, plan haussmannien
RDC). Il rapporte deux bugs visibles dans SketchUp :

1. **Le plan PNG tranche les zones 3D au milieu** — vue de côté
   montre des éléments au-dessus ET en-dessous du plan posé
   horizontalement.
2. **Des zones sortent du périmètre du bâtiment** — colonnes alignées
   hors plan, sur la vue iso. Saad précise que ce bug **préexiste à
   iter-26** ; pas une régression.

Saad a aussi noté que les cylindres sont des plantes / zones
biophiliques et qu'on les garde tels quels pour cette itération.

---

## A. Findings P1 — plan tranche les zones

### A.1 — Hauteur Z du plan

`sketchup-plugin/design_office_extensions.rb:560` :

```ruby
origin = Geom::Point3d.new(0, 0, mm(-10))
img = m.entities.add_image(pdf_path, origin, mm(width_m * 1000.0))
```

Plan placé à **z = -10 mm** ✅ confirmé live par `eval_ruby` :

```
Image  layer='DO · Reference plan'  z=[-10, -10]  bbox=[0, 0, 32000, 47084]
```

Le plan est à -10 mm et c'est bien lui qu'on voit sur les screenshots.

### A.2 — Hauteurs Z des zones — preuve live

J'ai lancé un macro generate frais (PDF Bâtiment A, real_dims = 32 × 47.084 m,
1 variant villageois) puis interrogé SketchUp directement :

```
=== ENTITIES BY CLASS / LAYER + Z RANGE ===
Edge   Layer0   n=985  z=[-2800, 2700]   bbox=[0, -12352, 39300, 47084]
Face   Layer0   n=442  z=[-2800, 2700]
Group  DO·Hero  n=  3  z=[-2400,  860]
Group  DO·Humans n= 4  z=[ -900, 1780]
Group  DO·Plants n= 4  z=[ -475, 2060]
Image  DO·Reference plan  n=1  z=[-10, -10]
```

**Beaucoup d'entités vivent SOUS le plan** (z < -10) :

- 985 Edges et 442 Faces vont jusqu'à z = -2800 mm
- 3 Heroes (chaises/bureaux/etc.) descendent à z = -2400
- 4 Humans descendent à z = -900
- 4 Plants descendent à z = -475

Histogramme Z (regroupé en buckets de 100 mm) :

| count | class | z bucket |
|---|---|---|
| 36 | Edge | -2700 .. -2700 |
| 36 | Edge | 700 .. 700 |
| 36 | Edge | 0 .. 700 |
| 36 | Face | 0 .. 700 |
| 34 | Face | -2700 .. 0 |
| 32 | Edge | -2700 .. 0 |
| 24 | Edge | 2700 .. 2700 |
| 24 | Edge | 0 .. 2700 |
| 24 | Face | 0 .. 2700 |
| 21 | Face | -700 .. -700 |
| 16 | Edge | -2300 .. -2300 |
| 16 | Edge | -2300 .. 0 |
| 16 | Face | -2300 .. 0 |
| 10 | Face | -2800 .. -2800 |

Les zones se répartissent en TROIS catégories selon où vont leurs faces :

1. **Vers le haut, comme prévu** (workstations, certaines meeting rooms,
   certaines collab zones) — z = [0, +700], [0, +2700].
2. **Vers le bas, à l'envers** (cloisons, certaines colonnes, certains
   phone booths) — z = [-2300, 0], [-2700, 0], [-2700, -2700].
3. **Décor au-dessus du sol** (humans, plants, heroes) — bbox de chaque
   group descend jusqu'à -400 / -900 / -2400 selon le slug.

### A.3 — Cause racine P1 : winding-dependent pushpull direction

Tous les builders Ruby créent une face plate à z=0 puis appellent
`face.pushpull(mm(h))` avec `h` POSITIF. Or SketchUp's
`Face#pushpull(distance)` extrude le long de la **normale de la
face**, et la direction de la normale dépend du **winding order** des
points :

- Sens trigonométrique vu de +Z → normale +Z → pushpull(+h) extrude vers le haut ✓
- Sens horaire vu de +Z → normale -Z → pushpull(+h) extrude vers le bas ✗

`rectangle_face` (parser.rb:44-53) :

```ruby
pts = [
  Geom::Point3d.new(mm(xa), mm(ya), mm(z_mm)),
  Geom::Point3d.new(mm(xb), mm(ya), mm(z_mm)),
  Geom::Point3d.new(mm(xb), mm(yb), mm(z_mm)),
  Geom::Point3d.new(mm(xa), mm(yb), mm(z_mm))
]
entities.add_face(pts)
```

Dans une vue où Y monte vers le nord (convention Vision), ce winding
est trigonométrique → normale +Z → bonne direction. Mais SketchUp's
`add_face` peut **inverser la normale** quand la face partage des
arêtes coplanaires avec une face existante ou quand SketchUp détecte
qu'elle est "à l'envers" pour son auto-merge. C'est non-déterministe
selon l'ordre de construction.

Pour les colonnes (`add_face` à partir d'un cercle créé avec
`Z_AXIS`), même problème — la normale peut tomber +Z ou -Z selon
l'auto-correction SketchUp.

**Confirmation empirique** : sur le run live, j'observe :

- 36 desks workstation_cluster montent correctement (z=[0, 700]) ✅
- 24 meeting rooms montent correctement (z=[0, 2700]) ✅
- 21 faces "wall" descendent à z=[-700, -700] ✗
- 34 faces meeting room descendent à z=[-2700, 0] ✗
- 16 face phone booth descendent à z=[-2300, 0] ✗
- 10 face colonne descendent à z=[-2800, -2800] ✗

Donc le bug de winding affecte **plusieurs primitives en parallèle**.
Le plan à z=-10 se retrouve sandwiché entre les zones qui vont haut
et celles qui vont bas.

### A.4 — Plan d'action P1 (proposé pour Phase 2)

**Approche A (defensive Ruby)** : helper `_safe_pushpull_up(face, h)`
qui appelle `face.reverse!` si `face.normal.z < 0` AVANT le pushpull,
puis pushpull(+h). Garantit que toutes les zones extrudent vers le haut
indépendamment du winding.

Lignes à toucher (toutes dans `design_office_extensions.rb`) :

- L94 `place_column` — `face.pushpull(mm(2800))`
- L107 `place_core` — `face.pushpull(mm(2800))`
- L121 `place_stair` — `face.pushpull(mm(400))`
- L155 `create_workstation_cluster` — `face.pushpull(mm(DEFAULT_DESK_H_MM))`
- L176 `create_meeting_room` — `floor.pushpull(mm(WALL_HEIGHT_MM))`
- L192 `create_phone_booth` — `face.pushpull(mm(h))`
- L223 `create_partition_wall` — `face.pushpull(mm(WALL_HEIGHT_MM))`
- L259 `apply_biophilic_zone` — `face.pushpull(mm(1200))`
- L716, 806, 828, 849, 866, 889 — divers builders heroes (`pushpull(mm(...))`)

**Approche B (defensive Python)** : trop tard — le bug est dans le
moteur de face SketchUp. Pas faisable côté Python.

**Recommandation** : Approche A. ~12 sites à instrumenter avec un
helper unique. Pas de fonctionnalité changée, juste la direction
garantie.

---

## B. Findings P2 — zones hors périmètre

### B.1 — Vision retourne real_dims correctes

`call_vision_hd()` sur `f616c5f508eacfc7deac6f311f31ceaa.pdf` :

```
envelope_real_dimensions_m: {'width_m': 32.0, 'height_m': 38.0,
                             'source': 'scale_label', 'confidence': 0.7}
```

Bâtiment A est ~32 m × 38 m réels. Hypothèse **2b écartée** :
les dimensions réelles détectées sont plausibles (résidentiel
haussmannien sur RDC).

(Note : un second passage a donné `width_m=32, height_m=47.084` —
Vision varie de ±10m d'un appel à l'autre. C'est un autre point à
suivre mais pas notre problème principal aujourd'hui.)

### B.2 — Vision retourne `rooms_px` HORS limites de l'image

C'est le smoking gun. Quand on demande une extraction Vision sur
le PDF rendu à 2576 px de large :

```
rendered image: 2576 × 1822 px
rooms returned: 40
rooms_px x range: [1140, 2740]  ← max=2740 > img_w=2576
rooms_px y range: [560, 2480]   ← max=2480 > img_h=1822
  any x outside [0, 2576] ? 16 / 160 points
  any y outside [0, 1822] ? 44 / 160 points
```

**44 points sur 160 (28%) ont un y_px > img_h.** Vision invente des
coordonnées au-delà du cadre de l'image. C'est très probablement
le cas où Vision retourne des coordonnées dans un référentiel
différent (PDF points, ou page étendue, ou hallucination pure).

### B.3 — La fonction `_rescale_px_to_mm` n'a pas de garde-fou

`backend/app/pdf/parser.py:348-357` :

```python
def _rescale_px_to_mm(x_px, y_px, image_size, plate_mm):
    img_w, img_h = image_size
    pw_mm, ph_mm = plate_mm
    x_mm = (x_px / img_w) * pw_mm
    y_mm = (1 - y_px / img_h) * ph_mm
    return x_mm, y_mm
```

Aucun clamp à `[0, img_w]` ou `[0, img_h]`. Donc :

- Si Vision renvoie `y_px = 2480` avec `img_h = 1822` :
  `y_mm = (1 - 2480/1822) * ph_mm = (1 - 1.361) * 47084 = -16997 mm`
- Si Vision renvoie `x_px = 2740` avec `img_w = 2576` :
  `x_mm = (2740/2576) * pw_mm = 1.064 * 32000 = 34036 mm`

→ **room mm-coords sortent du périmètre `[0, 32000] × [0, 47084]`**

Confirmation sur le dump de la run live :

```
38 rooms post-rescale :
  x range: [9938, 37888] mm   ← 37888 > 32000 (envelope width)
  y range: [-18555, 33129] mm ← -18555 way south of envelope (0)
```

### B.4 — Le LLM hérite des coordonnées corrompues et propage

Le variant agent reçoit `existing_rooms` (dump du `_summarise_existing_rooms`)
en input. Avec des rooms à y = -18555, le LLM utilise ces ancres
pour placer ses zones. Dump du dernier variant villageois :

```
create_partition_wall { 'start_mm': [31925, -7184], 'end_mm': [31925, -12352] }
create_workstation_cluster { 'origin_mm': [29000, -8500], 'count': 8 }
create_meeting_room { 'corner1_mm': [22609, -4600], 'corner2_mm': [25839, 1861] }
create_meeting_room { 'corner1_mm': [14161, -2016] }
create_phone_booth { 'position_mm': [27500, -10500] }
create_meeting_room { 'corner2_mm': [33913, 23310] }   ← x=33913 > 32000
```

→ **Le LLM agit cohéremment avec les rooms qu'on lui donne.** Le
problème est en amont : la corruption rooms_px → rooms_mm.

### B.5 — Cause racine P2 : 2c confirmée (mismatch Vision frame ↔ image frame)

Hypothèse 2c du brief : "Désalignement scaling PNG vs zones".
**Confirmée**, avec un détail important : le PNG est OK (taille
forcée à `real_width × real_height` en Ruby). Le mismatch est en
amont, dans la conversion des `rooms_px` Vision → `rooms_mm` plan-
local. Le rescale assume que toute coord pixel est dans `[0, img_size]`
mais Vision peut retourner des coords hors-image.

Hypothèses 2a / 2b / 2d sont écartées :
- 2a : c'est l'agent macro qui propage les rooms corrompues — il fait
  son boulot correctement.
- 2b : Vision retourne des dims correctes (~32×38 m, plausibles).
- 2d : l'origine SketchUp est OK ; envelope et plan sont tous les deux
  ancrés à (0, 0).

### B.6 — Plan d'action P2 (proposé pour Phase 2)

**Couche 1 — Garde-fou immédiat dans `_rescale_px_to_mm`** :
clamp `x_px ∈ [0, img_w]` et `y_px ∈ [0, img_h]` avec un warning log
si des valeurs sortent. Évite les coords mm négatives.

**Couche 2 — Rejeter les rooms hors envelope mm dans
`_extract_rooms_from_vision`** : un room dont la bbox sort de
`[0, plate_w_mm] × [0, plate_h_mm]` est jeté (au lieu d'être renvoyé
au LLM avec des coords pourries).

**Couche 3 — Fix architectural Vision** (peut être différé à iter-28+) :
demander à Vision dans le prompt l'`envelope_pts_px` explicite (la
bbox du bâtiment dans l'image). Calibrer le rescale rooms→mm sur
cette bbox plutôt que sur la taille TOTALE de l'image. Pour les PDFs
avec cartouche / titre / légende sur les côtés, c'est la seule façon
robuste.

**Recommandation** : Couche 1 + Couche 2 pour iter-27 Phase 2 (~30 min,
defensive, pas de breaking change). Couche 3 = iter-28+ si Saad le
juge prioritaire (plus invasif : prompt Vision + nouveau champ + tests).

---

## C. Synthèse — root causes confirmées

| Bug | Cause | Confirmé par | Couche fix |
|---|---|---|---|
| P1 plan tranche zones | `face.pushpull(+h)` direction-aléatoire selon winding | live entity dump : 21 faces à z=-700, 34 à z=-2700, 10 à z=-2800 | Ruby helper `_safe_pushpull_up` qui force `face.reverse!` si normale.z<0 |
| P2 zones hors périmètre | Vision retourne `rooms_px` hors `[0, img_size]`, `_rescale_px_to_mm` n'a pas de clamp, rooms_mm partent négatif, LLM propage | live Vision call : 44/160 y_px > img_h, dump rooms y range [-18555, 33129], dump variant zones y down to -12352 | Couche 1 (clamp) + Couche 2 (filtrer rooms hors envelope) |

Iter-26 P1 (l'underlay PDF→PNG) **n'a rien cassé** — au contraire il a
révélé le bug P1 (winding) qui était invisible sans l'underlay (les
zones partaient en negative depuis le début mais on ne les voyait
pas car il n'y avait pas de plan de référence à trancher).

Iter-26 P2 (overlap detector) reste pertinent et doit être conservé —
c'est un autre concern (collisions XY entre zones) orthogonal aux
deux ici (Z-direction et frame mismatch).

---

## D. Risques de régression

**P1 fix (helper `_safe_pushpull_up`)** : risque moyen. Affecte
toutes les primitives 3D. Tests à renforcer :
- pytest existant `test_new_scene_precedes_any_geometry_call` reste
  vert (mock backend, pas de pushpull réel).
- Nouveau live test : après un macro generate, dump entities et
  vérifier `min(z_lo) >= -10` (sauf décor heroes / plants à z négatif
  par design — comme les chaises lounge avec piètement).
- Risque side-effect : si une primitive avait *intentionnellement*
  une face inversée pour ouvrir un volume vers le bas (ex: une
  arche), le helper la passerait en haut. Aucune primitive identifiée
  fait ça aujourd'hui — toutes veulent extruder vers le haut.

**P2 fix (clamp + filter rooms)** : risque faible. Defensive only.
Tests à ajouter :
- pytest unitaire : `_rescale_px_to_mm` avec coords hors-image →
  retourne valeur clampée.
- pytest unitaire : `_extract_rooms_from_vision` avec une room dont
  la bbox est partiellement hors envelope → la room est jetée.
- Live test : re-run macro generate sur Bâtiment A, dump rooms
  variant zones et vérifier `min(y) >= 0` et `max(x) <= envelope_w`.

**Pas de régression Lumen** garanti — la fixture Lumen utilise des
coords déjà bien dans [0, 60000] × [0, 40000] et ne déclenche aucun
des 2 bugs. Les fixes sont silencieux sur le chemin happy.

---

## E. Prochaine étape

Attente de ton "Go Phase 2 fix" pour implémenter :

1. Helper Ruby `_safe_pushpull_up` + remplacement des ~12 call sites
2. Clamp dans `_rescale_px_to_mm` + filtre rooms hors envelope
3. Tests unitaires Python pour le clamp + le filtre
4. Live test : Bâtiment A 1-variant generate, vérifier scene state
   z propre et zones dans envelope

Estimation : **~50 min** pour les 2 fixes + tests + live verify.
