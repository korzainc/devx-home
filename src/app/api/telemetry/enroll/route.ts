import { connection } from "next/server";
import { enrollmentGet } from "@/lib/telemetry-enrollment";
export { enrollmentPost as POST } from "@/lib/telemetry-enrollment";

export async function GET() {
  await connection();
  return enrollmentGet();
}
