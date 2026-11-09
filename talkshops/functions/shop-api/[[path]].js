// Forward shop requests through the site. The upstream API still verifies the user token.
export async function onRequest({ request, env }) {
  const incoming = new URL(request.url);
  const path = incoming.pathname.slice("/shop-api/".length);
  if (!path.startsWith("shop/") || !/^[a-zA-Z0-9_/-]+$/.test(path) || path.includes("..")) {
    return new Response("Invalid shop route", { status: 400 });
  }
  const base = env.SUPABASE_URL || env.REACT_APP_SUPABASE_URL || "https://nkwedlskhnojseeroezm.supabase.co";
  const api = env.API_URL || new URL("/functions/v1/api", base).href;
  const upstream = new URL(api.replace(/\/$/, "") + "/" + path);
  upstream.search = incoming.search;
  const headers = new Headers();
  for (const name of ["apikey", "authorization", "content-type", "x-client-info", "x-supabase-api-version"]) {
    if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  }
  try {
    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
    });
    const outgoing = new Headers();
    outgoing.set("Content-Type", response.headers.get("Content-Type") || "application/json");
    outgoing.set("Cache-Control", "no-store");
    outgoing.set("X-Content-Type-Options", "nosniff");
    for (const name of ["location", "retry-after", "x-supabase-api-version"]) {
      if (response.headers.has(name)) outgoing.set(name, response.headers.get(name));
    }
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch {
    return new Response("The shop service is temporarily unavailable. Please try again.",
      { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
