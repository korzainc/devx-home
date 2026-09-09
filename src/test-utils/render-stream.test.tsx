/**
 * @vitest-environment node
 */
import { Suspense } from "react";
import { describe, expect, it } from "vitest";
import { renderStream } from "@/test-utils/render-stream";

const Boom = async () => {
  await new Promise((resolve) => setTimeout(resolve, 10));
  throw new Error("the real error");
};

const Slow = async () => {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return <p>slow</p>;
};

describe("renderStream, with a sibling boundary still pending", () => {
  it("rejects with the error that happened, not React's abort message", async () => {
    // Aborting re-fires `onError` on the pending sibling, which re-enters the failure path. Abort
    // before rejecting and that second call wins, so the caller is told "aborted without a
    // reason" and the error that actually happened is lost.
    await expect(
      renderStream(
        <div>
          <Suspense fallback={<i>a</i>}>
            <Boom />
          </Suspense>
          <Suspense fallback={<i>b</i>}>
            <Slow />
          </Suspense>
        </div>,
        { ready: "shell" },
      ),
    ).rejects.toThrow("the real error");
  });
});
