// 1) Sett dette til din Supabase URL
const SUPABASE_URL = "https://fikpcphonyjqbwibovyk.supabase.co";

// 2) Edge function endpoint
const VERIFY_ENDPOINT = `${SUPABASE_URL}/functions/v1/public_verify`;
const PUBLIC_THUMB_BUCKET = "realz_public_thumbs";

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

function buildCanonicalVerifyUrl(requestedPath) {
  return new URL(requestedPath, window.location.origin).toString();
}

function buildPublicStorageUrl(bucket, path) {
  const encodedPath = String(path || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodedPath}`;
}

function buildC2paSharedThumbnailUrl(proofId) {
  return buildPublicStorageUrl(
    PUBLIC_THUMB_BUCKET,
    `content-credentials/${proofId}/shared-thumbnail.jpg`
  );
}

async function publicObjectExists(url) {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function resolveBestThumbnailUrl(proofId, fallbackUrl) {
  if (!proofId) return { url: fallbackUrl, contentCredentials: false };

  const c2paUrl = buildC2paSharedThumbnailUrl(proofId);
  if (await publicObjectExists(c2paUrl)) {
    return { url: c2paUrl, contentCredentials: true };
  }

  return { url: fallbackUrl, contentCredentials: false };
}

function safeSetText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value ?? "-";
}

function setVisible(id, isVisible) {
  const el = document.getElementById(id);
  if (!el) return;
  el.hidden = !isVisible;
}

function setRowVisible(id, isVisible) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("is-hidden", !isVisible);
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

function setThumbAspectRatio(width, height) {
  const wrap = document.getElementById("thumbWrap");
  if (!wrap) return;

  const w = Number(width);
  const h = Number(height);

  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    wrap.style.setProperty("--thumb-aspect-ratio", `${w} / ${h}`);
  } else {
    wrap.style.removeProperty("--thumb-aspect-ratio");
  }
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

function titleCaseFromSnake(value) {
  return String(value || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAppCheck(data) {
  const attestation = data?.crypto?.payload?.trust?.attestation;
  const verdict = attestation?.verdict;
  const provider = attestation?.provider;

  if (!verdict) return "Not included";
  if (provider) return `${titleCaseFromSnake(verdict)} (${titleCaseFromSnake(provider)})`;
  return titleCaseFromSnake(verdict);
}

function formatSignature(data) {
  const alg = data?.crypto?.alg;
  const keyId = data?.crypto?.key_id;

  if (alg && keyId) return `${alg}, key ${keyId}`;
  if (alg) return alg;
  return "Not included";
}

function setProofDetails(data) {
  const hasDetails = Boolean(data?.crypto || data?.issued_at_utc);
  setVisible("proofDetails", hasDetails);

  if (!hasDetails) return;

  safeSetText("issuedAt", formatUtc(data?.issued_at_utc));
  safeSetText("appCheck", formatAppCheck(data));
  safeSetText("signatureDetails", formatSignature(data));
  safeSetText(
    "originalHash",
    data?.crypto?.payload?.hashes?.original_sha256 || "Not included"
  );

  const anchor = data?.crypto?.payload?.anchor;
  const anchorStatus = anchor?.status;
  const hasExternalAnchor = Boolean(anchorStatus && anchorStatus !== "none");
  setRowVisible("anchorRow", hasExternalAnchor);
  if (hasExternalAnchor) {
    safeSetText("anchorStatus", titleCaseFromSnake(anchorStatus));
  }
}

async function fetchVerify(proofId) {
  const url = `${VERIFY_ENDPOINT}?proof_id=${encodeURIComponent(proofId)}`;
  const res = await fetch(url, { method: "GET" });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

function initReportForm(params) {
  const form = document.getElementById("reportForm");
  const iframe = document.getElementById("report_iframe");
  const statusBox = document.getElementById("reportStatus");
  const proofInput = document.getElementById("reportProofInput");
  const verifyUrlInput = document.getElementById("reportVerifyUrlInput");
  const proofText = document.getElementById("reportProofId");

  if (!form || !iframe || !statusBox) return;

  const canonicalVerifyUrl = buildCanonicalVerifyUrl(params.requestedPath);

  if (proofInput) proofInput.value = params.proofId || "";
  if (verifyUrlInput) verifyUrlInput.value = canonicalVerifyUrl;
  if (proofText) proofText.textContent = params.proofId || "Unavailable";

  let submitted = false;

  form.addEventListener("submit", function () {
    submitted = true;
    statusBox.textContent = "Sending report...";
    statusBox.className = "reportStatus is-visible";
  });

  iframe.addEventListener("load", function () {
    if (!submitted) return;
    submitted = false;

    statusBox.textContent =
      "Your report was sent successfully. Thanks — we’ll review it as soon as possible.";
    statusBox.className = "reportStatus is-visible is-success";

    form.reset();

    if (proofInput) proofInput.value = params.proofId || "";
    if (verifyUrlInput) verifyUrlInput.value = canonicalVerifyUrl;
  });
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
  setProofDetails(null);

  const requestedPath = getRequestedPath();
  const proofId = getProofIdFromPath(
    new URL(requestedPath, window.location.origin).pathname
  );

  initReportForm({ proofId, requestedPath });

  if (!proofId) {
    setBadge("INVALID", "bad");
    setStatus("Ugyldig verify-lenke", "bad", "Missing or malformed proof id");
    setSubtitle("Sjekk at lenken ser ut som /v/{proof_id}");
    safeSetText("proofId", "-");
    safeSetText("capturedAt", "-");
    safeSetText("trust", "Invalid");
    showThumb(false);
    setProofDetails(null);
    return;
  }

  safeSetText("proofId", proofId);

  const { ok, status, data } = await fetchVerify(proofId);
  setProofDetails(data);

  // thumb
  const img = document.getElementById("thumb");
  const fallbackThumbUrl = data?.thumb?.url;
  const thumb = fallbackThumbUrl
    ? await resolveBestThumbnailUrl(proofId, fallbackThumbUrl)
    : { url: null, contentCredentials: false };
  const thumbUrl = thumb.url;

  if (thumbUrl) {
    setThumbAspectRatio(data?.photo?.width, data?.photo?.height);
    img.dataset.contentCredentials = thumb.contentCredentials ? "true" : "false";
    img.onload = () => {
      setThumbAspectRatio(img.naturalWidth, img.naturalHeight);
      setThumbLoading(false);
    };
    img.onerror = () => {
      setThumbAspectRatio(null, null);
      setThumbLoading(false);
    };
    img.src = thumbUrl;
    showThumb(true);
  } else {
    // ingen thumb -> skjul hero helt, så siden ser “ferdig” ut
    setThumbAspectRatio(null, null);
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
