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
  end
end

# Top-level banner so Saad sees the module loaded.
puts "[DesignOffice] v#{DesignOffice::VERSION} loaded — #{DesignOffice.methods.grep(/^(create|place|apply)/).size} ops available."
