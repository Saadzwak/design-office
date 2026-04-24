# Tool Use Migration — iter-23

Date : 2026-04-24
Auteur : Claude Code (engagement Saad)
Iteration : iter-23

## Résumé

Tous les agents du backend qui produisaient du JSON structuré
(variants, reviewer, parti-pris proposer, adjacency, iterate,
micro-zoning, Vision PDF, mood board) ont été migrés du chemin
"texte libre + repair défensif" vers l'**Anthropic Tool Use API**.

- Schéma JSON : généré par Pydantic v2 (`model_json_schema()`),
  servi à Claude comme `input_schema` d'un outil dédié.
- `tool_choice={"type": "tool", "name": "..."}` force Claude à
  émettre exactement cet outil.
- La sortie arrive déjà parsée dans `block.input` (dict Python) —
  **zéro `json.loads` côté client**.

Conséquence : les 5 familles de parse errors récurrentes sur Lovable
(Invalid control character, Expecting ',' delimiter, Unterminated
string, trailing commas, stray fragment après le `}` externe) ne
peuvent plus se produire par construction.

## Pourquoi

### Le symptôme

Sur le plan Lovable (PDF bureau complexe, 7+ pièces), chaque
génération de test-fit produisait 1 à 3 variants en erreur avec
`parse_error` dans les notes + score = 0. Reviewer et adjacency
échouaient sporadiquement aussi, toujours sur des payloads
>10k tokens.

### Les fixes qu'on a essayés (iter-20 → iter-22c)

1. **iter-20** : `_strip_json` basique (outer-brace extraction,
   markdown fence strip). Réglait 60% des erreurs.
2. **iter-21c** : tolérance trailing commas + inline/block comments
   (`_TRAILING_COMMA_RE`, `_LINE_COMMENT_RE`, `_BLOCK_COMMENT_RE`).
   Réglait l'adjacency validator.
3. **iter-21f** : `_truncate_to_last_balanced` (scan char-par-char,
   couper au dernier `}` d'outer-objet balancé). Réglait les
   fragments parasites post-`}`.
4. **iter-22a** : factorisation `_robust_json_parse` partagé avec
   Vision PDF.
5. **iter-22b** : `json.loads(..., strict=False)` pour accepter
   newlines/tabs dans les strings.
6. **iter-22c** : `_close_unterminated_json` (reconstruit les
   closers manquants quand Claude a été coupé par max_tokens).
   Bumped max_tokens 16k → 32k pour limiter les truncations.

Résultat : chaque fix réglait un cas, un nouveau en apparaissait.
Max_tokens=32k a introduit la contrainte streaming SDK (requis
au-delà de 17k), qui a cassé le flot synchrone. **On tournait
en rond.**

### La bascule (Option A)

Saad a tranché le 2026-04-24 : pivot vers `tool_use` **maintenant**.
L'API Anthropic valide le schéma server-side, donc les erreurs de
structure sont interceptées avant même de revenir au client.
Plus de `json.loads`, plus de regex de repair, plus de "last
line of defense".

## Implémentation

### Infrastructure partagée — `app/agents/orchestrator.py`

Nouvelle classe `StructuredSubAgent` + méthode
`Orchestration.run_structured_subagent()` :

```python
@dataclass(frozen=True)
class StructuredSubAgent:
    name: str
    system_prompt: str
    user_template: str
    output_schema: dict[str, Any]  # Pydantic model_json_schema()
    tool_name: str = "emit_structured_output"
    tool_description: str = "..."
    max_tokens: int = 8192


def run_structured_subagent(self, agent, context, tag) -> StructuredSubAgentOutput:
    tools = [{
        "name": agent.tool_name,
        "description": agent.tool_description,
        "input_schema": agent.output_schema,
    }]
    response = self.client.messages_create(
        tag=f"{tag}:{agent.name}",
        system=agent.system_prompt,
        messages=[{"role": "user", "content": user_msg}],
        max_tokens=agent.max_tokens,
        tools=tools,
        tool_choice={"type": "tool", "name": agent.tool_name},
    )
    for block in response.content:
        if getattr(block, "type", None) == "tool_use":
            return StructuredSubAgentOutput(name=agent.name, data=block.input, ...)
    raise RuntimeError(f"{agent.name}: no tool_use block")
```

`block.input` arrive en dict Python déjà validé par Anthropic
contre `agent.output_schema`.

### Schémas Pydantic — `app/schemas.py` (nouveau fichier)

Modèles LLM-facing séparés de `app/models.py` (runtime), tous avec
`model_config = ConfigDict(extra="forbid")` :

| Agent | Schéma | Tool name | Taille JSON schema |
|-------|--------|-----------|--------------------|
| Variant generator | `VariantLLMOutput` | `emit_variant` | 7217B |
| Reviewer | `ReviewerLLMOutput` | `emit_reviewer_verdict` | 987B |
| Parti-pris proposer | `PartiPrisLLMOutput` | `emit_partis_pris` | 1902B |
| Adjacency audit | `AdjacencyAuditLLMOutput` | `emit_adjacency_audit` | 1679B |
| Iterate variant | `IterateLLMOutput` | `emit_iterated_variant` | 7217B |
| Micro-zoning | `MicroZoningLLMOutput` | `emit_micro_zoning` | 3211B |
| Vision PDF extractor | `VisionPDFLLMOutput` | `emit_vision_pdf` | 7728B |
| Mood board curator | `MoodBoardLLMOutput` | `emit_mood_board` | 4554B |

#### Décision clé : `VariantZoneLLM` plat avec discriminateur `kind`

Anthropic's tool schema gère mal `oneOf` hétérogènes. Au lieu de
discriminated unions, on a aplati tous les types de zones en un
modèle unique `VariantZoneLLM` où :
- `kind` est un `Literal[...]` (workstation_cluster, meeting_room,
  phone_booth, partition_wall, collab_zone, biophilic_zone,
  place_human, place_plant, place_hero, apply_variant_palette)
- **tous les autres champs sont optionnels**

Le dispatcher Ruby côté SketchUp consomme `kind` pour router vers
le bon primitive builder.

### Migration des agents

#### `app/surfaces/testfit.py`

- **Variant generator** : `StructuredSubAgent` avec
  `tool_name="emit_variant"`, `max_tokens=16000` (descendu depuis
  32k — tool_use produit un output plus compact, plus besoin de
  streaming SDK).
- **Reviewer, Proposer, Adjacency, Iterate, Micro-zoning** : idem,
  chacun avec son propre tool_name.
- Tous les callers suivent le pattern :
  ```python
  try:
      out = orch.run_structured_subagent(agent, context, tag)
      obj = out.data  # dict déjà validé
  except Exception as exc:
      # fallback + note métrique "structured_api_error"
  ```
- Les notes `parse_error` ont été remplacées par :
  - `structured_api_error` (Claude a refusé ou l'API a planté)
  - `reviewer_api_error` (même chose côté reviewer)
  - `reviewer_shape_error` (le dict reçu ne correspond pas au
    Pydantic attendu — rare mais possible si Claude renvoie une
    variante valide schéma mais pas métier).

#### `app/pdf/parser.py` — `call_vision_hd()`

Idem, avec `VisionPDFLLMOutput` et `emit_vision_pdf`. Le schéma
force la présence de `envelope_real_dimensions_m` (critique pour
la calibration `mm_per_pt`).

#### `app/surfaces/moodboard.py`

`_agent()` retourne un `StructuredSubAgent` avec
`tool_name="emit_mood_board"`, `max_tokens=6000`. L'erreur
remonte en `ValueError(f"Mood Board Curator API error: {exc}")`.

### Cleanup — ce qui a été supprimé

**`app/surfaces/testfit.py`** :
- `_TRAILING_COMMA_RE`, `_LINE_COMMENT_RE`, `_BLOCK_COMMENT_RE`
- `_truncate_to_last_balanced(text)`
- `_close_unterminated_json(text)`
- `_strip_json(text)`

**`app/pdf/parser.py`** :
- `_JSON_TRAILING_COMMA_RE`, `_JSON_LINE_COMMENT_RE`,
  `_JSON_BLOCK_COMMENT_RE`
- `_robust_json_parse(text)`
- Import `json` (plus utilisé dans ce fichier)

**`tests/test_testfit.py`** :
- `test_strip_json_tolerates_trailing_commas`
- `test_strip_json_tolerates_inline_comments`
- `test_strip_json_truncates_at_last_balanced_close`

Remplacés par un bloc de commentaires expliquant la bascule.

## Vérification

- **Tests unitaires** : `pytest -q` → **122 passed**, 4 skipped
  (ezdxf headless, AutoCAD COM, installations locales).
- **Aucune régression** sur le pipeline Vision PDF, le rendering
  3D SketchUp, le justify PDF/PPTX, le mood board.
- **Live run** (Lovable PDF, 3 variants) : à valider au réveil
  de Saad — le backend tourne avec uvicorn --reload sur le
  nouveau chemin.

## Conséquences

### Avantages

1. **Zéro parse error possible** : Anthropic valide le schéma
   server-side avant de renvoyer la réponse.
2. **Code plus lisible** : un `out.data` au lieu de 120 lignes de
   regex defensive et scans char-par-char.
3. **max_tokens plus bas** : 16k au lieu de 32k (pas de ceinture
   + bretelles sur le max_tokens pour compenser les truncations).
4. **Pas de contrainte streaming SDK** : <17k suffit, on reste
   en synchrone.
5. **Schémas documentés** : `app/schemas.py` devient le contrat
   unique LLM ↔ backend.

### Points d'attention

1. **Anthropic peut refuser d'émettre le tool** (rare mais
   possible avec un prompt très contraint). Le code raise
   `RuntimeError` dans ce cas et la variante tombe en fallback
   avec note `structured_api_error`.
2. **Le schéma doit être acceptable par Anthropic** : pas de
   `oneOf` hétérogène, `additionalProperties: false` obligatoire
   via `extra="forbid"`.
3. **Les narratives restent dans le schéma** : on garde
   `narrative: str` comme champ plein texte pour conserver la
   dimension éditoriale des variants — ce n'est pas lourdement
   structuré par Claude.

## Prochaine étape

Reprendre iter-20 sur les 28 remarques de Saad là où on s'était
arrêtés. Le socle technique est stable maintenant :
- Variants JSON-safe
- Vision PDF JSON-safe
- Scale calibration clampée
- 2D React retiré (3D SketchUp only)
- Ruby-native primitives pour hero 3D
- ezdxf backend pour DWG export (AutoCAD LT bypass)
