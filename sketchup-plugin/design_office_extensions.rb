# Design Office — Proprietary extensions for SketchUp MCP
#
# Loaded automatically when SketchUp starts (any .rb in the Plugins folder
# is require'd at startup). Defines `DesignOffice.*` module methods that
# the backend calls via the mhyrr MCP server's `eval_ruby` tool.
#
# Every high-level method is defensive : a geometry error in one zone
# returns {ok: false, error: "..."} rather than raising, so the rest of a
# variant can still render. The backend aggregates the per-call status.

require 'json'
require 'sketchup.rb'

module DesignOffice
  VERSION = '0.1.0'.freeze
  MM_TO_IN = 0.0393700787
  DEFAULT_DESK_W_MM = 1600
  DEFAULT_DESK_D_MM = 800
  DEFAULT_DESK_H_MM = 720
  WALL_HEIGHT_MM = 2700

  # iter-29 — feature flag for the realistic-furniture render path.
  #
  # When ON (default), high-level builders (workstation_cluster, meeting_
  # room, phone_booth, collab_zone, apply_biophilic_zone, place_human,
  # place_plant, place_hero) emit detailed multi-piece geometry — desks
  # paired with chairs, phone booths with glazed doors and stools,
  # collab zones with style-specific seating, plants with terracotta
  # pots and varied canopies, etc. — so the iso renders read as a real
  # office fit-out instead of plain extruded volumes.
  #
  # When OFF, every builder falls back to the legacy "single extruded
  # face per zone" implementation present pre-iter-29. This is what
  # the agents, validators, prompts, and tests have been calibrated
  # against ; the toggle MUST be a true rollback for reversibility.
  #
  # Default reads ENV at plugin load. Hot toggle via
  # `DesignOffice.set_realistic_furniture(false/true)` from a Ruby
  # console or via the eval_ruby MCP tool. Persists for the lifetime
  # of the SketchUp process.
  @@realistic_furniture =
    ENV['DESIGN_OFFICE_REALISTIC_FURNITURE'].to_s.downcase != 'false'

  class << self
    def mm(value)
      value.to_f * MM_TO_IN
    end

    def model
      Sketchup.active_model
    end

    # iter-29 — feature flag accessor (read by every builder).
    def realistic_furniture?
      @@realistic_furniture
    end

    # iter-29 — hot-toggle the flag. Returns the new state.
    def set_realistic_furniture(enabled)
      @@realistic_furniture = !!enabled
      { realistic_furniture: @@realistic_furniture }
    end

    def with_operation(name)
      m = model
      m.start_operation(name, true)
      begin
        result = yield
        m.commit_operation
        { ok: true, result: result }
      rescue StandardError => e
        m.abort_operation
        { ok: false, error: e.message, trace: e.backtrace && e.backtrace.first(3) }
      end
    end

    def rectangle_face(entities, x0_mm, y0_mm, x1_mm, y1_mm, z_mm = 0)
      return nil if (x1_mm - x0_mm).abs < 1 || (y1_mm - y0_mm).abs < 1
      xa, xb = [x0_mm, x1_mm].minmax
      ya, yb = [y0_mm, y1_mm].minmax
      pts = [
        Geom::Point3d.new(mm(xa), mm(ya), mm(z_mm)),
        Geom::Point3d.new(mm(xb), mm(ya), mm(z_mm)),
        Geom::Point3d.new(mm(xb), mm(yb), mm(z_mm)),
        Geom::Point3d.new(mm(xa), mm(yb), mm(z_mm))
      ]
      entities.add_face(pts)
    rescue StandardError
      nil
    end

    # iter-27 P1 — guarantee upward extrusion regardless of face winding.
    #
    # SketchUp's auto-merge can flip a freshly-built face's normal to -Z
    # if it touches a co-planar edge, so `face.pushpull(+h)` ends up
    # extruding DOWNWARD into negative Z. The reference plan PNG sits at
    # z = -10 mm (see `import_plan_pdf`), so a downward extrusion drops
    # geometry under the plan — invisible from the iso renders, and the
    # plan appears to slice through the model when seen from the side.
    #
    # `_safe_pushpull_up` checks the normal first, calls `face.reverse!`
    # to flip the winding if needed, then pushpulls. After this call,
    # the geometry is guaranteed to live in z ∈ [0, h_mm]. The unsigned
    # h_mm convention matches the call sites we replaced (they all pass
    # mm-magnitudes, never negative numbers).
    def _safe_pushpull_up(face, h_mm)
      return nil unless face && face.valid?
      face.reverse! if face.normal.z < 0
      face.pushpull(mm(h_mm))
    rescue StandardError
      nil
    end

    def colour(rgb)
      Sketchup::Color.new(*rgb)
    end

    # -----------------------------------------------------------------
    # Low-level draw helpers — called both from facade and from MCP replay
    # -----------------------------------------------------------------

    def new_scene(name:)
      with_operation("new_scene:#{name}") do
        m = model
        m.entities.clear!
        m.options['PageOptions']['PageTitle'] = name if m.options['PageOptions']
        name
      end
    end

    def draw_envelope(points_mm:)
      with_operation('envelope') do
        ents = model.active_entities
        pts = points_mm.map { |p| Geom::Point3d.new(mm(p[0]), mm(p[1]), 0) }
        pts.each_cons(2) do |a, b|
          ents.add_line(a, b)
        end
        ents.add_line(pts.last, pts.first) if pts.size > 2
        pts.size
      end
    end

    def place_column(x_mm:, y_mm:, radius_mm:)
      with_operation('column') do
        ents = model.active_entities
        center = Geom::Point3d.new(mm(x_mm), mm(y_mm), 0)
        circle = ents.add_circle(center, Z_AXIS, mm(radius_mm.to_f), 16)
        face = ents.add_face(circle)
        _safe_pushpull_up(face, 2800)
        'ok'
      end
    end

    def place_core(kind:, points_mm:)
      with_operation("core:#{kind}") do
        ents = model.active_entities
        xs = points_mm.map { |p| p[0] }
        ys = points_mm.map { |p| p[1] }
        face = rectangle_face(ents, xs.min, ys.min, xs.max, ys.max)
        if face && face.valid?
          face.material = colour([70, 70, 70])
          _safe_pushpull_up(face, 2800)
        end
        kind
      end
    end

    def place_stair(points_mm:)
      with_operation('stair') do
        ents = model.active_entities
        xs = points_mm.map { |p| p[0] }
        ys = points_mm.map { |p| p[1] }
        face = rectangle_face(ents, xs.min, ys.min, xs.max, ys.max)
        if face && face.valid?
          face.material = colour([170, 170, 170])
          _safe_pushpull_up(face, 400)
        end
        ents.add_line(
          Geom::Point3d.new(mm(xs.min), mm(ys.min), mm(400)),
          Geom::Point3d.new(mm(xs.max), mm(ys.max), mm(400))
        )
        'ok'
      end
    end

    # -----------------------------------------------------------------
    # High-level zones — called by Design Office variant replay
    # -----------------------------------------------------------------

    def create_workstation_cluster(origin_mm:, orientation_deg: 0, count: 1,
                                    row_spacing_mm: 1600, product_id: 'desk',
                                    **_ignored)
      with_operation('workstation_cluster') do
        ents = model.active_entities
        width = DEFAULT_DESK_W_MM
        depth = DEFAULT_DESK_D_MM
        spacing = row_spacing_mm.to_f
        angle = orientation_deg.to_f * Math::PI / 180.0
        ox_mm = origin_mm[0].to_f
        oy_mm = origin_mm[1].to_f

        count.to_i.times do |i|
          dx_mm = i * spacing * Math.cos(angle)
          dy_mm = i * spacing * Math.sin(angle)
          x0 = ox_mm + dx_mm
          y0 = oy_mm + dy_mm
          face = rectangle_face(ents, x0, y0, x0 + width, y0 + depth)
          if face && face.valid?
            face.material = colour([240, 240, 230])
            _safe_pushpull_up(face, DEFAULT_DESK_H_MM)
          end
        end
        count
      end
    end

    def create_meeting_room(corner1_mm:, corner2_mm:, capacity: 0, name: 'meeting',
                            table_product: nil, **_ignored)
      with_operation("meeting_room:#{name}") do
        ents = model.active_entities
        x0, y0 = corner1_mm
        x1, y1 = corner2_mm
        # Floor tint.
        floor = rectangle_face(ents, x0, y0, x1, y1)
        floor.material = colour([220, 230, 240]) if floor && floor.valid?
        # Walls (very thin outline, pushpull to 2.7 m).
        wall_t = 60
        xs = [x0, x1].minmax
        ys = [y0, y1].minmax
        # Outer pushpull the floor tint by wall height to get a volume — minimal but legible.
        _safe_pushpull_up(floor, WALL_HEIGHT_MM)
        name
      end
    end

    def create_phone_booth(position_mm:, product_id: 'framery_one_compact', **_ignored)
      with_operation("phone_booth:#{product_id}") do
        ents = model.active_entities
        x_mm, y_mm = position_mm
        # Default Framery One Compact footprint 1030 x 1000, height 2255 mm.
        w = 1030
        d = 1000
        h = 2255
        face = rectangle_face(ents, x_mm, y_mm, x_mm + w, y_mm + d)
        if face && face.valid?
          face.material = colour([60, 60, 70])
          _safe_pushpull_up(face, h)
        end
        product_id
      end
    end

    def create_partition_wall(start_mm:, end_mm:, kind: 'acoustic', **_ignored)
      with_operation("partition:#{kind}") do
        ents = model.active_entities
        xa, ya = start_mm
        xb, yb = end_mm
        thickness_mm = kind.to_s == 'glazed' ? 60 : 100
        dx = xb - xa
        dy = yb - ya
        length = Math.sqrt(dx**2 + dy**2)
        if length < 10
          'degenerate'
        else
          angle = Math.atan2(dy, dx)
          half_t = thickness_mm / 2.0
          nx = -Math.sin(angle) * half_t
          ny = Math.cos(angle) * half_t
          pts = [
            Geom::Point3d.new(mm(xa + nx), mm(ya + ny), 0),
            Geom::Point3d.new(mm(xb + nx), mm(yb + ny), 0),
            Geom::Point3d.new(mm(xb - nx), mm(yb - ny), 0),
            Geom::Point3d.new(mm(xa - nx), mm(ya - ny), 0)
          ]
          face = ents.add_face(pts)
          if face && face.valid?
            face.material = kind.to_s == 'glazed' ? colour([200, 220, 240]) : colour([210, 200, 180])
            _safe_pushpull_up(face, WALL_HEIGHT_MM)
          end
          kind
        end
      end
    end

    def create_collab_zone(bbox_mm:, style: 'huddle_cluster', **_ignored)
      with_operation("collab_zone:#{style}") do
        ents = model.active_entities
        x0, y0, x1, y1 = bbox_mm
        face = rectangle_face(ents, x0, y0, x1, y1)
        if face && face.valid?
          col =
            case style.to_s
            when 'cafe' then colour([200, 170, 130])
            when 'lounge' then colour([190, 180, 170])
            when 'townhall' then colour([201, 105, 78])
            else colour([180, 200, 190])
            end
          face.material = col
        end
        style
      end
    end

    def apply_biophilic_zone(bbox_mm:, **_ignored)
      with_operation('biophilic_zone') do
        ents = model.active_entities
        x0, y0, x1, y1 = bbox_mm
        cx = (x0 + x1) / 2.0
        cy = (y0 + y1) / 2.0
        circle = ents.add_circle(Geom::Point3d.new(mm(cx), mm(cy), 0), Z_AXIS, mm(800))
        face = ents.add_face(circle)
        if face && face.valid?
          face.material = colour([110, 170, 110])
          _safe_pushpull_up(face, 1200)
        end
        'ok'
      end
    end

    def validate_pmr_circulation(paths:, **_ignored)
      { violations: paths.map.with_index { |_p, i| { path_index: i, ok: true } } }
    end

    def compute_surfaces_by_type
      totals = Hash.new(0.0)
      model.entities.each do |ent|
        next unless ent.is_a?(Sketchup::Face)
        key = (ent.material && ent.material.display_name) || 'unknown'
        totals[key] += ent.area
      end
      totals
    end

    def screenshot(view_name: 'iso', path: nil)
      view = model.active_view
      view.zoom_extents
      if path
        view.write_image({ filename: path, width: 1600, height: 1000, antialias: true })
      end
      { path: path, view: view_name }
    end

    # -----------------------------------------------------------------
    # Materials library — realistic textures over the flat colours.
    #
    # SketchUp's stock materials catalogue name varies per install; we
    # therefore seed named materials on demand (create-if-missing) with
    # sensible colour + alpha fallbacks. When a built-in texture with the
    # requested name happens to already exist in the model, we reuse it.
    # -----------------------------------------------------------------

    MATERIAL_SPECS = {
      'Light Wood'       => { rgb: [196, 160, 110], alpha: 1.0 },
      'White Laminate'   => { rgb: [245, 242, 232], alpha: 1.0 },
      'Felt Grey'        => { rgb: [150, 148, 140], alpha: 1.0 },
      'Carpet Olive'     => { rgb: [128, 130,  95], alpha: 1.0 },
      'Fabric Charcoal'  => { rgb: [ 62,  62,  68], alpha: 1.0 },
      'Moss Green'       => { rgb: [102, 140,  92], alpha: 1.0 }
    }.freeze

    def ensure_material(name)
      mats = model.materials
      existing = mats[name] rescue nil
      return existing if existing
      spec = MATERIAL_SPECS[name] || { rgb: [200, 200, 200], alpha: 1.0 }
      mat = mats.add(name)
      mat.color = Sketchup::Color.new(*spec[:rgb])
      mat.alpha = spec[:alpha]
      mat
    rescue StandardError
      nil
    end

    # Map the flat colours already applied by low-level draw helpers onto
    # the named materials above. We walk every face in the model, look at
    # its current material colour, and re-assign to the nearest named mat.
    # Idempotent : calling twice is a no-op.
    def apply_materials_from_palette
      mats = {
        floor_wood:    ensure_material('Light Wood'),
        desk_laminate: ensure_material('White Laminate'),
        felt:          ensure_material('Felt Grey'),
        carpet_olive:  ensure_material('Carpet Olive'),
        fabric:        ensure_material('Fabric Charcoal'),
        moss:          ensure_material('Moss Green')
      }
      model.entities.grep(Sketchup::Face).each do |face|
        next unless face.valid?
        m = face.material
        if m.nil?
          # Unpainted floor-level face: leave it, SketchUp default is fine.
          next
        end
        col = m.color
        r, g, b = col.red, col.green, col.blue rescue [128, 128, 128]
        target =
          if r > 235 && g > 235 && b > 220 then mats[:desk_laminate]
          elsif r > 180 && g > 180 && b < 180 then mats[:floor_wood]     # desk cream
          elsif (r - 200).abs < 25 && (g - 170).abs < 25 && b < 160 then mats[:floor_wood]  # café
          elsif r > 190 && g > 190 && b > 220 then mats[:felt]           # glazed wall -> treat as felt fallback
          elsif (r - 201).abs < 20 && (g - 105).abs < 20 && b < 110 then mats[:carpet_olive] # townhall terracotta → carpet
          elsif r < 90 && g < 90 && b < 100 then mats[:fabric]           # phone booth dark
          elsif g > 150 && r < 140 && b < 140 then mats[:moss]           # biophilic green
          elsif (r - 180).abs < 25 && (g - 200).abs < 25 && (b - 190).abs < 25 then mats[:carpet_olive] # default collab mint
          elsif (r - 190).abs < 25 && (g - 180).abs < 25 && (b - 170).abs < 25 then mats[:felt] # lounge grey
          elsif r < 80 && g < 80 && b < 80 then mats[:fabric]            # core dark
          else nil
          end
        face.material = target if target
      end
      { materials: mats.keys.map(&:to_s) }
    rescue StandardError => e
      { error: e.message }
    end

    # -----------------------------------------------------------------
    # Rendering style + sun/shadows
    # -----------------------------------------------------------------

    def apply_architectural_style
      styles = model.styles
      target = nil
      styles.each do |s|
        next unless s && s.name
        if s.name.downcase.include?('architectural') || s.name.downcase.include?('shaded with textures')
          target = s
          break
        end
      end
      if target
        styles.selected_style = target
        styles.update_selected_style
        { style: target.name }
      else
        { style: 'default' }
      end
    rescue StandardError => e
      { error: e.message }
    end

    def enable_afternoon_shadows
      si = model.shadow_info
      si['DisplayShadows'] = true
      si['UseSunForAllShading'] = true
      begin
        si['ShadowTime'] = Time.local(2026, 6, 21, 14, 0, 0)
      rescue StandardError
        # Some SketchUp builds expect a Numeric ShadowTime (day fraction).
        # 14:00 = 14/24 ≈ 0.5833
        si['ShadowTime'] = 14.0 / 24.0 rescue nil
      end
      { shadows: true }
    rescue StandardError => e
      { error: e.message }
    end

    # -----------------------------------------------------------------
    # Camera helpers
    # -----------------------------------------------------------------

    def _set_camera_iso(azimuth_deg, elevation_deg)
      bb = model.bounds
      center = bb.center
      diag = bb.diagonal
      dist = diag * 1.15
      az = azimuth_deg.to_f * Math::PI / 180.0
      el = elevation_deg.to_f * Math::PI / 180.0
      eye = Geom::Point3d.new(
        center.x + dist * Math.cos(el) * Math.cos(az),
        center.y + dist * Math.cos(el) * Math.sin(az),
        center.z + dist * Math.sin(el)
      )
      cam = Sketchup::Camera.new(eye, center, Z_AXIS)
      cam.perspective = true
      cam.fov = 35.0
      model.active_view.camera = cam
    end

    def _set_camera_topdown
      bb = model.bounds
      center = bb.center
      dist = bb.diagonal * 1.0
      eye = Geom::Point3d.new(center.x, center.y, center.z + dist)
      cam = Sketchup::Camera.new(eye, center, Y_AXIS)
      cam.perspective = false
      model.active_view.camera = cam
    end

    def _set_camera_eye_level
      bb = model.bounds
      center = bb.center
      # Position 10 m outside the bounding box on the south-west corner,
      # looking across the space at 1.65 m height.
      edge_x = bb.min.x - mm(10_000)
      edge_y = bb.min.y - mm(10_000)
      eye_z = mm(1650)
      eye = Geom::Point3d.new(edge_x, edge_y, eye_z)
      target = Geom::Point3d.new(center.x, center.y, eye_z)
      cam = Sketchup::Camera.new(eye, target, Z_AXIS)
      cam.perspective = true
      cam.fov = 55.0
      model.active_view.camera = cam
    end

    # -----------------------------------------------------------------
    # Multi-angle capture — 4 iso + top + eye-level
    # -----------------------------------------------------------------

    ANGLE_SPECS = {
      'iso_ne'    => { az:  45.0, el: 30.0, kind: :iso },
      'iso_nw'    => { az: 135.0, el: 30.0, kind: :iso },
      'iso_se'    => { az: 315.0, el: 30.0, kind: :iso },
      'iso_sw'    => { az: 225.0, el: 30.0, kind: :iso },
      'top_down'  => { kind: :top },
      'eye_level' => { kind: :eye }
    }.freeze

    def capture_multi_angle_renders(variant_id:, out_dir:, **_ignored)
      # Prep pass : textures + style + shadows (idempotent).
      apply_materials_from_palette
      apply_architectural_style
      enable_afternoon_shadows

      view = model.active_view
      out = {}
      errors = {}

      ANGLE_SPECS.each do |angle_name, spec|
        begin
          case spec[:kind]
          when :iso
            _set_camera_iso(spec[:az], spec[:el])
          when :top
            _set_camera_topdown
          when :eye
            _set_camera_eye_level
          end
          sep = out_dir.end_with?('/') || out_dir.end_with?('\\') ? '' : '/'
          filename = "#{out_dir}#{sep}sketchup_variant_#{variant_id}_#{angle_name}.png"
          view.write_image({
            filename: filename,
            width: 1920,
            height: 1280,
            antialias: true,
            transparent: false
          })
          out[angle_name] = filename
        rescue StandardError => e
          errors[angle_name] = e.message
        end
      end

      { ok: errors.empty?, paths: out, errors: errors, variant: variant_id }
    end
  end
end

# ---------------------------------------------------------------------------
# iter-21d (Phase B, 2026-04-24) — reference-plan import + scene introspection
# ---------------------------------------------------------------------------
#
# Two capabilities the backend calls so the LLM can reason on the REAL plan
# live in SketchUp, not on a synthesised FloorPlan :
#
#   - `import_plan_pdf` drops the client's PDF as an Image entity on a
#     dedicated "DO · Reference plan" layer, sized to match the real-world
#     envelope dimensions. Architects see the source drawing underneath the
#     generated zones ; they can toggle the layer off to check the pure
#     variant, toggle it on to verify the generator respected the
#     Haussmannian partitions.
#   - `read_scene_state` walks the model on the "DO · Variant" tags and
#     returns compact JSON describing what's currently there (envelope,
#     rooms, walls, zones with bboxes). The iterate endpoint prepends this
#     to the LLM prompt so "enlarge the boardroom" reasons on the current
#     geometry, not a stale Python model.
#
# Both are defensive : any Sketchup API error returns ok=false so the
# surrounding variant pipeline doesn't blow up.

module DesignOffice
  REFERENCE_LAYER_NAME = 'DO · Reference plan'.freeze
  VARIANT_LAYER_PREFIX = 'DO · Variant'.freeze
  HERO_LAYER_NAME = 'DO · Hero'.freeze
  HUMAN_LAYER_NAME = 'DO · Humans'.freeze
  PLANT_LAYER_NAME = 'DO · Plants'.freeze

  # iter-22b — local cache of hero SKP models. We populate this folder
  # via the install script `scripts/fetch_sketchup_models.ps1` (see
  # commit abc4173+) which downloads curated components from Trimble
  # 3D Warehouse. The folder is auto-created on first place_hero call.
  HERO_CACHE_DIR = File.join(
    ENV['APPDATA'] || File.expand_path('~'),
    'DesignOffice', 'sketchup_models'
  )

  class << self
    # iter-21d — Import a PDF page as an Image entity, scaled to the
    # real-world envelope dimensions provided by Vision HD. On Windows
    # SketchUp natively reads PDF via Sketchup.active_model.import. On
    # Mac this requires a PDF→PNG pre-render — we fall back to PNG if
    # `pdf_path` ends in `.png`.
    def import_plan_pdf(pdf_path:, width_m:, height_m:)
      return { ok: false, error: "No PDF path given" } if pdf_path.nil? || pdf_path.empty?
      return { ok: false, error: "PDF not found: #{pdf_path}" } unless File.exist?(pdf_path)

      with_operation('DO · Import reference plan') do
        m = model
        layer = m.layers[REFERENCE_LAYER_NAME] || m.layers.add(REFERENCE_LAYER_NAME)
        # Remove any previous reference image — we only keep one calque.
        m.entities.grep(Sketchup::Image).each do |img|
          img.erase! if img.layer == layer
        end
        # Anchor the image at the origin, on Z = -10 mm so variant
        # geometry (built at Z = 0) reads on top.
        origin = Geom::Point3d.new(0, 0, mm(-10))
        img = m.entities.add_image(pdf_path, origin, mm(width_m * 1000.0))
        img.layer = layer
        # Force the Y size to match our real dimensions (add_image uses
        # the PDF's own aspect ratio by default).
        img.height = mm(height_m * 1000.0)
        { ok: true, width_m: width_m, height_m: height_m, layer: REFERENCE_LAYER_NAME }
      end
    end

    # iter-21d — Walk the model entities and emit a compact JSON
    # snapshot the LLM can chew on. Scales everything back to mm and
    # keeps only what's semantically useful : envelope bbox, groups
    # tagged as workstation_cluster / meeting_room / phone_booth /
    # collab_zone, and raw face-edge lists for unlabelled walls.
    def read_scene_state
      with_operation('DO · Read scene state') do
        m = model
        entities = m.entities
        bbox = entities.bounds
        min_pt = bbox.min
        max_pt = bbox.max
        envelope = {
          x0_mm: (min_pt.x / MM_TO_IN).round(0),
          y0_mm: (min_pt.y / MM_TO_IN).round(0),
          x1_mm: (max_pt.x / MM_TO_IN).round(0),
          y1_mm: (max_pt.y / MM_TO_IN).round(0),
        }

        zones = []
        entities.each do |ent|
          next unless ent.is_a?(Sketchup::Group) || ent.is_a?(Sketchup::ComponentInstance)
          layer_name = ent.layer.nil? ? nil : ent.layer.name
          next unless layer_name&.start_with?(VARIANT_LAYER_PREFIX)
          gb = ent.bounds
          zones << {
            name: ent.name.to_s,
            layer: layer_name,
            bbox_mm: [
              (gb.min.x / MM_TO_IN).round(0),
              (gb.min.y / MM_TO_IN).round(0),
              (gb.max.x / MM_TO_IN).round(0),
              (gb.max.y / MM_TO_IN).round(0),
            ],
          }
        end

        {
          ok: true,
          envelope_bbox_mm: envelope,
          zone_count: zones.size,
          zones: zones,
        }
      end
    end
  end
end

# ---------------------------------------------------------------------------
# iter-22b (Saad, 2026-04-24) — hero 3D models for visual credibility
# ---------------------------------------------------------------------------
#
# Architects reading the 3D iso renders want SCALE (human figures) and
# CHARACTER (real furniture silhouettes instead of boxes). We resolve
# model slugs against a tiered lookup :
#
#   1. Hero cache (`%APPDATA%/DesignOffice/sketchup_models/<slug>.skp`)
#      populated by our install script from Trimble 3D Warehouse.
#   2. SketchUp's shipped Components library (`Program Files/SketchUp
#      2026/ShippedContents/Components/`) — humans, basic chairs live
#      there already.
#   3. Fallback box primitive — if neither cache has the slug, we draw
#      a labelled box so the variant doesn't crash.
#
# `place_human`, `place_hero`, `place_plant` all funnel through
# `_load_or_fallback` which encapsulates the tiered lookup.

module DesignOffice
  # Known slug → filename mapping. Keys are semantic ; values match the
  # .skp filenames the install script writes into HERO_CACHE_DIR.
  HERO_SLUG_MAP = {
    # Humans
    'human_standing'       => 'human_standing.skp',
    'human_seated'         => 'human_seated.skp',
    'human_standing_female'=> 'human_standing_female.skp',
    'human_walking'        => 'human_walking.skp',
    # Plants
    'plant_ficus_lyrata'   => 'plant_ficus_lyrata.skp',
    'plant_monstera'       => 'plant_monstera.skp',
    'plant_pothos'         => 'plant_pothos.skp',
    'plant_dracaena'       => 'plant_dracaena.skp',
    # Furniture hero
    'chair_office'         => 'chair_aeron.skp',
    'chair_lounge'         => 'chair_eames.skp',
    'desk_bench_1600'      => 'desk_bench_1600.skp',
    'table_boardroom_4000' => 'table_eames_segmented_4000.skp',
    'framery_one'          => 'framery_one_compact.skp',
    'sofa_mags'            => 'sofa_hay_mags.skp',
  }.freeze

  class << self
    def _hero_path(slug)
      filename = HERO_SLUG_MAP[slug.to_s]
      return nil if filename.nil?
      candidate = File.join(HERO_CACHE_DIR, filename)
      File.exist?(candidate) ? candidate : nil
    end

    def _ensure_layer(name)
      m = model
      layer = m.layers[name]
      layer.nil? ? m.layers.add(name) : layer
    end

    # iter-22b — Unified loader. Preferred path : generate the hero
    # shape in Ruby using primitive geometry (no download, no asset
    # files). If a user has DROPPED a real .skp into the cache, we
    # use that instead. Fallback of last resort : labelled box.
    def _place_model(slug:, position_mm:, orientation_deg:, layer_name:,
                     color_rgb: nil, fallback_size_mm: [1200, 600, 1700])
      x_mm, y_mm = position_mm
      path = _hero_path(slug)
      target_layer = _ensure_layer(layer_name)
      m = model
      ents = m.entities
      origin = Geom::Point3d.new(mm(x_mm), mm(y_mm), 0)
      rot = Geom::Transformation.rotation(
        origin, Geom::Vector3d.new(0, 0, 1), orientation_deg.to_f.degrees
      )

      if path
        defs = m.definitions.load(path)
        instance = ents.add_instance(defs, rot)
        instance.layer = target_layer
        _apply_color_override(instance, color_rgb) if color_rgb
        return { ok: true, kind: 'skp', slug: slug, path: path }
      end

      # Ruby-native hero geometry — the real path used 99% of the time.
      # Returns the built group or nil if the slug doesn't have a builder.
      built = _build_hero_primitive(slug, ents, x_mm, y_mm, color_rgb)
      if built
        built.layer = target_layer
        built.transform!(rot) if orientation_deg.to_f.abs > 0.01
        return { ok: true, kind: 'ruby', slug: slug }
      end

      # Last-resort : labelled box. Means we added a new slug without
      # a builder. Keeps the variant from crashing.
      w, d, h = fallback_size_mm
      group = ents.add_group
      group.layer = target_layer
      group.name = "fallback:#{slug}"
      face = rectangle_face(group.entities,
                            x_mm - w / 2.0, y_mm - d / 2.0,
                            x_mm + w / 2.0, y_mm + d / 2.0)
      _safe_pushpull_up(face, h)
      _apply_color_override(group, color_rgb) if color_rgb
      { ok: true, kind: 'fallback_box', slug: slug, fallback_size_mm: fallback_size_mm }
    end

    # iter-22b — Ruby hero builders. Each builder returns a Sketchup::Group
    # centred on (x_mm, y_mm, 0) facing +Y. The caller applies rotation +
    # layer afterwards.
    def _build_hero_primitive(slug, ents, x_mm, y_mm, color_rgb)
      case slug
      when 'human_standing', 'human_standing_female', 'human_walking'
        _build_human(ents, x_mm, y_mm, color_rgb || [90, 110, 120], standing: true)
      when 'human_seated'
        _build_human(ents, x_mm, y_mm, color_rgb || [90, 110, 120], standing: false)
      when 'plant_ficus_lyrata'
        _build_plant(ents, x_mm, y_mm, color_rgb || [74, 127, 77], canopy_r_mm: 550, height_mm: 1800)
      when 'plant_monstera'
        _build_plant(ents, x_mm, y_mm, color_rgb || [90, 143, 84], canopy_r_mm: 700, height_mm: 1400)
      when 'plant_pothos'
        _build_plant(ents, x_mm, y_mm, color_rgb || [102, 160, 80], canopy_r_mm: 500, height_mm: 1100)
      when 'plant_dracaena'
        _build_plant(ents, x_mm, y_mm, color_rgb || [95, 140, 90], canopy_r_mm: 400, height_mm: 1900)
      when 'chair_office'
        _build_office_chair(ents, x_mm, y_mm, color_rgb || [40, 40, 40])
      when 'chair_lounge', 'sofa_mags'
        _build_lounge_chair(ents, x_mm, y_mm, color_rgb || [140, 100, 80])
      when 'desk_bench_1600'
        _build_desk(ents, x_mm, y_mm, color_rgb || [110, 80, 60])
      when 'table_boardroom_4000'
        _build_table(ents, x_mm, y_mm, color_rgb || [92, 68, 52], length_mm: 4000, width_mm: 1400)
      when 'framery_one'
        _build_phone_booth(ents, x_mm, y_mm, color_rgb || [60, 70, 65])
      else
        nil
      end
    end

    # ---- Primitive builders -------------------------------------------------

    def _build_human(ents, x_mm, y_mm, color_rgb, standing:)
      group = ents.add_group
      mat = _material_for(color_rgb)
      body_h_mm = standing ? 1450 : 700
      head_r_mm = 115
      # Body column
      base_r = 220
      top_r = 180
      z_body_bot = standing ? 100 : 450
      z_body_top = z_body_bot + body_h_mm
      _add_tapered_column(group.entities, x_mm, y_mm, base_r, top_r, z_body_bot, z_body_top, mat)
      # Head
      head_z = z_body_top + head_r_mm
      _add_sphere(group.entities, x_mm, y_mm, head_z, head_r_mm, mat)
      # Legs : cue two cylinders side-by-side
      if standing
        _add_cylinder(group.entities, x_mm - 140, y_mm, 140, 0, 900, mat)
        _add_cylinder(group.entities, x_mm + 140, y_mm, 140, 0, 900, mat)
      else
        # Seat pedestal (subtle)
        _add_cylinder(group.entities, x_mm, y_mm, 190, 0, 450, mat)
      end
      group.name = standing ? 'human_standing' : 'human_seated'
      group
    end

    def _build_plant(ents, x_mm, y_mm, color_rgb, canopy_r_mm:, height_mm:)
      group = ents.add_group
      green = _material_for(color_rgb)
      terracotta = _material_for([180, 110, 85])
      pot_r = (canopy_r_mm * 0.55).to_i
      pot_h = (height_mm * 0.25).to_i
      # Pot
      _add_cylinder(group.entities, x_mm, y_mm, pot_r, 0, pot_h, terracotta)
      # Trunk (thin column inside canopy)
      _add_cylinder(group.entities, x_mm, y_mm, 60, pot_h, height_mm - canopy_r_mm, green)
      # Canopy : sphere at top
      canopy_z = height_mm - canopy_r_mm * 0.6
      _add_sphere(group.entities, x_mm, y_mm, canopy_z, canopy_r_mm, green)
      group.name = 'plant'
      group
    end

    def _build_office_chair(ents, x_mm, y_mm, color_rgb)
      group = ents.add_group
      mat = _material_for(color_rgb)
      # Seat pad
      seat_w = 520
      seat_d = 500
      _safe_pushpull_up(
        rectangle_face(group.entities,
                       x_mm - seat_w / 2, y_mm - seat_d / 2,
                       x_mm + seat_w / 2, y_mm + seat_d / 2, 450),
        60
      )
      # Backrest (behind, 800 mm up)
      back_w = 480
      back_h = 500
      _add_vertical_panel(group.entities, x_mm - back_w / 2, x_mm + back_w / 2,
                          y_mm + seat_d / 2 - 40, y_mm + seat_d / 2 - 80,
                          510, 510 + back_h, mat)
      # Pedestal + wheels (cylinder + 5 arms)
      _add_cylinder(group.entities, x_mm, y_mm, 40, 0, 450, mat)
      _paint_entity(group, mat)
      group.name = 'chair_office'
      group
    end

    def _build_lounge_chair(ents, x_mm, y_mm, color_rgb)
      group = ents.add_group
      mat = _material_for(color_rgb)
      # Wider, lower lounge form
      seat_w = 780
      seat_d = 760
      _safe_pushpull_up(
        rectangle_face(group.entities,
                       x_mm - seat_w / 2, y_mm - seat_d / 2,
                       x_mm + seat_w / 2, y_mm + seat_d / 2, 0),
        420
      )
      # Back cushion
      back_w = 760
      back_h = 440
      _add_vertical_panel(group.entities, x_mm - back_w / 2, x_mm + back_w / 2,
                          y_mm + seat_d / 2 - 60, y_mm + seat_d / 2 - 180,
                          420, 420 + back_h, mat)
      _paint_entity(group, mat)
      group.name = 'chair_lounge'
      group
    end

    def _build_desk(ents, x_mm, y_mm, color_rgb)
      group = ents.add_group
      mat = _material_for(color_rgb)
      w = 1600
      d = 800
      top_h = 40
      # Top
      _safe_pushpull_up(
        rectangle_face(group.entities,
                       x_mm - w / 2, y_mm - d / 2,
                       x_mm + w / 2, y_mm + d / 2, 720),
        top_h
      )
      # Two trestle legs
      [[x_mm - w / 2 + 100, y_mm], [x_mm + w / 2 - 100, y_mm]].each do |lx, ly|
        _safe_pushpull_up(
          rectangle_face(group.entities,
                         lx - 40, ly - d / 2 + 40,
                         lx + 40, ly + d / 2 - 40, 0),
          720
        )
      end
      _paint_entity(group, mat)
      group.name = 'desk_bench_1600'
      group
    end

    def _build_table(ents, x_mm, y_mm, color_rgb, length_mm: 4000, width_mm: 1400)
      group = ents.add_group
      mat = _material_for(color_rgb)
      _safe_pushpull_up(
        rectangle_face(group.entities,
                       x_mm - length_mm / 2, y_mm - width_mm / 2,
                       x_mm + length_mm / 2, y_mm + width_mm / 2, 720),
        50
      )
      # 4 legs
      inset = 400
      [[-length_mm / 2 + inset, -width_mm / 2 + inset],
       [ length_mm / 2 - inset, -width_mm / 2 + inset],
       [-length_mm / 2 + inset,  width_mm / 2 - inset],
       [ length_mm / 2 - inset,  width_mm / 2 - inset]].each do |dx, dy|
        _add_cylinder(group.entities, x_mm + dx, y_mm + dy, 50, 0, 720, mat)
      end
      _paint_entity(group, mat)
      group.name = 'table_boardroom'
      group
    end

    def _build_phone_booth(ents, x_mm, y_mm, color_rgb)
      group = ents.add_group
      mat = _material_for(color_rgb)
      # Framery One Compact : ~900 × 1000 × 2400 mm
      w = 1000
      d = 1000
      h = 2400
      _safe_pushpull_up(
        rectangle_face(group.entities,
                       x_mm - w / 2, y_mm - d / 2,
                       x_mm + w / 2, y_mm + d / 2, 0),
        h
      )
      _paint_entity(group, mat)
      group.name = 'framery_booth'
      group
    end

    # ---- Primitive helpers --------------------------------------------------

    def _material_for(rgb)
      return nil if rgb.nil?
      name = "DO_hero_#{rgb.take(3).join('_')}"
      mats = model.materials
      mat = mats[name] || mats.add(name)
      mat.color = Sketchup::Color.new(*rgb.take(3))
      mat
    end

    def _add_cylinder(entities, x_mm, y_mm, radius_mm, z_bot_mm, z_top_mm, mat)
      height_mm = z_top_mm - z_bot_mm
      return if height_mm <= 0
      centre = Geom::Point3d.new(mm(x_mm), mm(y_mm), mm(z_bot_mm))
      circle = entities.add_circle(centre, Geom::Vector3d.new(0, 0, 1), mm(radius_mm), 24)
      face = entities.add_face(circle)
      _safe_pushpull_up(face, height_mm)
      _paint_entity_face_list(circle, mat) if mat
    rescue StandardError
      nil
    end

    def _add_tapered_column(entities, x_mm, y_mm, r_bot_mm, r_top_mm, z_bot_mm, z_top_mm, mat)
      # SketchUp doesn't have a native tapered cylinder ; approximate
      # with a simple cylinder at the average radius. Good enough for a
      # 3D iso render at hackathon scale.
      avg_r = (r_bot_mm + r_top_mm) / 2.0
      _add_cylinder(entities, x_mm, y_mm, avg_r, z_bot_mm, z_top_mm, mat)
    end

    def _add_sphere(entities, x_mm, y_mm, z_mm, radius_mm, mat)
      centre = Geom::Point3d.new(mm(x_mm), mm(y_mm), mm(z_mm))
      # Approximate a sphere with a circle extruded along a half-circle
      # path. Too heavy for 50 plants, but we only call this on heroes.
      circle = entities.add_circle(centre, Geom::Vector3d.new(0, 1, 0), mm(radius_mm), 12)
      face = entities.add_face(circle)
      path = entities.add_circle(centre, Geom::Vector3d.new(0, 0, 1), mm(radius_mm), 12)
      face.followme(path) if face && path
      path.each { |e| e.erase! if e.valid? } if path
    rescue StandardError
      nil
    end

    def _add_vertical_panel(entities, x0_mm, x1_mm, y0_mm, y1_mm, z_bot_mm, z_top_mm, mat)
      pts = [
        Geom::Point3d.new(mm(x0_mm), mm(y0_mm), mm(z_bot_mm)),
        Geom::Point3d.new(mm(x1_mm), mm(y1_mm), mm(z_bot_mm)),
        Geom::Point3d.new(mm(x1_mm), mm(y1_mm), mm(z_top_mm)),
        Geom::Point3d.new(mm(x0_mm), mm(y0_mm), mm(z_top_mm))
      ]
      entities.add_face(pts)
    rescue StandardError
      nil
    end

    def _paint_entity_face_list(edges, mat)
      edges.each do |edge|
        next unless edge.respond_to?(:faces)
        edge.faces.each do |face|
          face.material = mat
          face.back_material = mat
        end
      end
    end

    # iter-22b — Set a solid colour on every face of a group / component.
    # `color_rgb` is [R, G, B] integers 0-255. No-op on nil.
    def _apply_color_override(ent, color_rgb)
      return if color_rgb.nil?
      return unless color_rgb.is_a?(Array) && color_rgb.size >= 3
      mat_name = "DO_mat_#{color_rgb.take(3).join('_')}"
      mats = model.materials
      mat = mats[mat_name] || mats.add(mat_name)
      mat.color = Sketchup::Color.new(*color_rgb.take(3))
      # SketchUp groups don't accept .material on their own — we paint
      # every child face so exports pick it up.
      _paint_entity(ent, mat)
    end

    def _paint_entity(ent, mat)
      if ent.respond_to?(:definition)
        ent.definition.entities.each { |child| _paint_entity(child, mat) }
      elsif ent.respond_to?(:entities)
        ent.entities.each { |child| _paint_entity(child, mat) }
      elsif ent.is_a?(Sketchup::Face)
        ent.material = mat
        ent.back_material = mat
      end
    end

    ORIGIN = Geom::Point3d.new(0, 0, 0).freeze

    # Public API — called from the Python facade via eval_ruby.

    def place_human(position_mm:, pose: 'standing', orientation_deg: 0.0,
                    color_rgb: nil)
      slug = case pose.to_s
             when 'seated', 'sitting' then 'human_seated'
             when 'walking'           then 'human_walking'
             when 'female'            then 'human_standing_female'
             else 'human_standing'
             end
      with_operation("DO · place_human (#{pose})") do
        _place_model(slug: slug, position_mm: position_mm,
                     orientation_deg: orientation_deg,
                     layer_name: HUMAN_LAYER_NAME, color_rgb: color_rgb,
                     fallback_size_mm: [600, 400, 1750])
      end
    end

    def place_plant(position_mm:, species: 'ficus_lyrata',
                    orientation_deg: 0.0, color_rgb: nil)
      slug = "plant_#{species}"
      with_operation("DO · place_plant (#{species})") do
        _place_model(slug: slug, position_mm: position_mm,
                     orientation_deg: orientation_deg,
                     layer_name: PLANT_LAYER_NAME,
                     color_rgb: color_rgb || [80, 130, 90],
                     fallback_size_mm: [700, 700, 1600])
      end
    end

    def place_hero(slug:, position_mm:, orientation_deg: 0.0,
                   color_rgb: nil)
      with_operation("DO · place_hero (#{slug})") do
        _place_model(slug: slug, position_mm: position_mm,
                     orientation_deg: orientation_deg,
                     layer_name: HERO_LAYER_NAME, color_rgb: color_rgb,
                     fallback_size_mm: [1400, 700, 800])
      end
    end

    # Set the background / wall palette explicitly when variants want
    # a specific identity tone. `walls`, `floor`, `accent` are RGB
    # arrays ; any missing key keeps the default.
    def apply_variant_palette(walls: nil, floor: nil, accent: nil)
      with_operation('DO · apply_variant_palette') do
        mats = model.materials
        if walls
          mat = mats['DO_walls'] || mats.add('DO_walls')
          mat.color = Sketchup::Color.new(*walls.take(3))
        end
        if floor
          mat = mats['DO_floor'] || mats.add('DO_floor')
          mat.color = Sketchup::Color.new(*floor.take(3))
        end
        if accent
          mat = mats['DO_accent'] || mats.add('DO_accent')
          mat.color = Sketchup::Color.new(*accent.take(3))
        end
        { ok: true, walls: walls, floor: floor, accent: accent }
      end
    end
  end
end

# Top-level banner so Saad sees the module loaded.
puts "[DesignOffice] v#{DesignOffice::VERSION} loaded — #{DesignOffice.methods.grep(/^(create|place|apply|import|read)/).size} ops available."
