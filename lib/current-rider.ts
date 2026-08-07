import { getChatGPTUser } from "../app/chatgpt-auth";

export async function currentRider(request: Request) {
  const user = await getChatGPTUser();
  if (user) return { id: user.userId, name: user.displayName };
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1"
    ? { id: "local-rider", name: "Local rider" }
    : null;
}
