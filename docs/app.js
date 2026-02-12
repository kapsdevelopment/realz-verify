// 1) Sett dette til din Supabase URL
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

function getRequestedPath() {
  // hvis vi kom via 404-rewrite: /?p=/v/XXXX
  const p = new URLSearchParams(window.location.search).get("p");
  if (p) return decodeURIComponent(p);
  return window.location.pathname;
}

function safeSetText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value ?? "-";
}

function setSubtitle(text) {
  const el = document.getElementById("subtitle");
  if (!el) return;
  el.textContent = text || "";
}

function setBadge(text, kind) {
  const el = document.getElementById("badge");
  if (!el) return;
  el.textContent = text;
  el.dataset.kind = kind || "info";
}

function setStatus(title, kind, hint) {
  const el = document.getElementById("status");
  if (!el) return;
  el.dataset.kind = kind || "info";
  el.innerHTML = `
    <div class="statusText">
      <strong>${escapeHtml(title)}</strong>
      <small>${escapeHtml(hint || "")}</small>
    </div>
  `;
}

function setThumbOverlay(kind, text) {
  const overlay = document.getElementById("thumbOverlay");
  const pill = document.getElementById("verifyPill");
  const pillText = document.getElementById("verifyPillText");
  if (!overlay || !pill || !pillText) return;

  overlay.hidden = false;
  pill.dataset.kind = kind || "info";
  pillText.textContent = text || "";
}

function hideThumbOverlay() {
  const overlay = document.getElementById("thumbOverlay");
  if (overlay) overlay.hidden = true;
}

function setThumbLoading(isLoading) {
  const wrap = document.getElementById("thumbWrap");
  if (!wrap) return;
  wrap.classList.toggle("is-loading", !!isLoading);
}

function showThumb(show) {
  const wrap = document.getElementById("thumbWrap");
  if (!wrap) return;
  wrap.style.display = show ? "block" : "none";
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fetchVerify(proofId) {
  const url = `${VERIFY_ENDPOINT}?proof_id=${encodeURIComponent(proofId)}`;
  const res = await fetch(url, { method: "GET" });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

// Mapper reason_code -> menneskelig tekst
function humanReason(reason) {
  return (
    (reason === "DELETED_BY_OWNER" && "This proof was deleted by its owner.") ||
    (reason === "PROOF_NOT_FOUND" && "This proof ID doesn’t exist.") ||
    (reason === "THUMB_UNAVAILABLE" && "Thumbnail is unavailable right now.") ||
    (reason === "SIGNATURE_INVALID" && "The proof signature didn’t verify.") ||
    (reason === "KEY_INACTIVE" && "The signing key is no longer active.") ||
    "Realz can’t confirm this proof right now."
  );
}

(async function init() {
  // initial UI (skeleton)
  setBadge("Verifying", "info");
  setStatus("Verifiserer…", "info", "Checking cryptographic proof");
  setSubtitle("");
  setThumbLoading(true);
  hideThumbOverlay();
  showThumb(true);

  const requestedPath = getRequestedPath();
  const proofId = getProofIdFromPath(
    new URL(requestedPath, window.location.origin).pathname
  );

  if (!proofId) {
    setBadge("INVALID", "bad");
    setStatus("Ugyldig verify-lenke", "bad", "Missing or malformed proof id");
    setSubtitle("Sjekk at lenken ser ut som /v/{proof_id}");
    safeSetText("proofId", "-");
    safeSetText("capturedAt", "-");
    safeSetText("trust", "Invalid");
    showThumb(false);
    document.getElementById("raw").textContent = "";
    return;
  }

  safeSetText("proofId", proofId);

  const { ok, status, data } = await fetchVerify(proofId);

  // Fyll raw uansett (hjelper debugging)
  document.getElementById("raw").textContent = JSON.stringify(data, null, 2) || "";

  // thumb
  const img = document.getElementById("thumb");
  const thumbUrl = data?.thumb?.url;

  if (thumbUrl) {
    img.onload = () => setThumbLoading(false);
    img.onerror = () => setThumbLoading(false);
    img.src = thumbUrl;
    showThumb(true);
  } else {
    // ingen thumb -> skjul hero helt, så siden ser “ferdig” ut
    setThumbLoading(false);
    showThumb(false);
  }

  // --- Tombstone: deleted by owner ---
  // Handle this early so it never looks like a system failure.
  if (data?.reason_code === "DELETED_BY_OWNER") {
    setBadge("DELETED", "bad");
    setStatus("Deleted by owner", "bad", "This proof was intentionally removed");

    safeSetText("trust", "Deleted");
    safeSetText("capturedAt", formatUtc(data?.revoked_at_utc)); // <-- tombstone timestamp

    setSubtitle("The owner of this image has deleted the proof.");

    hideThumbOverlay();
    showThumb(false);
    setThumbLoading(false);

    return;
  }

  if (!ok) {
    setBadge("NOT VERIFIED", "bad");
    setStatus("⚠️ Could not verify", "bad", `Server responded ${status}`);
    safeSetText("trust", data?.trust ?? "Not verified");
    safeSetText("capturedAt", formatUtc(data?.captured_at_utc));

    const msg = humanReason(data?.reason_code);
    setSubtitle(msg);

    // Hvis du vil: vis en pill selv om thumb mangler (valgfritt)
    if (thumbUrl) setThumbOverlay("bad", "VERIFICATION FAILED");
    return;
  }

  const trust = data?.trust || "unknown";
  const captured = formatUtc(data?.captured_at_utc);

  safeSetText("capturedAt", captured);

  if (trust === "verified") {
    setBadge("VERIFIED", "good");
    setStatus("✅ Realz-verified", "good", "Proof matches capture-time signature");
    safeSetText("trust", "Verified");
    setSubtitle("This image matches a cryptographic proof created at capture time.");

    if (thumbUrl) setThumbOverlay("good", "VERIFIED");
  } else {
    setBadge("NOT VERIFIED", "bad");
    setStatus("⚠️ Could not verify", "bad", "Realz can’t confirm this proof right now");
    safeSetText("trust", "Not verified");

    const msg = humanReason(data?.reason_code);
    setSubtitle(msg);

    if (thumbUrl) setThumbOverlay("bad", "NOT VERIFIED");
  }
})();
