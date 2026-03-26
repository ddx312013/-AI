const PHOTOROOM_ENDPOINT = process.env.PHOTOROOM_ENDPOINT || "https://image-api.photoroom.com/v2/edit";
const PHOTOROOM_API_KEY = process.env.PHOTOROOM_API_KEY || "";

function ensureConfigured() {
  if (!PHOTOROOM_API_KEY) {
    throw new Error("Missing PHOTOROOM_API_KEY. Please configure Photoroom API access first.");
  }
}

function decodeBase64(base64) {
  return Buffer.from(base64, "base64");
}

async function sendPhotoroomRequest({ base64, fileName, mimeType, params }) {
  ensureConfigured();

  const formData = new FormData();
  formData.append("imageFile", new Blob([decodeBase64(base64)], { type: mimeType || "image/jpeg" }), fileName || "upload.jpg");

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    formData.append(key, String(value));
  }

  const response = await fetch(PHOTOROOM_ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": PHOTOROOM_API_KEY
    },
    body: formData
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Photoroom request failed: ${response.status} ${message}`.trim());
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    mimeType: response.headers.get("content-type") || "image/png",
    provider: "photoroom",
    resultBase64: bytes.toString("base64")
  };
}

export function getPhotoroomRuntimeConfig() {
  return {
    configured: Boolean(PHOTOROOM_API_KEY),
    endpoint: PHOTOROOM_ENDPOINT,
    provider: "photoroom"
  };
}

export async function removeBackgroundWithPhotoroom({ base64, fileName, mimeType }) {
  return sendPhotoroomRequest({
    base64,
    fileName,
    mimeType,
    params: {
      removeBackground: "true",
      "background.color": "transparent",
      outputSize: "originalImage",
      "export.format": "png",
      scaling: "fit"
    }
  });
}

export async function renderStudioWithPhotoroom({ base64, fileName, mimeType }) {
  return sendPhotoroomRequest({
    base64,
    fileName,
    mimeType,
    params: {
      removeBackground: "true",
      "background.color": "FFFFFF",
      "shadow.mode": "ai.soft",
      outputSize: "1600x1200",
      padding: "8%",
      scaling: "fit",
      "export.format": "png"
    }
  });
}
