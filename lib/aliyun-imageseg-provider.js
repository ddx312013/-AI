import { createRequire } from "node:module";
import { Readable } from "node:stream";

const require = createRequire(import.meta.url);
const OpenApiModule = require("@alicloud/openapi-client");
const ImagesegModule = require("@alicloud/imageseg20191230");

const OpenApiConfig = OpenApiModule.Config;
const ImagesegClient = ImagesegModule.default || ImagesegModule;
const SegmentCommodityAdvanceRequest = ImagesegModule.SegmentCommodityAdvanceRequest;

const ALIYUN_ACCESS_KEY_ID =
  process.env.ALIYUN_ACCESS_KEY_ID || process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || "";
const ALIYUN_ACCESS_KEY_SECRET =
  process.env.ALIYUN_ACCESS_KEY_SECRET || process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || "";
const ALIYUN_REGION_ID = process.env.ALIYUN_REGION_ID || "cn-shanghai";
const ALIYUN_IMAGESEG_ENDPOINT = process.env.ALIYUN_IMAGESEG_ENDPOINT || "";
const ALIYUN_CUTOUT_RETURN_FORM = process.env.ALIYUN_CUTOUT_RETURN_FORM || "";
const ALIYUN_STUDIO_RETURN_FORM = process.env.ALIYUN_STUDIO_RETURN_FORM || "whiteBK";

let cachedClient = null;

function ensureConfigured() {
  if (!ALIYUN_ACCESS_KEY_ID || !ALIYUN_ACCESS_KEY_SECRET) {
    throw new Error(
      "Missing ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET. Please configure Aliyun ImageSeg access first."
    );
  }
}

function createClient() {
  if (cachedClient) {
    return cachedClient;
  }

  ensureConfigured();
  const config = new OpenApiConfig({
    accessKeyId: ALIYUN_ACCESS_KEY_ID,
    accessKeySecret: ALIYUN_ACCESS_KEY_SECRET,
    regionId: ALIYUN_REGION_ID
  });

  if (ALIYUN_IMAGESEG_ENDPOINT) {
    config.endpoint = ALIYUN_IMAGESEG_ENDPOINT;
  }

  cachedClient = new ImagesegClient(config);
  return cachedClient;
}

function decodeBase64(base64) {
  return Buffer.from(base64, "base64");
}

async function fetchImageAsBase64(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Aliyun image fetch failed: ${response.status} ${message}`.trim());
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  return bytes.toString("base64");
}

async function segmentCommodity({ base64, returnForm }) {
  const client = createClient();
  const request = new SegmentCommodityAdvanceRequest({
    imageURLObject: Readable.from(decodeBase64(base64)),
    returnForm: returnForm || undefined
  });
  const result = await client.segmentCommodityAdvance(request, {});
  const imageUrl = result?.body?.data?.imageURL;

  if (!imageUrl) {
    throw new Error("Aliyun SegmentCommodity returned no image URL.");
  }

  return {
    imageUrl,
    provider: "aliyun-imageseg",
    resultBase64: await fetchImageAsBase64(imageUrl)
  };
}

export function getAliyunImageSegRuntimeConfig() {
  return {
    configured: Boolean(ALIYUN_ACCESS_KEY_ID && ALIYUN_ACCESS_KEY_SECRET),
    cutoutReturnForm: ALIYUN_CUTOUT_RETURN_FORM || "default",
    endpoint: ALIYUN_IMAGESEG_ENDPOINT || `imageseg.${ALIYUN_REGION_ID}.aliyuncs.com`,
    provider: "aliyun-imageseg",
    regionId: ALIYUN_REGION_ID,
    studioReturnForm: ALIYUN_STUDIO_RETURN_FORM
  };
}

export async function removeBackgroundWithAliyun({ base64 }) {
  const result = await segmentCommodity({
    base64,
    returnForm: ALIYUN_CUTOUT_RETURN_FORM || undefined
  });

  return {
    mimeType: "image/png",
    provider: result.provider,
    resultBase64: result.resultBase64
  };
}

export async function renderStudioWithAliyun({ base64 }) {
  const result = await segmentCommodity({
    base64,
    returnForm: ALIYUN_STUDIO_RETURN_FORM
  });

  return {
    mimeType: "image/png",
    provider: result.provider,
    resultBase64: result.resultBase64
  };
}
