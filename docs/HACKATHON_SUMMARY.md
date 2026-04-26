# Archoff — written submission

**Built with Opus 4.7 hackathon · Saad Zwaki · April 2026**

Space planners spend two to eight weeks on programming and one to three on
test-fit. There is no serious AI tool on this metier. Archoff is a quiet
co-architect that compresses both phases into minutes, end-to-end : a
client brief becomes a sourced functional programme, then three 3D
test-fit variants in SketchUp, then a curated mood board, then an
18-slide magazine-grade client deck, then a dimensioned A1 DXF for the
engineering team — without ever leaving the browser.

The product hinges on three creative uses of Opus 4.7 : **Vision HD**
reads client floor plans into a strict JSON schema (envelope, columns,
cores, labels) ; **managed-agent orchestration** runs three levels of
parallel specialists with consolidators (programme · variants +
reviewers · research-and-cite with peer-reviewed sources) ; **Haiku 4.5
Vision** tags every cached image so the moodboard always picks the
right product photograph. SketchUp is driven via a forked MCP plus an
Archoff Ruby module of eight high-level architect-vocabulary ops. The
engineering hand-off ships as a headless-`ezdxf` DXF that opens cleanly
in AutoCAD, Revit and Vectorworks.

Stack : FastAPI + Pydantic v2 + Python 3.12 ; React 18 + TypeScript +
Tailwind + Framer ; Claude Opus 4.7 + Haiku 4.5 Vision ; fal.ai
NanoBanana Pro for editorial product photography ; headless Chromium for
the magazine-PDF render. MIT, 100 % open source.
