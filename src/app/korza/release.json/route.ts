import { getSetupOrigin } from "@/lib/setup-origin";
import { artifactPaths, BUNDLED_ARTIFACT_VERSION } from "@/lib/setup-script";

/** One current bundle, using the CLI update manifest's existing field names. */
export function GET(): Response {
  const origin = getSetupOrigin();
  const headers = { "Cache-Control": "no-store" };
  if (!origin) {
    return Response.json(
      { error: "The bundled release is not configured." },
      { status: 503, headers },
    );
  }
  const paths = artifactPaths();
  return Response.json(
    {
      version: BUNDLED_ARTIFACT_VERSION,
      url: `${origin}${paths.tarball}`,
      sum_url: `${origin}${paths.checksum}`,
      notes: "Bundled macOS candidate. Ad-hoc signed; not notarized.",
    },
    { headers },
  );
}
