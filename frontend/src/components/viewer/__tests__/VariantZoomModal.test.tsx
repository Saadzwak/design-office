/**
 * iter-25 — Vitest coverage for VariantZoomModal :
 *  - opens when `variant` prop is non-null, hides otherwise
 *  - Escape key closes
 *  - clicking the scrim closes
 *  - clicking inside the panel does NOT close
 *  - active + ≥2 angle sources renders PseudoThreeDViewer
 *  - inactive renders single <img> with the resolved URL
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import VariantZoomModal from "../VariantZoomModal";
import type { DesignVariant } from "../../../lib/adapters/variantAdapter";
import type { VariantOutput } from "../../../lib/api";

afterEach(() => {
  // Make sure the body-scroll lock from one test doesn't leak.
  document.body.style.overflow = "";
});

const STUB_RAW: VariantOutput = {
  style: "atelier",
  title: "Atelier · stub",
  narrative: "stub narrative",
  metrics: {
    workstation_count: 30,
    meeting_room_count: 2,
    phone_booth_count: 4,
    collab_surface_m2: 80,
    amenity_surface_m2: 60,
    circulation_m2: 70,
    total_programmed_m2: 420,
    flex_ratio_applied: 0.8,
    notes: [],
  },
  sketchup_trace: [],
  screenshot_paths: [],
  sketchup_shot_url: "/api/testfit/screenshot/stub.png",
  sketchup_shot_urls: {
    iso_ne: "/api/testfit/screenshot/stub_iso_ne.png",
    iso_nw: "/api/testfit/screenshot/stub_iso_nw.png",
    iso_se: "/api/testfit/screenshot/stub_iso_se.png",
    iso_sw: "/api/testfit/screenshot/stub_iso_sw.png",
    top_down: "/api/testfit/screenshot/stub_top.png",
    eye_level: "/api/testfit/screenshot/stub_eye.png",
  },
  adjacency_audit: null,
};

const STUB_VARIANT: DesignVariant = {
  id: "atelier",
  name: "Atelier · stub",
  pigment: "sand",
  pitch: "Stub pitch",
  metrics: {
    desks: 30,
    density: "14.0 m²/FTE",
    flex: "0.80",
    adjacency: "85%",
  },
  warnings: [],
  zones: [],
  rooms: [],
  walls: [],
  raw: STUB_RAW,
};

describe("VariantZoomModal", () => {
  it("renders nothing when variant is null", () => {
    render(
      <VariantZoomModal
        variant={null}
        imgUrl={null}
        isActive={false}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByTestId("variant-zoom-scrim")).toBeNull();
    expect(screen.queryByTestId("variant-zoom-panel")).toBeNull();
  });

  it("renders the scrim + panel + variant name when variant is provided", () => {
    render(
      <VariantZoomModal
        variant={STUB_VARIANT}
        imgUrl="/api/testfit/screenshot/stub.png"
        isActive={false}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("variant-zoom-scrim")).toBeInTheDocument();
    const panel = screen.getByTestId("variant-zoom-panel");
    expect(panel).toBeInTheDocument();
    expect(within(panel).getByText("Atelier · stub")).toBeInTheDocument();
  });

  it("calls onClose on Escape keydown", () => {
    const onClose = vi.fn();
    render(
      <VariantZoomModal
        variant={STUB_VARIANT}
        imgUrl="/api/testfit/screenshot/stub.png"
        isActive={false}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on scrim click but NOT on panel click", () => {
    const onClose = vi.fn();
    render(
      <VariantZoomModal
        variant={STUB_VARIANT}
        imgUrl="/api/testfit/screenshot/stub.png"
        isActive={false}
        onClose={onClose}
      />,
    );
    const scrim = screen.getByTestId("variant-zoom-scrim");
    const panel = screen.getByTestId("variant-zoom-panel");
    // Clicking the panel itself must NOT close (event.target !== currentTarget).
    fireEvent.click(panel);
    expect(onClose).not.toHaveBeenCalled();
    // Clicking the scrim's empty area DOES close.
    fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("close button calls onClose", () => {
    const onClose = vi.fn();
    render(
      <VariantZoomModal
        variant={STUB_VARIANT}
        imgUrl="/api/testfit/screenshot/stub.png"
        isActive={true}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId("variant-zoom-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders single <img> when isActive is false (per spec §5)", () => {
    render(
      <VariantZoomModal
        variant={STUB_VARIANT}
        imgUrl="/api/testfit/screenshot/stub.png"
        isActive={false}
        onClose={() => {}}
      />,
    );
    const panel = screen.getByTestId("variant-zoom-panel");
    const img = within(panel).getByRole("img");
    expect(img).toHaveAttribute("src", "/api/testfit/screenshot/stub.png");
    // No PseudoThreeDViewer thumbnail dock buttons visible (NE/NW/SE/SW/Top/Eye).
    expect(within(panel).queryByText("NE")).toBeNull();
    expect(within(panel).queryByText("Top")).toBeNull();
  });

  it("renders PseudoThreeDViewer thumbnail dock when isActive + ≥2 angle URLs (per spec §4)", () => {
    render(
      <VariantZoomModal
        variant={STUB_VARIANT}
        imgUrl="/api/testfit/screenshot/stub.png"
        isActive={true}
        onClose={() => {}}
      />,
    );
    const panel = screen.getByTestId("variant-zoom-panel");
    // Six angle thumbnails should be present (each label can occur in
    // both the dock button and a hidden a11y tooltip — getAllByText
    // tolerates duplicates ; we only assert ≥1 occurrence).
    for (const label of ["NE", "NW", "SE", "SW", "Top", "Eye"]) {
      const matches = within(panel).getAllByText(label);
      expect(matches.length).toBeGreaterThan(0);
    }
  });

  it("locks body scroll while open and restores on close", () => {
    const { rerender } = render(
      <VariantZoomModal
        variant={STUB_VARIANT}
        imgUrl="/api/testfit/screenshot/stub.png"
        isActive={false}
        onClose={() => {}}
      />,
    );
    expect(document.body.style.overflow).toBe("hidden");
    rerender(
      <VariantZoomModal
        variant={null}
        imgUrl={null}
        isActive={false}
        onClose={() => {}}
      />,
    );
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
