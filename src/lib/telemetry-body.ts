// Returns null after canceling an oversized stream; the caller owns lock release.
export async function readBoundedChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  limit: number,
): Promise<Uint8Array[] | null> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
}
