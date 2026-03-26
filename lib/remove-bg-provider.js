const REMOVE_BG_ENDPOINT = process.env.REMOVE_BG_ENDPOINT || "https://api.remove.bg/v1.0/removebg";
const REMOVE_BG_API_KEY = process.env.REMOVE_BG_API_KEY || "";
const REMOVE_BG_SIZE = process.env.REMOVE_BG_SIZE || "auto";
const REMOVE_BG_FORMAT = process.env.REMOVE_BG_FORMAT || "png";

function decodeBase64(base64) {
  return Buffer.from(base64, "base64");
}

function ensureConfigured() {
  if (!REMOVE_BG_API_KEY) {
    throw new Error("Missing REMOVE_BG_API_KEY. Please configure remove.bg API access first.");
  }
}

export function getRemoveBgRuntimeConfig() {
  return {
    configured: Boolean(REMOVE_BG_API_KEY),
    endpoint: REMOVE_BG_ENDPOINT,
    format: REMOVE_BG_FORMAT,
    provider: "remove.bg",
    size: REMOVE_BG_SIZE
  };
}

export async function removeImageBackground({ base64, fileName, mimeType }) {
  ensureConfigured();

  const formData = new FormData();
  formData.append("size", REMOVE_BG_SIZE);
  formData.append("format", REMOVE_BG_FORMAT);
  formData.append("image_file", new Blob([decodeBase64(base64)], { type: mimeType || "image/jpeg" }), fileName || "upload.jpg");

  const response = await fetch(REMOVE_BG_ENDPOINT, {
    method: "POST",
    headers: {
      "X-Api-Key": REMOVE_BG_API_KEY
    },
    body: formData
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`remove.bg request failed: ${response.status} ${message}`.trim());
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    mimeType: REMOVE_BG_FORMAT === "webp" ? "image/webp" : "image/png",
    provider: "remove.bg",
    resultBase64: bytes.toString("base64")
  };
}
