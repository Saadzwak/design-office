# Future Work — roadmap after the hackathon

The current Archoff build covers the four hackathon surfaces
end-to-end (Brief, Test Fit, Justify, Export) with live SketchUp MCP and
AutoCAD MCP integration. The items below are the next strategic bets.
Each has enough implementation detail that the engineer picking it up
can scope a 1-3 day sprint without further discovery.

## 1. Real 3D via Three.js (highest priority)

The pseudo-3D viewer is a demo-grade solution. The production path is a
proper WebGL scene users can orbit, zoom and pan.

Pipeline :
- **Export** — add a `DesignOffice.export_gltf(out_path)` method to the
  SketchUp plugin. Two approaches, easiest first :
  1. Call the built-in `.dae` (COLLADA) exporter via Ruby, then convert
     server-side with `COLLADA2GLTF` or `obj2gltf` in the backend.
  2. Use the `three-stdlib` `SketchUpLoader` that parses `.skp` files
     directly on the client (no conversion, but skp parsing is heavier).
- **Transport** — persist the `.glb` per variant into
  `frontend/public/models/lumen_<style>.glb`; have the backend return
  the URL in the `/api/testfit/generate` response.
- **Scene** — mount `@react-three/fiber` + `@react-three/drei`.
  Components : `<OrbitControls>`, `<Environment preset="city">` for
  realistic reflections, `<ContactShadows>`, `<AccumulativeShadows>` for
  ground contact.
- **Materials** — the `sketchup_trace` already carries material intent
  per zone; re-apply matching PBR materials (MeshPhysicalMaterial with
  roughness/metalness/sheen) on the loaded meshes by name.
- **Performance** — 120-person plateau at full fidelity is ~80k tris.
  Use `meshopt` + Draco compression. Target 60 FPS on a M1 MBA.
- **Interaction** — pick a chair -> surface its product catalog entry
  in a side panel. Double-click a zone -> camera flies to its bbox.

Risk : gltf conversion pipeline is the weakest link on Windows.
Fallback : keep `SketchUpLoader` as plan B.

## 2. Revit MCP for Design Development

Once the schematic test fit is approved, architects move to Revit for
DD. A Revit MCP closes the loop by letting Claude drive Revit families.

- **MCP target** — Revit's pyRevit or RevitPythonShell as the scripting
  host; expose a TCP JSON-RPC bridge analogous to `su_mcp`.
- **Key tools** — `place_family_instance`, `create_wall`,
  `create_door`, `set_room_parameter`, `compute_schedule`, `plot_sheet`.
- **Bi-directional sync** — a round-trip from SketchUp test fit to
  Revit DD with the partition layout preserved as a placeholder phase
  that the Revit user promotes to real walls + families.
- **Demo hook** — "Phase 2 pricing : click here and Archoff
  writes a Revit model ready for your BIM team."

## 3. IFC export for BIM exchange

Open-BIM interoperability is non-negotiable for public sector RFPs and
any client with a facility-management team.

- **Library** — `ifcopenshell` Python bindings; pin to IFC 4.3 for
  maximum compatibility.
- **Mapping** — our `FloorPlan` + `sketchup_trace` already encodes
  IfcSpace (rooms), IfcWall (partitions), IfcFurnishingElement
  (workstations, chairs). Author a straightforward transformer per
  entity type.
- **Validation** — run output through `ifc-diff` and Solibri Model
  Checker in CI before shipping.
- **Deliverable surface** — add an "IFC" button next to the existing
  "DWG" export on the Export screen. Same File IPC path, different
  writer.

## 4. HRIS occupancy data integration

The hardest constraint on any office is not the drawing — it is the
actual occupation pattern. Hooking up to BambooHR / Workday / Personio
unlocks continuous space optimization.

- **Data ingress** — fetch org chart, team sizes, seating preferences
  once per week via the HRIS API. Normalize into a `WorkforceSnapshot`.
- **Re-planning agent** — a new orchestration level that watches for
  drift (team grows 20%, new hybrid policy drops attendance to 2.2
  days) and proposes incremental test fit updates.
- **Privacy** — occupancy rates are aggregated; no individual
  attendance data leaves the client's network. Document the DPA
  boundary in `docs/PRIVACY.md`.
- **Output** — a weekly digest email plus a "replan" button on the
  Test Fit screen that pre-loads the fresh brief.

## 5. Adjacent quick wins

- **French accessibility audit** — extend `validate_pmr_circulation` to
  report ERP compliance per zone with arrete-article references.
- **Furniture RFP generator** — after Justify, generate a per-brand RFP
  PDF from the selected furniture with lead times and sustainability
  certifications (LEVEL 2, Cradle2Cradle).
- **Carbon envelope** — link each material + furniture entry to an EPD
  (environmental product declaration) database; surface a kgCO2e/m2
  per variant.
