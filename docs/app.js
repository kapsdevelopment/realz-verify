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

function formatUtc(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function setSubtitle(text) {
  const el = document.getElementById("subtitle");
  if (!el) return;
  el.textContent = text || "";
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
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value ?? "-";
}

async function fetchVerify(proofId) {
  const url = `${VERIFY_ENDPOINT}?proof_id=${encodeURIComponent(proofId)}`;

  const res = await fetch(url, { method: "GET" });

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
    setStatus(`Ikke verifisert (${status})`, "bad");
    safeSetText("trust", data?.trust ?? "unknown");
    setSubtitle("Realz can’t confirm this proof right now.");
    document.getElementById("raw").textContent = JSON.stringify(data, null, 2) || "";
    return;
  }

  const trust = data?.trust || "unknown";
  safeSetText("trust", trust);
  safeSetText("capturedAt", formatUtc(data?.captured_at_utc));
  safeSetText("keyId", data?.crypto?.key_id ?? "-");

  const img = document.getElementById("thumb");
  const thumbUrl = data?.thumb?.url;
  if (thumbUrl) {
  img.src = thumbUrl;
  img.style.display = "block";
  } else {
  img.style.display = "none";
  }

if (trust === "verified") {
  setStatus("✅ Realz-verified", "good");
  setSubtitle("This image matches a cryptographic proof created at capture time.");
} else {
  setStatus("⚠️ Could not verify", "bad");

  const reason = data?.reason_code;
  // MVP: hold det menneskelig, men litt konkret
  const msg =
    reason === "PROOF_NOT_FOUND" ? "This proof ID doesn’t exist." :
    reason === "THUMB_UNAVAILABLE" ? "Thumbnail is unavailable right now." :
    reason === "SIGNATURE_INVALID" ? "The proof signature didn’t verify." :
    reason === "KEY_INACTIVE" ? "The signing key is no longer active." :
    reason ? "Realz can’t confirm this proof right now." :
    "Realz can’t confirm this proof right now.";

  setSubtitle(msg);
}

  document.getElementById("raw").textContent = JSON.stringify(data, null, 2) || "";
})();
