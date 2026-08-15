export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

function payloadError(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const error = Reflect.get(payload, "error");
  return typeof error === "string" && error.trim() ? error : null;
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  fallbackMessage = "The request could not be completed.",
  fetcher: FetchLike = fetch,
): Promise<T> {
  const response = await fetcher(input, init);
  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      if (!response.ok) throw new ApiRequestError(fallbackMessage, response.status);
      throw new ApiRequestError("The server returned an invalid response.", response.status);
    }
  }

  if (!response.ok) {
    throw new ApiRequestError(payloadError(payload) ?? fallbackMessage, response.status);
  }

  return payload as T;
}
