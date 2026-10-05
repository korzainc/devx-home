/** @vitest-environment node */
import { afterEach, expect, it, vi } from "vitest";
import { SiteHeader } from "./site-header";
import { renderStream } from "@/test-utils/render-stream";

vi.mock("@/lib/session", () => ({
  getSession: async () => ({
    user: {
      name: "Fixture member",
      email: "fixture@example.invalid",
      image: null,
    },
  }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
afterEach(() => vi.unstubAllEnvs());

it.each([
  {
    label: "preview",
    node: "production",
    vercel: "1",
    deployment: "preview",
    local: "",
    enabled: "1",
    links: 0,
  },
  {
    label: "production",
    node: "production",
    vercel: "1",
    deployment: "production",
    local: "",
    enabled: "1",
    links: 2,
  },
  {
    label: "local acceptance",
    node: "development",
    vercel: "",
    deployment: "",
    local: "1",
    enabled: "1",
    links: 2,
  },
  {
    label: "disabled production",
    node: "production",
    vercel: "1",
    deployment: "production",
    local: "",
    enabled: "0",
    links: 0,
  },
])(
  "shows device links only when their routes are enabled: $label",
  async ({ node, vercel, deployment, local, enabled, links }) => {
    vi.stubEnv("NODE_ENV", node);
    vi.stubEnv("VERCEL", vercel);
    vi.stubEnv("VERCEL_ENV", deployment);
    vi.stubEnv("KORZA_LOCAL_USAGE", local);
    vi.stubEnv("TELEMETRY_ENABLED", enabled);
    vi.stubEnv("DATABASE_URL", "postgresql://fixture:unused@127.0.0.1/fixture");
    const markup = await renderStream(<SiteHeader />, { ready: "all" });
    expect(markup.match(/href="\/telemetry\/devices"/g) ?? []).toHaveLength(
      links,
    );
  },
);
