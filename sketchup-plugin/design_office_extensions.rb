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
      # iter-29 — use a TRANSPARENT operation so this brackets the work
      # for undo grouping but COOPERATES with any outer transaction
      # the MCP eval_ruby layer already opened. Without the
      # transparent flag, sub-groups created inside `start_operation`
      # were wiped on `commit_operation` when invoked under the SU
      # MCP server's own transaction (every realistic-furniture
      # builder lost all its geometry). Args :
      #   start_operation(op_name, disable_ui, next_transparent, transparent)
      # Setting transparent=true merges this op into whatever parent
      # was already active, so commit_operation no longer rewinds.
      m = model
      m.start_operation(name, true, false, true)
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
      _dispatch_zone_op('workstation_cluster', count) do
        if realistic_furniture?
          _realistic_workstation_cluster(
            origin_mm[0].to_f, origin_mm[1].to_f,
            orientation_deg.to_f, count.to_i, row_spacing_mm.to_f,
          )
        else
          _legacy_workstation_cluster(
            origin_mm[0].to_f, origin_mm[1].to_f,
            orientation_deg.to_f, count.to_i, row_spacing_mm.to_f,
          )
        end
      end
    end

    # iter-29 — wrapper that replaces with_operation for the high-
    # level zone builders. The legacy with_operation called
    # start_operation(name, true) to bracket each draw, but on the
    # SketchUp MCP server side, that nested transaction interfered
    # with the realistic-mode sub-groups (every group created inside
    # the operation got rolled back on commit, leaving ents=0). We
    # simply rescue StandardError ourselves and skip the
    # start_operation wrapping ; SU_MCP's outer transaction handles
    # the undo grouping for us.
    def _dispatch_zone_op(name, result_value)
      begin
        yield
        { ok: true, result: result_value }
      rescue StandardError => e
        { ok: false, error: e.message,
          trace: e.backtrace && e.backtrace.first(3) }
      end
    end

    # iter-29 legacy — a single extruded cuboid per desk slot.
    # Preserved verbatim from pre-iter-29 so flag=false is a true rollback.
    def _legacy_workstation_cluster(ox_mm, oy_mm, orientation_deg, count, spacing)
      ents = model.active_entities
      width = DEFAULT_DESK_W_MM
      depth = DEFAULT_DESK_D_MM
      angle = orientation_deg * Math::PI / 180.0
      count.times do |i|
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
    end

    # iter-29 realistic — for each slot, place a bench desk + a task
    # chair tucked under it. One in three clusters gets a standing
    # human nearby for scale (architects read iso renders by people-
    # finding ; without a body the eye has no anchor).
    def _legacy_workstation_human_density
      0  # legacy never placed humans inside clusters
    end

    def _realistic_workstation_cluster(ox_mm, oy_mm, orientation_deg, count, spacing)
      ents = model.active_entities
      angle_rad = orientation_deg * Math::PI / 180.0
      cos_a = Math.cos(angle_rad)
      sin_a = Math.sin(angle_rad)
      desk_w = DEFAULT_DESK_W_MM
      desk_d = DEFAULT_DESK_D_MM
      # Chair offset perpendicular to the row direction. Row runs
      # along (cos α, sin α) ; perpendicular pointing "outside" of
      # the row (clockwise rotation by 90°) is (sin α, -cos α). That
      # places the chair south of the desk for orient=0 and east of
      # the desk for orient=90, both consistent with bench-desk layouts.
      chair_off_d = desk_d / 2.0 + 280.0
      perp_x = sin_a * chair_off_d
      perp_y = -cos_a * chair_off_d
      count.times do |i|
        slot_x = ox_mm + i * spacing * cos_a
        slot_y = oy_mm + i * spacing * sin_a
        desk_cx = slot_x + desk_w / 2.0
        desk_cy = slot_y + desk_d / 2.0
        _build_realistic_desk(ents, desk_cx, desk_cy, orientation_deg)
        # Chair behind the desk's user side, facing the desk
        # (orientation + 180° points the back toward outside).
        _build_realistic_task_chair(
          ents, desk_cx + perp_x, desk_cy + perp_y,
          orientation_deg + 180.0,
        )
      end
      # One standing human per ≥ 3-desk cluster, between two desks
      # halfway along the row, on the row's outside side.
      if count >= 3
        anchor_i = count / 2
        slot_x = ox_mm + anchor_i * spacing * cos_a
        slot_y = oy_mm + anchor_i * spacing * sin_a
        hx = slot_x + desk_w / 2.0 + perp_x * 2.0
        hy = slot_y + desk_d / 2.0 + perp_y * 2.0
        _build_realistic_human(ents, hx, hy, orientation_deg, variant: 0)
      end
    end

    def create_meeting_room(corner1_mm:, corner2_mm:, capacity: 0, name: 'meeting',
                            table_product: nil, **_ignored)
      _dispatch_zone_op("meeting_room:#{name}", name) do
        x0 = corner1_mm[0].to_f; y0 = corner1_mm[1].to_f
        x1 = corner2_mm[0].to_f; y1 = corner2_mm[1].to_f
        if realistic_furniture?
          _realistic_meeting_room(x0, y0, x1, y1, capacity.to_i, name.to_s)
        else
          _legacy_meeting_room(x0, y0, x1, y1)
        end
      end
    end

    # iter-29 legacy — wireframe walls + a single extruded floor volume.
    def _legacy_meeting_room(x0, y0, x1, y1)
      ents = model.active_entities
      floor = rectangle_face(ents, x0, y0, x1, y1)
      floor.material = colour([220, 230, 240]) if floor && floor.valid?
      _safe_pushpull_up(floor, WALL_HEIGHT_MM)
    end

    # iter-29 realistic — glazed enclosure + central table + chairs all
    # the way around the perimeter, scaled to capacity. ≥ 10 → boardroom
    # treatment (longer table, directorial chairs, wall-mounted screen
    # on the short edge facing the door).
    def _realistic_meeting_room(x0, y0, x1, y1, capacity, name)
      ents = model.active_entities
      xs = [x0, x1].minmax
      ys = [y0, y1].minmax
      cx = (xs[0] + xs[1]) / 2.0
      cy = (ys[0] + ys[1]) / 2.0
      room_w = xs[1] - xs[0]
      room_d = ys[1] - ys[0]
      mat_glass = _material_for([200, 220, 235])
      mat_floor = _material_for([225, 220, 210])

      # 1. Carpet floor tile — flat, no extrusion (visible underfoot).
      floor = rectangle_face(ents, xs[0], ys[0], xs[1], ys[1])
      floor.material = mat_floor if floor && floor.valid?

      # 2. Glazed walls — a thin perimeter strip on each edge, 50 mm
      #    thick, full WALL_HEIGHT_MM tall. The whole room reads as
      #    transparent glass partitions which is what high-end fit-outs
      #    actually look like.
      wall_t = 50
      _build_glazed_wall(ents, xs[0], ys[0], xs[1], ys[0] + wall_t, mat_glass)
      _build_glazed_wall(ents, xs[0], ys[1] - wall_t, xs[1], ys[1], mat_glass)
      _build_glazed_wall(ents, xs[0], ys[0], xs[0] + wall_t, ys[1], mat_glass)
      _build_glazed_wall(ents, xs[1] - wall_t, ys[0], xs[1], ys[1], mat_glass)

      # 3. Boardroom split : ≥ 10 capacity → wide rectangular table +
      #    directorial chairs + wall TV on the short edge ; otherwise
      #    standard meeting (6-8 capacity ≤ chairs around all edges).
      if capacity >= 10
        _build_realistic_boardroom_table(ents, cx, cy, room_w, room_d, capacity)
        _build_realistic_wall_tv(ents, cx, cy, xs, ys)
      else
        # Pick capacity heuristically when the agent didn't specify : a
        # 4×3 m room fits 6, 3×3 m fits 4.
        seats = capacity > 0 ? capacity : (room_w * room_d / 1_500_000.0).clamp(4, 8).to_i
        _build_realistic_meeting_table(ents, cx, cy, room_w, room_d, seats)
      end
    end

    # Used by phone_booth glazed door + meeting room walls.
    def _build_glazed_wall(ents, x0, y0, x1, y1, mat_glass)
      face = rectangle_face(ents, x0, y0, x1, y1)
      return unless face && face.valid?
      face.material = mat_glass if mat_glass
      _safe_pushpull_up(face, WALL_HEIGHT_MM)
    end

    def create_phone_booth(position_mm:, product_id: 'framery_one_compact', **_ignored)
      _dispatch_zone_op("phone_booth:#{product_id}", product_id) do
        x_mm = position_mm[0].to_f; y_mm = position_mm[1].to_f
        if realistic_furniture?
          _realistic_phone_booth(x_mm, y_mm)
        else
          _legacy_phone_booth(x_mm, y_mm)
        end
      end
    end

    # iter-29 legacy — single dark cuboid 1030 × 1000 × 2255.
    def _legacy_phone_booth(x_mm, y_mm)
      ents = model.active_entities
      face = rectangle_face(ents, x_mm, y_mm, x_mm + 1030, y_mm + 1000)
      if face && face.valid?
        face.material = colour([60, 60, 70])
        _safe_pushpull_up(face, 2255)
      end
    end

    # iter-29 realistic — Framery-style cabin : 4 panel walls (3 felt-
    # finish + 1 glazed front), a thin roof slab, and a small stool
    # inside.
    def _realistic_phone_booth(x_mm, y_mm)
      ents = model.active_entities
      group = ents.add_group
      group.name = 'do_real_phone_booth'
      g_ents = group.entities
      mat_felt = _material_for([60, 65, 70])
      mat_glass = _material_for([200, 220, 235])
      mat_roof = _material_for([45, 50, 55])
      mat_stool = _material_for([50, 55, 65])

      w = 1030; d = 1000; h = 2255
      panel_t = 50
      x1 = x_mm + w; y1 = y_mm + d

      # Three felt panels (left / right / back).
      [
        [x_mm, y_mm, x_mm + panel_t, y1],          # left
        [x1 - panel_t, y_mm, x1, y1],              # right
        [x_mm, y_mm, x1, y_mm + panel_t],          # back
      ].each do |x0, ya, xb, yb|
        f = rectangle_face(g_ents, x0, ya, xb, yb)
        if f && f.valid?
          f.material = mat_felt if mat_felt
          _safe_pushpull_up(f, h - 80)
        end
      end
      # Glazed front door — runs along y1, with a thin gap so a person
      # can "see" the entry.
      door_face = rectangle_face(
        g_ents, x_mm + panel_t, y1 - panel_t, x1 - panel_t, y1,
      )
      if door_face && door_face.valid?
        door_face.material = mat_glass if mat_glass
        _safe_pushpull_up(door_face, h - 80)
      end
      # Roof slab — thin plate from h-80 to h.
      roof_face = rectangle_face(g_ents, x_mm, y_mm, x1, y1, h - 80)
      if roof_face && roof_face.valid?
        roof_face.material = mat_roof if mat_roof
        _safe_pushpull_up(roof_face, 80)
      end
      # Low stool inside — cylinder centred-ish.
      stool_cx = x_mm + w * 0.4
      stool_cy = y_mm + d * 0.45
      _add_cylinder(g_ents, stool_cx, stool_cy, 200, 0, 460, mat_stool)
    end

    def create_partition_wall(start_mm:, end_mm:, kind: 'acoustic', **_ignored)
      _dispatch_zone_op("partition:#{kind}", kind) do
        if realistic_furniture?
          _realistic_partition_wall(start_mm, end_mm, kind.to_s)
        else
          _legacy_partition_wall(start_mm, end_mm, kind.to_s)
        end
      end
    end

    def _legacy_partition_wall(start_mm, end_mm, kind)
      ents = model.active_entities
      xa, ya = start_mm
      xb, yb = end_mm
      thickness_mm = kind == 'glazed' ? 60 : 100
      dx = xb - xa
      dy = yb - ya
      length = Math.sqrt(dx**2 + dy**2)
      return 'degenerate' if length < 10
      angle = Math.atan2(dy, dx)
      half_t = thickness_mm / 2.0
      nx = -Math.sin(angle) * half_t
      ny = Math.cos(angle) * half_t
      pts = [
        Geom::Point3d.new(mm(xa + nx), mm(ya + ny), 0),
        Geom::Point3d.new(mm(xb + nx), mm(yb + ny), 0),
        Geom::Point3d.new(mm(xb - nx), mm(yb - ny), 0),
        Geom::Point3d.new(mm(xa - nx), mm(ya - ny), 0),
      ]
      face = ents.add_face(pts)
      if face && face.valid?
        face.material = kind == 'glazed' ?
          colour([200, 220, 240]) : colour([210, 200, 180])
        _safe_pushpull_up(face, WALL_HEIGHT_MM)
      end
    end

    # iter-29 realistic — same volume but felt acoustic finish for non-
    # glazed kinds, slightly thicker, with a horizontal "joint" panel
    # halfway up to read as the typical 2-segment acoustic divider.
    def _realistic_partition_wall(start_mm, end_mm, kind)
      ents = model.active_entities
      xa, ya = start_mm
      xb, yb = end_mm
      dx = xb - xa
      dy = yb - ya
      length = Math.sqrt(dx**2 + dy**2)
      return if length < 10
      thickness_mm = kind == 'glazed' ? 80 : 120
      angle = Math.atan2(dy, dx)
      half_t = thickness_mm / 2.0
      nx = -Math.sin(angle) * half_t
      ny = Math.cos(angle) * half_t
      mat = if kind == 'glazed'
              _material_for([200, 220, 240])
            elsif kind == 'semi_glazed'
              _material_for([180, 195, 210])
            else
              _material_for([110, 95, 75])  # warm felt
            end
      pts = [
        Geom::Point3d.new(mm(xa + nx), mm(ya + ny), 0),
        Geom::Point3d.new(mm(xb + nx), mm(yb + ny), 0),
        Geom::Point3d.new(mm(xb - nx), mm(yb - ny), 0),
        Geom::Point3d.new(mm(xa - nx), mm(ya - ny), 0),
      ]
      face = ents.add_face(pts)
      if face && face.valid?
        face.material = mat if mat
        _safe_pushpull_up(face, WALL_HEIGHT_MM)
      end
    end

    def create_collab_zone(bbox_mm:, style: 'huddle_cluster', **_ignored)
      _dispatch_zone_op("collab_zone:#{style}", style) do
        x0, y0, x1, y1 = bbox_mm
        if realistic_furniture?
          _realistic_collab_zone(
            x0.to_f, y0.to_f, x1.to_f, y1.to_f, style.to_s,
          )
        else
          _legacy_collab_zone(
            x0.to_f, y0.to_f, x1.to_f, y1.to_f, style.to_s,
          )
        end
      end
    end

    # iter-29 legacy — flat tinted floor patch.
    def _legacy_collab_zone(x0, y0, x1, y1, style)
      ents = model.active_entities
      face = rectangle_face(ents, x0, y0, x1, y1)
      return unless face && face.valid?
      col =
        case style
        when 'cafe' then colour([200, 170, 130])
        when 'lounge' then colour([190, 180, 170])
        when 'townhall' then colour([201, 105, 78])
        else colour([180, 200, 190])
        end
      face.material = col
    end

    # iter-29 realistic — flat carpet + style-specific furniture
    # cluster centred in the bbox. Each style produces a distinct
    # silhouette (cafe = bistro tables + bar stools + counter ; lounge
    # = sofa + coffee table + armchairs ; huddle_cluster = small round
    # table + 4 chairs ; townhall = banquette steps facing a wall
    # screen).
    def _realistic_collab_zone(x0, y0, x1, y1, style)
      ents = model.active_entities
      xs = [x0, x1].minmax
      ys = [y0, y1].minmax
      cx = (xs[0] + xs[1]) / 2.0
      cy = (ys[0] + ys[1]) / 2.0
      w = xs[1] - xs[0]
      d = ys[1] - ys[0]
      # 1. Carpet floor patch — flat, no extrusion (just a tinted face).
      mat_carpet = case style
                   when 'cafe' then _material_for([165, 130, 95])
                   when 'lounge' then _material_for([175, 165, 150])
                   when 'townhall' then _material_for([175, 90, 70])
                   else _material_for([160, 175, 165])
                   end
      floor = rectangle_face(ents, xs[0], ys[0], xs[1], ys[1])
      floor.material = mat_carpet if floor && floor.valid? && mat_carpet
      # 2. Furniture by style.
      case style
      when 'cafe' then _build_realistic_cafe_zone(ents, cx, cy, w, d)
      when 'lounge' then _build_realistic_lounge_zone(ents, cx, cy, w, d)
      when 'townhall' then _build_realistic_townhall_zone(ents, cx, cy, w, d)
      else _build_realistic_huddle_zone(ents, cx, cy, w, d)
      end
    end

    def apply_biophilic_zone(bbox_mm:, **_ignored)
      _dispatch_zone_op('biophilic_zone', 'ok') do
        x0, y0, x1, y1 = bbox_mm
        if realistic_furniture?
          _realistic_biophilic_zone(x0.to_f, y0.to_f, x1.to_f, y1.to_f)
        else
          _legacy_biophilic_zone(x0.to_f, y0.to_f, x1.to_f, y1.to_f)
        end
      end
    end

    # iter-29 legacy — single 1.6 m green cylinder.
    def _legacy_biophilic_zone(x0, y0, x1, y1)
      ents = model.active_entities
      cx = (x0 + x1) / 2.0
      cy = (y0 + y1) / 2.0
      circle = ents.add_circle(Geom::Point3d.new(mm(cx), mm(cy), 0), Z_AXIS, mm(800))
      face = ents.add_face(circle)
      if face && face.valid?
        face.material = colour([110, 170, 110])
        _safe_pushpull_up(face, 1200)
      end
    end

    # iter-29 realistic — a clustered planter island : 3-5 plants of
    # varied species (Monstera / Ficus lyrata / Fern / tall potted),
    # each with a terracotta pot, drawn at deterministic positions
    # inside the bbox so the same FloorPlan reproduces the same
    # arrangement (no random drift between runs).
    def _realistic_biophilic_zone(x0, y0, x1, y1)
      ents = model.active_entities
      xs = [x0, x1].minmax
      ys = [y0, y1].minmax
      w = xs[1] - xs[0]
      d = ys[1] - ys[0]
      cx = (xs[0] + xs[1]) / 2.0
      cy = (ys[0] + ys[1]) / 2.0
      # Optional carpet hint — soft green floor tint.
      floor = rectangle_face(ents, xs[0], ys[0], xs[1], ys[1])
      floor.material = _material_for([195, 215, 195]) if floor && floor.valid?
      # 4 plant slots arranged around the centre. We pick the species
      # by quadrant so a wide variety always appears together.
      slots = [
        [cx - w * 0.25, cy - d * 0.25, :ficus],
        [cx + w * 0.25, cy - d * 0.25, :monstera],
        [cx - w * 0.25, cy + d * 0.25, :fern],
        [cx + w * 0.25, cy + d * 0.25, :tall_potted],
      ]
      slots.each do |sx, sy, species|
        _build_realistic_plant(ents, sx, sy, species)
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
      # iter-29 — when realistic mode is on, route to the iter-29
      # 3-variant builder (legs + torso + arms + neck + sphere head,
      # picked deterministically by the integer mm coordinates so the
      # same FloorPlan reproduces the same arrangement). Falls back
      # to the legacy tapered-column silhouette when the flag is off.
      if realistic_furniture?
        variant = ((x_mm.to_i / 100) ^ (y_mm.to_i / 100)) % REAL_HUMAN_VARIANTS
        return _build_realistic_human(
          ents, x_mm, y_mm, 0.0, variant: variant,
        )
      end

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
      # iter-29 — realistic mode picks a species variant from
      # height_mm + canopy_r_mm (the inputs the iter-22b hero builders
      # pass) so each agent-emitted plant slug renders as a distinct
      # silhouette : monstera (broad canopy) / ficus (slim tall) /
      # fern (low fluffy) / tall_potted (slender column).
      if realistic_furniture?
        species =
          if canopy_r_mm >= 600 && height_mm <= 1500 then :monstera
          elsif canopy_r_mm <= 450 && height_mm >= 1700 then :tall_potted
          elsif canopy_r_mm >= 500 && height_mm >= 1700 then :ficus
          else :fern
          end
        return _build_realistic_plant(ents, x_mm, y_mm, species)
      end

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
      # iter-29 — realistic task chair (5-star base, wheels, armrests).
      return _build_realistic_task_chair(ents, x_mm, y_mm, 0.0) if realistic_furniture?

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
      # iter-29 — realistic armchair with cushioned back panel.
      return _build_realistic_lounge_armchair(ents, x_mm, y_mm, 0.0) if realistic_furniture?

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
      # iter-29 — realistic warm-oak top + cable tray + black trestle legs.
      return _build_realistic_desk(ents, x_mm, y_mm, 0.0) if realistic_furniture?

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
      # iter-29 — realistic boardroom table + ringed chairs.
      if realistic_furniture?
        # Use the meeting-room table builder with a fictitious "room"
        # bbox sized 1.4× the table for chair clearance.
        room_w = length_mm * 1.4
        room_d = width_mm * 1.8
        return _build_realistic_boardroom_table(
          ents, x_mm, y_mm, room_w, room_d, 12,
        )
      end

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
      # iter-29 — realistic Framery cabin (felt walls + glazed door + stool).
      if realistic_furniture?
        # Position is the centre in this builder ; _realistic_phone_booth
        # uses the south-west corner. Translate accordingly.
        return _realistic_phone_booth(x_mm - 515, y_mm - 500)
      end

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

# ---------------------------------------------------------------------------
# iter-29 (Saad, 2026-04-25) — realistic furniture builders
# ---------------------------------------------------------------------------
#
# Programmatic Ruby geometry that replaces the iter-26-era flat
# extrusions with multi-piece volumes : desks paired with chairs,
# meeting tables surrounded by chairs, phone booths with glazed
# doors, biophilic clusters with terracotta-pot plants, etc. The
# parent module (block above) dispatches every high-level helper
# (create_workstation_cluster, create_meeting_room, …) to either the
# `_legacy_*` body (pre-iter-29 single-volume render, for flag=false
# rollback) or the `_realistic_*` body (this section).
#
# Constraints from Saad's iter-29 brief :
#   • coordinates are NEVER altered — we draw at the same xy the
#     agent emitted, never displace, never re-clamp (iter-28 owns
#     containment validation).
#   • everything reads `realistic_furniture?` so flag=false produces
#     a byte-identical sketchup_trace + screenshot to pre-iter-29.
#   • no external `.skp` files — 100% Ruby primitives.

module DesignOffice
  # Per-zone footprint constants (must match the values
  # zone_envelope_validator.py uses to reject overflow ; touching
  # these without updating the Python validator breaks iter-28).
  REAL_DESK_TOP_THICKNESS_MM = 30
  REAL_DESK_TOP_HEIGHT_MM = 720      # top of the desktop
  REAL_DESK_LEG_W_MM = 80
  REAL_DESK_LEG_H_MM = 690           # under the top thickness
  REAL_DESK_TOP_COLOUR = [205, 175, 130]   # warm oak
  REAL_DESK_LEG_COLOUR = [60, 60, 60]      # matte black

  REAL_CHAIR_SEAT_W_MM = 480
  REAL_CHAIR_SEAT_D_MM = 480
  REAL_CHAIR_SEAT_H_MM = 460
  REAL_CHAIR_SEAT_THICKNESS_MM = 60
  REAL_CHAIR_BACK_W_MM = 460
  REAL_CHAIR_BACK_H_MM = 480
  REAL_CHAIR_BASE_R_MM = 280         # 5-star base radius
  REAL_CHAIR_PEDESTAL_H_MM = 400
  REAL_CHAIR_FABRIC_COLOUR = [70, 75, 80]   # charcoal mesh
  REAL_CHAIR_BASE_COLOUR = [40, 40, 40]

  REAL_HUMAN_VARIANTS = 3

  class << self
    # ---- Realistic desk : oak top + 2 black legs + cable tray ------------
    def _build_realistic_desk(ents, cx_mm, cy_mm, orientation_deg)
      # Build legs / tray FIRST in a separate sub-group so we can paint
      # them dark independently from the top, then add the oak top last.
      group = ents.add_group
      group.name = 'do_real_desk'
      mat_top = _material_for(REAL_DESK_TOP_COLOUR)
      mat_leg = _material_for(REAL_DESK_LEG_COLOUR)
      g_ents = group.entities

      half_w = DEFAULT_DESK_W_MM / 2.0
      half_d = DEFAULT_DESK_D_MM / 2.0
      top_z_bot = REAL_DESK_TOP_HEIGHT_MM - REAL_DESK_TOP_THICKNESS_MM

      # Two trestle legs (matte black). Sub-group so paint is scoped.
      legs_group = g_ents.add_group
      legs_group.name = 'do_real_desk_legs'
      [-half_w + 200, half_w - 200].each do |dx|
        leg_face = rectangle_face(
          legs_group.entities,
          cx_mm + dx - REAL_DESK_LEG_W_MM / 2.0,
          cy_mm - half_d + 60,
          cx_mm + dx + REAL_DESK_LEG_W_MM / 2.0,
          cy_mm + half_d - 60, 0,
        )
        _safe_pushpull_up(leg_face, REAL_DESK_LEG_H_MM)
      end
      _paint_entity(legs_group, mat_leg) if mat_leg

      # Cable tray (matte black) under the back edge.
      tray_group = g_ents.add_group
      tray_group.name = 'do_real_desk_tray'
      tray_face = rectangle_face(
        tray_group.entities,
        cx_mm - half_w + 100, cy_mm + half_d - 200,
        cx_mm + half_w - 100, cy_mm + half_d - 100,
        REAL_DESK_LEG_H_MM - 80,
      )
      _safe_pushpull_up(tray_face, 30)
      _paint_entity(tray_group, mat_leg) if mat_leg

      # Desktop (oak) — last so it sits on top visually.
      top_group = g_ents.add_group
      top_group.name = 'do_real_desk_top'
      top_face = rectangle_face(
        top_group.entities,
        cx_mm - half_w, cy_mm - half_d,
        cx_mm + half_w, cy_mm + half_d, top_z_bot,
      )
      _safe_pushpull_up(top_face, REAL_DESK_TOP_THICKNESS_MM)
      _paint_entity(top_group, mat_top) if mat_top

      _rotate_group_z(group, cx_mm, cy_mm, orientation_deg)
      group
    end

    # ---- Realistic task chair : seat + back + 5-star base + pedestal ----
    def _build_realistic_task_chair(ents, cx_mm, cy_mm, orientation_deg)
      group = ents.add_group
      group.name = 'do_real_chair_task'
      mat_fabric = _material_for(REAL_CHAIR_FABRIC_COLOUR)
      mat_base = _material_for(REAL_CHAIR_BASE_COLOUR)
      g_ents = group.entities

      # Pedestal cylinder 0..400 mm.
      _add_cylinder(g_ents, cx_mm, cy_mm, 30,
                    0, REAL_CHAIR_PEDESTAL_H_MM, mat_base)
      # 5-star base : 5 short bars radiating at 0, 72, 144, 216, 288 deg.
      5.times do |k|
        ang = k * 72.0 * Math::PI / 180.0
        bx = cx_mm + Math.cos(ang) * REAL_CHAIR_BASE_R_MM
        by = cy_mm + Math.sin(ang) * REAL_CHAIR_BASE_R_MM
        bar_face = rectangle_face(
          g_ents, cx_mm - 25, cy_mm - 25, cx_mm + 25, cy_mm + 25, 0,
        )
        # Translate the bar end as a thin extruded panel (shortcut).
        _safe_pushpull_up(bar_face, 80)
        # Wheel cylinder at the tip.
        _add_cylinder(g_ents, bx, by, 35, 0, 70, mat_base)
      end
      # Seat pad.
      seat_z = REAL_CHAIR_PEDESTAL_H_MM + 60
      seat_face = rectangle_face(
        g_ents,
        cx_mm - REAL_CHAIR_SEAT_W_MM / 2.0,
        cy_mm - REAL_CHAIR_SEAT_D_MM / 2.0,
        cx_mm + REAL_CHAIR_SEAT_W_MM / 2.0,
        cy_mm + REAL_CHAIR_SEAT_D_MM / 2.0,
        seat_z,
      )
      _safe_pushpull_up(seat_face, REAL_CHAIR_SEAT_THICKNESS_MM)
      # Back rest panel — angled slightly back, behind the seat (in
      # local +Y after rotation). Drawn as a vertical panel at the
      # seat's back edge.
      back_z_bot = seat_z + REAL_CHAIR_SEAT_THICKNESS_MM
      back_z_top = back_z_bot + REAL_CHAIR_BACK_H_MM
      _add_vertical_panel(
        g_ents,
        cx_mm - REAL_CHAIR_BACK_W_MM / 2.0,
        cx_mm + REAL_CHAIR_BACK_W_MM / 2.0,
        cy_mm + REAL_CHAIR_SEAT_D_MM / 2.0 - 40,
        cy_mm + REAL_CHAIR_SEAT_D_MM / 2.0 - 80,
        back_z_bot, back_z_top, mat_fabric,
      )
      # Two armrests : narrow horizontal bars at seat-z + 200 mm.
      arm_z = seat_z + 220
      [-1, 1].each do |side|
        arm_x = cx_mm + side * (REAL_CHAIR_SEAT_W_MM / 2.0 + 30)
        arm_face = rectangle_face(
          g_ents,
          arm_x - 25, cy_mm - REAL_CHAIR_SEAT_D_MM / 2.0 + 80,
          arm_x + 25, cy_mm + REAL_CHAIR_SEAT_D_MM / 2.0 - 100,
          arm_z,
        )
        _safe_pushpull_up(arm_face, 50)
      end
      _paint_entity(group, mat_fabric) if mat_fabric
      _rotate_group_z(group, cx_mm, cy_mm, orientation_deg)
      group
    end

    # ---- Realistic human (3 distinct silhouettes, picked by variant) ---
    # variant 0 : standing male
    # variant 1 : standing female (slimmer + longer hair sphere)
    # variant 2 : walking (one leg forward)
    def _build_realistic_human(ents, cx_mm, cy_mm, orientation_deg, variant: 0)
      group = ents.add_group
      group.name = "do_real_human_v#{variant}"
      g_ents = group.entities
      v = variant.to_i % REAL_HUMAN_VARIANTS

      skin_rgb = case v
                 when 0 then [220, 200, 180]
                 when 1 then [225, 205, 185]
                 else [215, 195, 175]
                 end
      shirt_rgb = case v
                  when 0 then [55, 75, 105]   # navy
                  when 1 then [180, 90, 70]   # terracotta
                  else [70, 90, 75]           # forest green
                  end
      legs_rgb = [40, 45, 60]                 # dark indigo
      mat_skin = _material_for(skin_rgb)
      mat_shirt = _material_for(shirt_rgb)
      mat_legs = _material_for(legs_rgb)

      # Legs (cylinders) — variant 2 has one leg forward.
      leg_offset_y = (v == 2) ? 100 : 0
      _add_cylinder(g_ents, cx_mm - 110, cy_mm, 80, 0, 920, mat_legs)
      _add_cylinder(g_ents, cx_mm + 110, cy_mm + leg_offset_y,
                    80, 0, 920, mat_legs)
      # Torso — taller cylinder with shirt material.
      torso_r = (v == 1) ? 200 : 230
      _add_cylinder(g_ents, cx_mm, cy_mm, torso_r, 920, 1620, mat_shirt)
      # Arms — short cylinders next to the torso.
      _add_cylinder(g_ents, cx_mm - torso_r - 50, cy_mm,
                    65, 1100, 1550, mat_shirt)
      _add_cylinder(g_ents, cx_mm + torso_r + 50, cy_mm,
                    65, 1100, 1550, mat_shirt)
      # Neck.
      _add_cylinder(g_ents, cx_mm, cy_mm, 60, 1620, 1700, mat_skin)
      # Head — sphere via _add_sphere.
      _add_sphere(g_ents, cx_mm, cy_mm, 1820, 110, mat_skin)
      # Variant 1 — long hair = a slightly larger sphere offset back.
      if v == 1
        _add_sphere(g_ents, cx_mm, cy_mm + 30, 1810, 130,
                    _material_for([60, 45, 30]))
      end
      _rotate_group_z(group, cx_mm, cy_mm, orientation_deg)
      group
    end

    # Rotate a group around the world Z axis through (cx_mm, cy_mm).
    def _rotate_group_z(group, cx_mm, cy_mm, angle_deg)
      return if group.nil? || !group.valid?
      return if angle_deg.to_f.abs < 0.01
      origin = Geom::Point3d.new(mm(cx_mm), mm(cy_mm), 0)
      axis = Geom::Vector3d.new(0, 0, 1)
      rot = Geom::Transformation.rotation(
        origin, axis, angle_deg.to_f * Math::PI / 180.0,
      )
      group.transform!(rot)
    end

    # ---- Meeting / Boardroom tables -----------------------------------

    # Standard meeting room : oval-feel table (rectangle with rounded
    # corners visually approximated by a single flat slab) + chairs all
    # around the perimeter.
    def _build_realistic_meeting_table(ents, cx_mm, cy_mm, room_w_mm,
                                       room_d_mm, seats)
      table_w = (room_w_mm * 0.55).clamp(1400, 3200)
      table_d = (room_d_mm * 0.45).clamp(900, 1500)
      mat_top = _material_for([195, 165, 120])     # warm oak
      mat_leg = _material_for([55, 55, 55])

      group = ents.add_group
      group.name = 'do_real_meeting_table'
      g = group.entities
      # Table top
      top = rectangle_face(
        g, cx_mm - table_w / 2.0, cy_mm - table_d / 2.0,
        cx_mm + table_w / 2.0, cy_mm + table_d / 2.0, 720,
      )
      _safe_pushpull_up(top, 35)
      _paint_entity(group, mat_top) if mat_top
      # Cylindrical pedestal in the middle.
      _add_cylinder(g, cx_mm, cy_mm, 80, 0, 720, mat_leg)

      # Chairs — distribute around the long sides + ends.
      chair_offset = 350    # distance from table edge to chair centre
      seats_long = ((seats - 2) / 2.0).ceil.clamp(1, 4)
      # Long edges (top + bottom)
      seats_long.times do |i|
        ratio = (i + 1.0) / (seats_long + 1.0)
        x = cx_mm - table_w / 2.0 + table_w * ratio
        _build_realistic_task_chair(
          ents, x, cy_mm - table_d / 2.0 - chair_offset, 0.0,
        )
        _build_realistic_task_chair(
          ents, x, cy_mm + table_d / 2.0 + chair_offset, 180.0,
        )
      end
      # Short edges (left + right) when seats_long * 2 + 2 == seats.
      _build_realistic_task_chair(
        ents, cx_mm - table_w / 2.0 - chair_offset, cy_mm, 90.0,
      )
      _build_realistic_task_chair(
        ents, cx_mm + table_w / 2.0 + chair_offset, cy_mm, -90.0,
      )
    end

    # Boardroom : rectangular boardroom table (longer + narrower) +
    # 10–12 directorial chairs + wall-mounted screen on a short edge.
    def _build_realistic_boardroom_table(ents, cx_mm, cy_mm, room_w_mm,
                                         room_d_mm, capacity)
      table_w = (room_w_mm * 0.65).clamp(2800, 5500)
      table_d = (room_d_mm * 0.35).clamp(1100, 1500)
      mat_top = _material_for([110, 80, 60])     # walnut
      mat_leg = _material_for([45, 45, 45])

      group = ents.add_group
      group.name = 'do_real_boardroom_table'
      g = group.entities
      top = rectangle_face(
        g, cx_mm - table_w / 2.0, cy_mm - table_d / 2.0,
        cx_mm + table_w / 2.0, cy_mm + table_d / 2.0, 720,
      )
      _safe_pushpull_up(top, 50)
      _paint_entity(group, mat_top) if mat_top
      # Two trestle pedestals 20% in from each end.
      [-1, 1].each do |side|
        _add_cylinder(
          g, cx_mm + side * table_w * 0.3, cy_mm, 90, 0, 720, mat_leg,
        )
      end
      # Chairs on the long edges only — directorial style means more
      # space per chair, so we cap at 6 per side.
      chair_count_per_side = ((capacity - 2) / 2.0).ceil.clamp(3, 6)
      chair_offset = 380
      chair_count_per_side.times do |i|
        ratio = (i + 1.0) / (chair_count_per_side + 1.0)
        x = cx_mm - table_w / 2.0 + table_w * ratio
        _build_realistic_task_chair(
          ents, x, cy_mm - table_d / 2.0 - chair_offset, 0.0,
        )
        _build_realistic_task_chair(
          ents, x, cy_mm + table_d / 2.0 + chair_offset, 180.0,
        )
      end
      # Two head chairs at the ends.
      _build_realistic_task_chair(
        ents, cx_mm - table_w / 2.0 - chair_offset, cy_mm, 90.0,
      )
      _build_realistic_task_chair(
        ents, cx_mm + table_w / 2.0 + chair_offset, cy_mm, -90.0,
      )
    end

    # Wall-mounted screen : flat dark panel on the room's "short" wall.
    def _build_realistic_wall_tv(ents, cx_mm, cy_mm, xs, ys)
      # Pick the short edge closest to the centre.
      room_w = xs[1] - xs[0]
      room_d = ys[1] - ys[0]
      mat_screen = _material_for([20, 20, 25])
      mat_frame = _material_for([60, 60, 60])
      tv_w = 1800
      tv_h = 1100
      tv_z = 1100
      # Mount on the +X wall when the room is wider than deep, else +Y.
      if room_w >= room_d
        x_wall = xs[1] - 60
        _add_vertical_panel(
          ents, x_wall, x_wall - 30,
          cy_mm - tv_w / 2.0, cy_mm + tv_w / 2.0,
          tv_z, tv_z + tv_h, mat_screen,
        )
      else
        y_wall = ys[1] - 60
        _add_vertical_panel(
          ents, cx_mm - tv_w / 2.0, cx_mm + tv_w / 2.0,
          y_wall, y_wall - 30,
          tv_z, tv_z + tv_h, mat_screen,
        )
      end
      mat_frame  # silence unused-var warning if present
    end

    # ---- Collab zones — style-specific furniture clusters ----------------

    def _build_realistic_huddle_zone(ents, cx_mm, cy_mm, w_mm, d_mm)
      mat_top = _material_for([200, 170, 130])
      mat_leg = _material_for([50, 50, 50])
      # Round table — approximate via 16-sided cylinder.
      table_r = 600
      _add_cylinder(ents, cx_mm, cy_mm, table_r, 720, 760, mat_top)
      _add_cylinder(ents, cx_mm, cy_mm, 80, 0, 720, mat_leg)
      # 4 chairs around it — N/E/S/W positions.
      chair_d = table_r + 380
      4.times do |i|
        ang = i * Math::PI / 2.0
        cx = cx_mm + chair_d * Math.cos(ang)
        cy = cy_mm + chair_d * Math.sin(ang)
        _build_realistic_task_chair(
          ents, cx, cy, (i * 90.0 + 180.0) % 360.0,
        )
      end
    end

    def _build_realistic_cafe_zone(ents, cx_mm, cy_mm, w_mm, d_mm)
      mat_top = _material_for([220, 200, 170])
      mat_leg = _material_for([40, 40, 40])
      mat_counter = _material_for([110, 80, 60])
      # If wide enough, add a kitchen counter on one long side.
      if w_mm >= 5000
        counter_d = 700
        counter_face = rectangle_face(
          ents, cx_mm - w_mm * 0.4, cy_mm + d_mm / 2.0 - counter_d - 200,
          cx_mm + w_mm * 0.4, cy_mm + d_mm / 2.0 - 200,
        )
        if counter_face && counter_face.valid?
          counter_face.material = mat_counter if mat_counter
          _safe_pushpull_up(counter_face, 950)
        end
      end
      # 2-3 round bistro tables + 4 stools each.
      n_tables = (w_mm / 2400).clamp(1, 3).to_i
      step_x = w_mm / (n_tables + 1.0)
      n_tables.times do |i|
        tx = cx_mm - w_mm / 2.0 + step_x * (i + 1)
        ty = cy_mm - d_mm * 0.1
        _add_cylinder(ents, tx, ty, 450, 760, 800, mat_top)
        _add_cylinder(ents, tx, ty, 70, 0, 760, mat_leg)
        # 4 bar stools — taller seat (770 mm).
        4.times do |k|
          ang = k * Math::PI / 2.0 + Math::PI / 4.0
          sx = tx + 750 * Math.cos(ang)
          sy = ty + 750 * Math.sin(ang)
          _add_cylinder(ents, sx, sy, 200, 0, 770, mat_leg)
          _add_cylinder(ents, sx, sy, 220, 770, 800, mat_top)
        end
      end
    end

    def _build_realistic_lounge_zone(ents, cx_mm, cy_mm, w_mm, d_mm)
      mat_sofa = _material_for([95, 75, 60])      # warm tan leather
      mat_cushion = _material_for([225, 215, 195])
      mat_table = _material_for([55, 50, 45])
      # Sofa : 2200 × 850 oriented along x.
      sofa_w = 2200; sofa_d = 850; sofa_h = 460; back_h = 420
      sofa_cx = cx_mm
      sofa_cy = cy_mm - d_mm * 0.15
      seat = rectangle_face(
        ents, sofa_cx - sofa_w / 2.0, sofa_cy - sofa_d / 2.0,
        sofa_cx + sofa_w / 2.0, sofa_cy + sofa_d / 2.0,
      )
      if seat && seat.valid?
        seat.material = mat_sofa if mat_sofa
        _safe_pushpull_up(seat, sofa_h)
      end
      # Backrest panel (along the back edge).
      _add_vertical_panel(
        ents, sofa_cx - sofa_w / 2.0, sofa_cx + sofa_w / 2.0,
        sofa_cy - sofa_d / 2.0 + 50, sofa_cy - sofa_d / 2.0 + 250,
        sofa_h, sofa_h + back_h, mat_sofa,
      )
      # Cushions — 3 pillow slabs on the seat.
      3.times do |i|
        cx = sofa_cx - sofa_w / 2.0 + sofa_w * (i + 0.5) / 3.0
        cy = sofa_cy
        c_face = rectangle_face(
          ents, cx - 280, cy - 240, cx + 280, cy + 240, sofa_h,
        )
        if c_face && c_face.valid?
          c_face.material = mat_cushion if mat_cushion
          _safe_pushpull_up(c_face, 80)
        end
      end
      # Coffee table : 1100 × 600 in front of sofa.
      ct_face = rectangle_face(
        ents, cx_mm - 550, cy_mm + d_mm * 0.05 - 300,
        cx_mm + 550, cy_mm + d_mm * 0.05 + 300,
      )
      if ct_face && ct_face.valid?
        ct_face.material = mat_table if mat_table
        _safe_pushpull_up(ct_face, 380)
      end
      # Two armchairs — sides of the coffee table.
      [-1, 1].each do |side|
        ax = cx_mm + side * (550 + 600)
        ay = cy_mm + d_mm * 0.05
        _build_realistic_lounge_armchair(ents, ax, ay, side == -1 ? 90.0 : -90.0)
      end
    end

    def _build_realistic_lounge_armchair(ents, cx_mm, cy_mm, orientation_deg)
      group = ents.add_group
      group.name = 'do_real_armchair'
      g = group.entities
      mat = _material_for([130, 105, 85])
      seat_w = 760; seat_d = 760; seat_h = 420; back_h = 460
      seat = rectangle_face(
        g, cx_mm - seat_w / 2.0, cy_mm - seat_d / 2.0,
        cx_mm + seat_w / 2.0, cy_mm + seat_d / 2.0,
      )
      _safe_pushpull_up(seat, seat_h)
      _add_vertical_panel(
        g, cx_mm - seat_w / 2.0, cx_mm + seat_w / 2.0,
        cy_mm + seat_d / 2.0 - 50, cy_mm + seat_d / 2.0 - 250,
        seat_h, seat_h + back_h, mat,
      )
      _paint_entity(group, mat) if mat
      _rotate_group_z(group, cx_mm, cy_mm, orientation_deg)
      group
    end

    def _build_realistic_townhall_zone(ents, cx_mm, cy_mm, w_mm, d_mm)
      mat_seat = _material_for([175, 90, 70])     # terracotta cushion
      mat_step = _material_for([85, 75, 70])      # stained wood riser
      # 3 tiered banquettes facing +Y. Heights 0/300/600 mm.
      step_d = (d_mm * 0.7) / 3.0
      step_w = w_mm * 0.85
      [0, 300, 600].each_with_index do |z_bot, i|
        riser = rectangle_face(
          ents,
          cx_mm - step_w / 2.0, cy_mm - d_mm * 0.35 + i * step_d,
          cx_mm + step_w / 2.0, cy_mm - d_mm * 0.35 + (i + 1) * step_d,
        )
        if riser && riser.valid?
          riser.material = (i.even? ? mat_step : mat_seat) if mat_step
          _safe_pushpull_up(riser, z_bot + 100)
        end
      end
      # Wall screen at +Y end.
      _add_vertical_panel(
        ents, cx_mm - 1500, cx_mm + 1500,
        cy_mm - d_mm * 0.35 - 100, cy_mm - d_mm * 0.35 - 130,
        1200, 2400, _material_for([20, 20, 25]),
      )
    end

    # ---- Plants — varied species (Monstera / Ficus / fern / tall potted) -

    def _build_realistic_plant(ents, cx_mm, cy_mm, species)
      group = ents.add_group
      group.name = "do_real_plant_#{species}"
      g = group.entities
      mat_pot = _material_for([175, 105, 80])     # terracotta
      case species
      when :monstera
        _add_cylinder(g, cx_mm, cy_mm, 280, 0, 380, mat_pot)
        # Big fan-leaved canopy via overlapping flat ovals.
        mat_leaf = _material_for([55, 110, 65])
        canopy_h = 950
        _add_sphere(g, cx_mm, cy_mm, 380 + canopy_h * 0.4, 480, mat_leaf)
        _add_cylinder(g, cx_mm, cy_mm, 35, 380, 380 + canopy_h * 0.6,
                      _material_for([90, 70, 50]))
      when :ficus
        _add_cylinder(g, cx_mm, cy_mm, 250, 0, 320, mat_pot)
        mat_leaf = _material_for([45, 95, 55])
        # Tall slender canopy.
        _add_cylinder(g, cx_mm, cy_mm, 30, 320, 1750,
                      _material_for([90, 70, 50]))
        _add_sphere(g, cx_mm, cy_mm, 1450, 420, mat_leaf)
        _add_sphere(g, cx_mm, cy_mm + 200, 1300, 320, mat_leaf)
      when :fern
        _add_cylinder(g, cx_mm, cy_mm, 320, 0, 280, mat_pot)
        mat_leaf = _material_for([85, 140, 80])
        # Low fluffy canopy — multiple small spheres clustered.
        4.times do |i|
          ang = i * Math::PI / 2.0
          fx = cx_mm + 220 * Math.cos(ang)
          fy = cy_mm + 220 * Math.sin(ang)
          _add_sphere(g, fx, fy, 580, 240, mat_leaf)
        end
        _add_sphere(g, cx_mm, cy_mm, 720, 280, mat_leaf)
      when :tall_potted
        _add_cylinder(g, cx_mm, cy_mm, 220, 0, 480, mat_pot)
        mat_leaf = _material_for([70, 120, 75])
        # Single tall trunk + 2 narrow canopy spheres stacked.
        _add_cylinder(g, cx_mm, cy_mm, 30, 480, 1900,
                      _material_for([90, 70, 50]))
        _add_sphere(g, cx_mm, cy_mm, 1800, 240, mat_leaf)
        _add_sphere(g, cx_mm, cy_mm, 2050, 200, mat_leaf)
      else
        _add_cylinder(g, cx_mm, cy_mm, 280, 0, 350, mat_pot)
        _add_sphere(g, cx_mm, cy_mm, 850, 380,
                    _material_for([85, 130, 90]))
      end
      _paint_entity(group, mat_pot) if mat_pot
      group
    end
  end
end

# Top-level banner so Saad sees the module loaded.
puts "[DesignOffice] v#{DesignOffice::VERSION} loaded — #{DesignOffice.methods.grep(/^(create|place|apply|import|read)/).size} ops available. realistic_furniture=#{DesignOffice.realistic_furniture?}"
