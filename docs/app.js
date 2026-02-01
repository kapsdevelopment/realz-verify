// 1) Sett dette til din Supabase URL
//    (kan også injectes via a) build step, b) window.__ENV, c) hardcode for MVP)
const SUPABASE_URL = "https://fikpcphonyjqbwibovyk.supabase.co";

// 2) Edge function endpoint
const VERIFY_ENDPOINT = `${SUPABASE_URL}/functions/v1/public_verify`;

function getProofIdFromPath(pathname) {
  // forventer /v/{proof_id}
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 2 && parts[0] === "v") return parts[1];
  return null;
}

function getRequestedPath() {
  // hvis vi kom via 404-rewrite: /?p=/v/XXXX
  const p = new URLSearchParams(window.location.search).get("p");
  if (p) return decodeURIComponent(p);
  return window.location.pathname;
}

function setStatus(text, kind) {
  const el = document.getElementById("status");
  el.textContent = text;
  el.dataset.kind = kind || "info";
}

function safeSetText(id, value) {
  document.getElementById(id).textContent = value ?? "-";
}

async function fetchVerify(proofId) {
  // POST eller GET – velg én og match i Edge Function
  const res = await fetch(VERIFY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proof_id: proofId })
  });

  // public endpoint: returner kontrollert error payload
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

(async function init() {
  const requestedPath = getRequestedPath();
  const proofId = getProofIdFromPath(new URL(requestedPath, window.location.origin).pathname);

  if (!proofId) {
    setStatus("Ugyldig verify-lenke", "bad");
    safeSetText("proofId", "-");
    return;
  }

  safeSetText("proofId", proofId);
  setStatus("Verifiserer…", "info");

  const { ok, status, data } = await fetchVerify(proofId);

  // Du bestemmer kontrakten – dette er en foreslått shape:
  // data = { trust, captured_at, key_id, thumb_url, metadata, proof, signature }
  if (!ok) {
    setStatus(`Ikke verifisert (${status})`, "bad");
    safeSetText("trust", data?.trust ?? "not_verified");
    document.getElementById("raw").textContent = JSON.stringify(data, null, 2) || "";
    return;
  }

  const trust = data?.trust || "verified";
  safeSetText("trust", trust);
  safeSetText("capturedAt", data?.captured_at || "-");
  safeSetText("keyId", data?.key_id || "-");

  const img = document.getElementById("thumb");
  if (data?.thumb_url) {
    img.src = data.thumb_url;
    img.style.display = "block";
  } else {
    img.style.display = "none";
  }

  if (trust === "verified") setStatus("✅ Realz-verified", "good");
  else setStatus("❌ Ikke verifisert", "bad");

  document.getElementById("raw").textContent = JSON.stringify(data, null, 2) || "";
})();
