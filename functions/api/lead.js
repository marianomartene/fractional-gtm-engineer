// Cloudflare Pages Function — POST /api/lead
// Captures lead-finder + diagnostic submissions to KV (binding: LEADS),
// and optionally forwards to a webhook (var: FORWARD_WEBHOOK -> your n8n / CRM).
// CORS is open so the github.io mirror can post here too.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const onRequestOptions = () => new Response(null, { headers: CORS });

export const onRequestPost = async ({ request, env }) => {
  let d;
  try { d = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }

  // Turnstile bot check (enforced only when the secret is configured)
  if (env.TURNSTILE_SECRET) {
    const token = d.turnstileToken || d["cf-turnstile-response"] || "";
    const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
    const ip = request.headers.get("CF-Connecting-IP");
    if (ip) form.append("remoteip", ip);
    const vr = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const outcome = await vr.json().catch(() => ({ success: false }));
    if (!outcome.success) return json({ error: "turnstile" }, 403);
  }

  const email = String(d.email || "").trim();
  if (!email || email.indexOf("@") < 1) return json({ error: "email" }, 400);

  const record = {
    email,
    source: d.source || "unknown",            // "lead-finder" | "diagnostic"
    website: d.website || "", icp: d.icp || "", notes: d.notes || "",
    gap_score: d.gap_score ?? "", motion: d.motion || "",
    opps: d.opps || "", acv: d.acv || "", qual: d.qual || "", close: d.close || "",
    country: request.headers.get("cf-ipcountry") || "",
    ua: request.headers.get("user-agent") || "",
    ts: new Date().toISOString(),
  };

  if (env.LEADS) {
    try { await env.LEADS.put(`${record.ts}__${email}`, JSON.stringify(record)); } catch (e) {}
  }
  if (env.FORWARD_WEBHOOK) {
    try {
      await fetch(env.FORWARD_WEBHOOK, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record),
      });
    } catch (e) {}
  }
  return json({ ok: true }, 200);
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } });
}
