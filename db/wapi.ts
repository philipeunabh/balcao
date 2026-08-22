export class WapiRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "WapiRequestError";
    this.status = status;
  }
}

export function normalizeWapiPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
}

function providerMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  for (const key of ["message", "error", "detail"]) {
    if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
  }
  return "";
}

export async function sendWapiText(input: {
  token: string;
  instanceId: string;
  whatsapp: string;
  message: string;
}) {
  const response = await fetch(`https://api.w-api.app/v1/message/send-text?instanceId=${encodeURIComponent(input.instanceId)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phone: normalizeWapiPhone(input.whatsapp),
      message: input.message,
    }),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new WapiRequestError(providerMessage(payload) || `A W-API recusou a solicitação (HTTP ${response.status}).`, response.status);
  }
  return {
    messageId: typeof payload.messageId === "string" ? payload.messageId : "",
    instanceId: typeof payload.instanceId === "string" ? payload.instanceId : input.instanceId,
  };
}
