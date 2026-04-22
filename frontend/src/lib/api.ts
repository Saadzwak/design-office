export type BriefManifest = {
  resources_dir: string;
  files: string[];
  ratios_json_size_bytes: number;
  benchmarks_version: string;
};

export type SubAgentTrace = {
  name: string;
  text: string;
  tokens: { input: number; output: number };
  duration_ms: number;
};

export type BriefResponse = {
  programme: string;
  trace: SubAgentTrace[];
  tokens: { input: number; output: number };
};

export type BriefRequest = {
  brief: string;
  client_name?: string;
  language?: "fr" | "en";
};

export async function fetchBriefManifest(signal?: AbortSignal): Promise<BriefManifest> {
  const r = await fetch("/api/brief/manifest", { signal });
  if (!r.ok) throw new Error(`Manifest fetch failed: ${r.status}`);
  return r.json();
}

export async function synthesizeBrief(
  req: BriefRequest,
  signal?: AbortSignal,
): Promise<BriefResponse> {
  const r = await fetch("/api/brief/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(body || `Synthesize failed: ${r.status}`);
  }
  return r.json();
}
