// Explicit local demo only; never enabled on deployments.
export function localSkillsPreview(host: string | null) {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.KORZA_LOCAL_SKILLS_PREVIEW === "1" &&
    !process.env.VERCEL &&
    /^(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?$/.test(host ?? "")
  );
}
export function skillsPreviewPath(path: string) {
  return path === "/skills" || /^\/skills\/[^/]+$/.test(path);
}
