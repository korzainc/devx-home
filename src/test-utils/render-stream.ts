import { Writable } from "node:stream";
import type { ReactElement } from "react";
import { renderToPipeableStream } from "react-dom/server";

/**
 * Renders the way the server does, because the behaviour under test is the streaming itself: a
 * boundary's content is written into a `<div hidden>` and moved into place by an inline `$RC`
 * call that never runs for a client without script.
 *
 * `ready` picks the flush point, and the choice matters. "shell" flushes before boundaries
 * resolve, which is the only way the hidden-div path is taken at all; "all" waits for everything
 * and lets React inline the lot, which is what you want when the subject is a resolved async
 * component rather than what a scriptless reader sees.
 *
 * Boundary errors go to `onBoundaryError` where given, and reject otherwise. Discarding them
 * silently lets a crash inside a boundary leave every surrounding assertion green.
 */
export async function renderStream(
  node: ReactElement,
  {
    ready,
    onBoundaryError,
  }: { ready: "shell" | "all"; onBoundaryError?: (error: Error) => void },
): Promise<string> {
  const chunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });

  await new Promise<void>((resolve, reject) => {
    const flush = () => stream.pipe(sink);
    const stream = renderToPipeableStream(node, {
      onShellReady: ready === "shell" ? flush : undefined,
      onAllReady: ready === "all" ? flush : undefined,
      // Surfaced as itself, or a failing shell just hangs the render to a timeout.
      onShellError: reject,
      onError(error) {
        const boundaryError =
          error instanceof Error ? error : new Error(String(error));
        if (onBoundaryError) onBoundaryError(boundaryError);
        else reject(boundaryError);
      },
    });
    sink.on("finish", resolve);
    sink.on("error", reject);
  });

  return Buffer.concat(chunks).toString("utf8");
}
