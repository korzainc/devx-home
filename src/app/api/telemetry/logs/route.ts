import { receiveTelemetry } from "@/lib/telemetry-receiver";
export function POST(request: Request) {
  return receiveTelemetry(request, "logs");
}
