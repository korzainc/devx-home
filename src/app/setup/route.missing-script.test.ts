import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The route reads public/devx/install.sh off disk per request. Next's
// "standalone" output requires public/ to be copied next to server.js by hand,
// so a missed copy step makes that read throw at runtime. The response is piped
// into sh, so an HTML error page would surface as shell syntax errors.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) => {
      if (String(args[0]).endsWith("install.sh")) {
        const error: NodeJS.ErrnoException = new Error(
          "ENOENT: no such file or directory",
        );
        error.code = "ENOENT";
        throw error;
      }
      return actual.readFileSync(...args);
    },
  };
});

describe("GET /setup when the vendored install.sh is missing", () => {
  it("answers with runnable shell that exits non-zero, not an HTML error page", async () => {
    const { GET } = await import("./route");
    const res = GET(new NextRequest("http://localhost:3000/setup"));

    expect(res.status).toBe(500);
    expect(res.headers.get("Content-Type")).toMatch(/shellscript/);
    const body = await res.text();
    expect(body).toContain("exit 1");
    expect(body).not.toMatch(/<html/i);
  });
});
