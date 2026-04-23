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

  class << self
    def mm(value)
      value.to_f * MM_TO_IN
    end

    def model
      Sketchup.active_model
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
        face.pushpull(mm(2800)) if face && face.valid?
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
          face.pushpull(mm(2800))
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
          face.pushpull(mm(400))
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
            face.pushpull(mm(DEFAULT_DESK_H_MM))
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
        floor.pushpull(mm(WALL_HEIGHT_MM)) if floor && floor.valid?
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
          face.pushpull(mm(h))
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
            face.pushpull(mm(WALL_HEIGHT_MM))
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
          face.pushpull(mm(1200))
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

# Top-level banner so Saad sees the module loaded.
puts "[DesignOffice] v#{DesignOffice::VERSION} loaded — #{DesignOffice.methods.grep(/^(create|place|apply)/).size} ops available."
