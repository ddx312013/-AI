const fileInput = document.querySelector("#image-input");
const dropzone = document.querySelector("#dropzone");
const processButton = document.querySelector("#process-button");
const aggressivenessRange = document.querySelector("#aggressiveness-range");
const aggressivenessValue = document.querySelector("#aggressiveness-value");
const featherRange = document.querySelector("#feather-range");
const featherValue = document.querySelector("#feather-value");
const brushSizeRange = document.querySelector("#brush-size-range");
const brushSizeValue = document.querySelector("#brush-size-value");
const eraseButton = document.querySelector("#erase-button");
const restoreButton = document.querySelector("#restore-button");
const undoButton = document.querySelector("#undo-button");
const statusPill = document.querySelector("#status-pill");
const sourceImage = document.querySelector("#source-image");
const sourcePlaceholder = document.querySelector("#source-placeholder");
const editCanvas = document.querySelector("#edit-canvas");
const resultPlaceholder = document.querySelector("#result-placeholder");
const studioCanvas = document.querySelector("#studio-canvas");
const studioPlaceholder = document.querySelector("#studio-placeholder");
const imageMeta = document.querySelector("#image-meta");
const downloadLink = document.querySelector("#download-link");
const summaryCard = document.querySelector("#summary-card");
const metricStrip = document.querySelector("#metric-strip");
const jsonOutput = document.querySelector("#json-output");

const workingCanvas = document.createElement("canvas");
const workingContext = workingCanvas.getContext("2d", { willReadFrequently: true });
const cutoutCanvas = document.createElement("canvas");
const cutoutContext = cutoutCanvas.getContext("2d", { willReadFrequently: true });
const exportCanvas = document.createElement("canvas");
const exportContext = exportCanvas.getContext("2d", { willReadFrequently: true });
const previewCanvas = document.createElement("canvas");
const previewContext = previewCanvas.getContext("2d", { willReadFrequently: true });
const editContext = editCanvas.getContext("2d", { willReadFrequently: true });
const studioContext = studioCanvas.getContext("2d", { willReadFrequently: true });

let currentFile = null;
let currentSourceUrl = null;
let currentResultUrl = null;
let currentImageElement = null;
let currentImageData = null;
let currentAlphaMask = null;
let currentForegroundMask = null;
let currentBackground = null;
let currentThreshold = null;
let currentEdgeThreshold = null;
let currentStudioApiDataUrl = null;
let brushMode = "erase";
let isPainting = false;
let undoStack = [];

function setStatus(text, type = "neutral") {
  statusPill.textContent = text;
  statusPill.className = "status-pill";

  if (type !== "neutral") {
    statusPill.classList.add(`status-${type}`);
  }
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) {
    return "未知大小";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fitSize(width, height, maxDimension = 960) {
  const scale = Math.min(1, maxDimension / Math.max(width, height));

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败，请尝试其他文件。"));
    image.src = url;
  });
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const [, base64 = ""] = dataUrl.split(",", 2);
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("图片读取失败。"));
    reader.readAsDataURL(file);
  });
}

async function requestCutout(file) {
  const originalBase64 = await readFileAsBase64(file);
  const response = await fetch("/api/cutout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      image: {
        name: file.name,
        mime_type: file.type || "image/jpeg",
        original_base64: originalBase64
      }
    })
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || "真实抠图接口调用失败。");
  }

  return result;
}

async function requestStudio(file) {
  const originalBase64 = await readFileAsBase64(file);
  const response = await fetch("/api/studio", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      image: {
        name: file.name,
        mime_type: file.type || "image/jpeg",
        original_base64: originalBase64
      }
    })
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || "Photoroom 商品图生成失败。");
  }

  return result;
}

function setDownloadState(enabled, url = null) {
  downloadLink.classList.toggle("is-disabled", !enabled);
  downloadLink.setAttribute("aria-disabled", String(!enabled));
  downloadLink.href = enabled && url ? url : "/";
}

function drawNaturalShadow(context, sourceCanvas, box, crop, drawRect) {
  if (!box) {
    return;
  }

  const localX = box.x - crop.x;
  const localY = box.y - crop.y;
  const localWidth = box.width;
  const localHeight = box.height;
  const drawLeft = drawRect.x + localX * drawRect.scale;
  const drawTop = drawRect.y + localY * drawRect.scale;
  const drawBottom = drawRect.y + (localY + localHeight) * drawRect.scale;
  const baseWidth = localWidth * drawRect.scale;
  const baseHeight = Math.max(20, localHeight * drawRect.scale * 0.1);
  const imageData = cutoutContext.getImageData(localX, localY, localWidth, localHeight);
  const alpha = imageData.data;
  const contactRow = new Int32Array(localWidth);
  const columnWeight = new Float32Array(localWidth);

  for (let x = 0; x < localWidth; x += 1) {
    contactRow[x] = -1;
    for (let y = localHeight - 1; y >= Math.floor(localHeight * 0.45); y -= 1) {
      const a = alpha[(y * localWidth + x) * 4 + 3];
      if (a > 24) {
        contactRow[x] = y;
        columnWeight[x] = a;
        break;
      }
    }
  }

  const peaks = [];
  for (let x = 2; x < localWidth - 2; x += 1) {
    if (contactRow[x] < 0) {
      continue;
    }
    const localAvg =
      (Math.max(0, contactRow[x - 2]) +
        Math.max(0, contactRow[x - 1]) +
        Math.max(0, contactRow[x]) +
        Math.max(0, contactRow[x + 1]) +
        Math.max(0, contactRow[x + 2])) /
      5;
    const score = localAvg + columnWeight[x] * 0.02;
    peaks.push({ x, score });
  }
  peaks.sort((a, b) => b.score - a.score);

  const wheelAnchors = [];
  for (const peak of peaks) {
    if (wheelAnchors.every((item) => Math.abs(item.x - peak.x) > localWidth * 0.18)) {
      wheelAnchors.push(peak);
    }
    if (wheelAnchors.length === 2) {
      break;
    }
  }
  wheelAnchors.sort((a, b) => a.x - b.x);

  const smoothedContactRow = new Float32Array(localWidth);
  for (let x = 0; x < localWidth; x += 1) {
    let sum = 0;
    let count = 0;
    for (let offset = -6; offset <= 6; offset += 1) {
      const sampleX = x + offset;
      if (sampleX < 0 || sampleX >= localWidth || contactRow[sampleX] < 0) {
        continue;
      }
      sum += contactRow[sampleX];
      count += 1;
    }
    smoothedContactRow[x] = count ? sum / count : localHeight - 1;
  }

  const leftWheel = wheelAnchors[0] || { x: localWidth * 0.24 };
  const rightWheel = wheelAnchors[1] || { x: localWidth * 0.8 };
  const direction = rightWheel.x > leftWheel.x ? 1 : -1;
  const groundY = drawBottom + baseHeight * 0.02;
  const leftGroundY = groundY + baseHeight * 0.07;
  const rightGroundY = groundY - baseHeight * 0.03;
  const contourStart = Math.max(0, Math.floor(leftWheel.x - localWidth * 0.18));
  const contourEnd = Math.min(localWidth - 1, Math.ceil(rightWheel.x + localWidth * 0.14));
  const skewStrength = baseWidth * 0.05 * direction;

  context.save();
  context.filter = "blur(8px)";
  const mainShadowGradient = context.createLinearGradient(0, drawBottom - baseHeight * 0.05, 0, drawBottom + baseHeight * 0.95);
  mainShadowGradient.addColorStop(0, "rgba(42, 46, 52, 0.30)");
  mainShadowGradient.addColorStop(0.35, "rgba(70, 76, 84, 0.18)");
  mainShadowGradient.addColorStop(1, "rgba(175, 182, 190, 0)");
  context.fillStyle = mainShadowGradient;
  context.beginPath();
  for (let x = contourStart; x <= contourEnd; x += 1) {
    const px = drawLeft + x * drawRect.scale;
    const py = drawTop + smoothedContactRow[x] * drawRect.scale + baseHeight * 0.015;
    if (x === contourStart) {
      context.moveTo(px, py);
    } else {
      context.lineTo(px, py);
    }
  }
  for (let x = contourEnd; x >= contourStart; x -= 1) {
    const progress = (x - contourStart) / Math.max(1, contourEnd - contourStart);
    const px = drawLeft + x * drawRect.scale + skewStrength * progress;
    const py = drawTop + smoothedContactRow[x] * drawRect.scale + baseHeight * (0.24 + progress * 0.18);
    context.lineTo(px, py);
  }
  context.closePath();
  context.fill();
  context.restore();

  context.save();
  context.globalAlpha = 0.10;
  context.filter = "blur(22px)";
  const ambientShadowGradient = context.createLinearGradient(0, groundY, 0, groundY + baseHeight * 1.6);
  ambientShadowGradient.addColorStop(0, "rgba(80, 88, 98, 0.16)");
  ambientShadowGradient.addColorStop(1, "rgba(180, 188, 198, 0)");
  context.fillStyle = ambientShadowGradient;
  context.beginPath();
  context.ellipse(
    drawLeft + baseWidth * 0.5 + skewStrength * 0.3,
    groundY + baseHeight * 0.42,
    baseWidth * 0.28,
    baseHeight * 0.28,
    direction > 0 ? 0.05 : -0.05,
    0,
    Math.PI * 2
  );
  context.fill();
  context.restore();

  const wheelSegments = [
    { x: leftWheel.x, y: leftGroundY, width: baseWidth * 0.11, height: baseHeight * 0.20, alpha: 0.28 },
    { x: rightWheel.x, y: rightGroundY, width: baseWidth * 0.09, height: baseHeight * 0.18, alpha: 0.24 }
  ];

  for (const segment of wheelSegments) {
    const centerX = drawLeft + segment.x * drawRect.scale;
    context.save();
    context.filter = "blur(5px)";
    const gradient = context.createRadialGradient(centerX, segment.y, 0, centerX, segment.y, segment.width);
    gradient.addColorStop(0, `rgba(38, 42, 48, ${segment.alpha})`);
    gradient.addColorStop(0.5, `rgba(68, 74, 82, ${segment.alpha * 0.45})`);
    gradient.addColorStop(1, "rgba(175, 182, 190, 0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(centerX, segment.y, segment.width, segment.height, direction > 0 ? 0.04 : -0.04, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  const midCenterX = drawLeft + (leftWheel.x + rightWheel.x) * 0.5 * drawRect.scale + skewStrength * 0.15;
  context.save();
  context.globalAlpha = 0.10;
  context.filter = "blur(10px)";
  const centerGradient = context.createRadialGradient(midCenterX, groundY, 0, midCenterX, groundY, baseWidth * 0.14);
  centerGradient.addColorStop(0, "rgba(58, 64, 72, 0.16)");
  centerGradient.addColorStop(1, "rgba(180, 188, 198, 0)");
  context.fillStyle = centerGradient;
  context.beginPath();
  context.ellipse(midCenterX, groundY + baseHeight * 0.06, baseWidth * 0.14, baseHeight * 0.10, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();

  for (const [index, wheel] of [leftWheel, rightWheel].entries()) {
    const wheelX = drawLeft + wheel.x * drawRect.scale;
    const wheelY = index === 0 ? leftGroundY : rightGroundY;
    const major = baseWidth * (index === 0 ? 0.14 : 0.12);
    const minor = baseHeight * (index === 0 ? 0.52 : 0.46);

    context.save();
    context.filter = "blur(8px)";
    const wheelGradient = context.createRadialGradient(wheelX, wheelY, 0, wheelX, wheelY, major);
    wheelGradient.addColorStop(0, "rgba(45, 48, 54, 0.36)");
    wheelGradient.addColorStop(0.45, "rgba(70, 75, 82, 0.18)");
    wheelGradient.addColorStop(1, "rgba(160, 170, 180, 0)");
    context.fillStyle = wheelGradient;
    context.beginPath();
    context.ellipse(wheelX, wheelY, major, minor, index === 0 ? -0.08 : 0.06, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.save();
    context.globalAlpha = 0.06;
    context.filter = "blur(4px)";
    const highlight = context.createRadialGradient(wheelX, wheelY - minor * 0.15, 0, wheelX, wheelY - minor * 0.15, major * 0.7);
    highlight.addColorStop(0, "rgba(255,255,255,0.95)");
    highlight.addColorStop(0.5, "rgba(255,255,255,0.18)");
    highlight.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = highlight;
    context.beginPath();
    context.ellipse(wheelX, wheelY - minor * 0.12, major * 0.72, minor * 0.34, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}

function updateRangeLabels() {
  aggressivenessValue.textContent = aggressivenessRange.value;
  featherValue.textContent = `${featherRange.value} px`;
  brushSizeValue.textContent = `${brushSizeRange.value} px`;
}

function setBrushMode(mode) {
  brushMode = mode;
  eraseButton.classList.toggle("is-active", mode === "erase");
  restoreButton.classList.toggle("is-active", mode === "restore");
}

function updateUndoState() {
  undoButton.disabled = undoStack.length === 0;
}

function pushUndoSnapshot() {
  if (!currentAlphaMask) {
    return;
  }

  undoStack.push(currentAlphaMask.slice());
  if (undoStack.length > 20) {
    undoStack.shift();
  }
  updateUndoState();
}

function estimateBackgroundColor(data, width, height) {
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  const step = Math.max(1, Math.round(Math.min(width, height) / 80));

  for (let x = 0; x < width; x += step) {
    const topOffset = (x + 0 * width) * 4;
    const bottomOffset = (x + (height - 1) * width) * 4;
    red += data[topOffset] + data[bottomOffset];
    green += data[topOffset + 1] + data[bottomOffset + 1];
    blue += data[topOffset + 2] + data[bottomOffset + 2];
    count += 2;
  }

  for (let y = step; y < height - 1; y += step) {
    const leftOffset = (0 + y * width) * 4;
    const rightOffset = (width - 1 + y * width) * 4;
    red += data[leftOffset] + data[rightOffset];
    green += data[leftOffset + 1] + data[rightOffset + 1];
    blue += data[leftOffset + 2] + data[rightOffset + 2];
    count += 2;
  }

  return {
    red: red / count,
    green: green / count,
    blue: blue / count
  };
}

function colorDistance(data, offset, background) {
  const dr = data[offset] - background.red;
  const dg = data[offset + 1] - background.green;
  const db = data[offset + 2] - background.blue;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function computeEdgeStrength(data, width, height) {
  const edges = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const center = (y * width + x) * 4;
      const left = center - 4;
      const right = center + 4;
      const top = center - width * 4;
      const bottom = center + width * 4;
      const horizontal =
        Math.abs(data[right] - data[left]) +
        Math.abs(data[right + 1] - data[left + 1]) +
        Math.abs(data[right + 2] - data[left + 2]);
      const vertical =
        Math.abs(data[bottom] - data[top]) +
        Math.abs(data[bottom + 1] - data[top + 1]) +
        Math.abs(data[bottom + 2] - data[top + 2]);
      edges[y * width + x] = horizontal + vertical;
    }
  }

  return edges;
}

function createBackgroundMask(imageData, threshold, edgeThreshold) {
  const { data, width, height } = imageData;
  const background = estimateBackgroundColor(data, width, height);
  const edges = computeEdgeStrength(data, width, height);
  const mask = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let head = 0;
  let tail = 0;

  function enqueue(index) {
    if (visited[index]) {
      return;
    }

    const offset = index * 4;
    if (colorDistance(data, offset, background) > threshold || edges[index] > edgeThreshold) {
      return;
    }

    visited[index] = 1;
    queue[tail] = index;
    tail += 1;
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }

  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    mask[index] = 1;
    const x = index % width;
    const y = Math.floor(index / width);

    if (x > 0) {
      enqueue(index - 1);
    }
    if (x < width - 1) {
      enqueue(index + 1);
    }
    if (y > 0) {
      enqueue(index - width);
    }
    if (y < height - 1) {
      enqueue(index + width);
    }
  }

  return {
    background,
    edges,
    mask
  };
}

function keepLargestForeground(mask, width, height) {
  const visited = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let bestComponent = [];

  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] || visited[index]) {
      continue;
    }

    let head = 0;
    let tail = 0;
    const component = [];
    visited[index] = 1;
    queue[tail] = index;
    tail += 1;

    while (head < tail) {
      const current = queue[head];
      head += 1;
      component.push(current);
      const x = current % width;
      const y = Math.floor(current / width);

      if (x > 0) {
        const next = current - 1;
        if (!mask[next] && !visited[next]) {
          visited[next] = 1;
          queue[tail] = next;
          tail += 1;
        }
      }
      if (x < width - 1) {
        const next = current + 1;
        if (!mask[next] && !visited[next]) {
          visited[next] = 1;
          queue[tail] = next;
          tail += 1;
        }
      }
      if (y > 0) {
        const next = current - width;
        if (!mask[next] && !visited[next]) {
          visited[next] = 1;
          queue[tail] = next;
          tail += 1;
        }
      }
      if (y < height - 1) {
        const next = current + width;
        if (!mask[next] && !visited[next]) {
          visited[next] = 1;
          queue[tail] = next;
          tail += 1;
        }
      }
    }

    if (component.length > bestComponent.length) {
      bestComponent = component;
    }
  }

  const foreground = new Uint8Array(width * height);
  for (const index of bestComponent) {
    foreground[index] = 1;
  }
  return foreground;
}

function dilate(mask, width, height, radius) {
  if (radius <= 0) {
    return mask;
  }

  let current = mask;
  for (let step = 0; step < radius; step += 1) {
    const expanded = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (current[index]) {
          expanded[index] = 1;
          continue;
        }

        let hit = false;
        for (let dy = -1; dy <= 1 && !hit; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
              continue;
            }
            if (current[ny * width + nx]) {
              hit = true;
              break;
            }
          }
        }
        if (hit) {
          expanded[index] = 1;
        }
      }
    }
    current = expanded;
  }

  return current;
}

function distanceToMask(mask, width, height, radius) {
  const distance = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) {
        distance[index] = 0;
        continue;
      }

      let minDistance = radius + 1;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            minDistance = 0;
            continue;
          }
          if (!mask[ny * width + nx]) {
            const candidate = Math.hypot(dx, dy);
            if (candidate < minDistance) {
              minDistance = candidate;
            }
          }
        }
      }
      distance[index] = minDistance;
    }
  }

  return distance;
}

function buildAlphaMask(foreground, width, height, featherRadius) {
  const expanded = dilate(foreground, width, height, 1);
  if (featherRadius <= 0) {
    const solid = new Uint8ClampedArray(width * height);
    for (let index = 0; index < expanded.length; index += 1) {
      solid[index] = expanded[index] ? 255 : 0;
    }
    return solid;
  }

  const alpha = new Uint8ClampedArray(width * height);
  const distance = distanceToMask(expanded, width, height, featherRadius);

  for (let index = 0; index < alpha.length; index += 1) {
    if (!expanded[index]) {
      alpha[index] = 0;
      continue;
    }

    if (distance[index] > featherRadius) {
      alpha[index] = 255;
      continue;
    }

    alpha[index] = Math.max(0, Math.min(255, Math.round((distance[index] / featherRadius) * 255)));
  }

  return alpha;
}

function getBoundingBox(mask, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) {
      continue;
    }

    const x = index % width;
    const y = Math.floor(index / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

function boxBlur(mask, width, height, radius) {
  if (radius <= 0) {
    return mask;
  }

  const blurred = new Uint8ClampedArray(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          sum += mask[ny * width + nx];
          count += 1;
        }
      }
      blurred[y * width + x] = Math.round(sum / Math.max(1, count));
    }
  }
  return blurred;
}

function buildShadowMask(imageData, foreground, alphaMask, background) {
  const { data, width, height } = imageData;
  const bbox = getBoundingBox(foreground, width, height);
  if (!bbox) {
    return new Uint8ClampedArray(width * height);
  }

  const shadow = new Uint8ClampedArray(width * height);
  const expandX = Math.round(bbox.width * 0.18);
  const shadowStartX = Math.max(0, bbox.x - expandX);
  const shadowEndX = Math.min(width - 1, bbox.x + bbox.width - 1 + expandX);
  const shadowStartY = Math.max(0, bbox.y + Math.floor(bbox.height * 0.6));
  const shadowEndY = Math.min(height - 1, bbox.y + bbox.height - 1 + Math.max(12, Math.round(bbox.height * 0.16)));
  const backgroundLuma = 0.2126 * background.red + 0.7152 * background.green + 0.0722 * background.blue;

  for (let y = shadowStartY; y <= shadowEndY; y += 1) {
    const verticalWeight = 1 - (y - shadowStartY) / Math.max(1, shadowEndY - shadowStartY + 1);
    for (let x = shadowStartX; x <= shadowEndX; x += 1) {
      const index = y * width + x;
      if (alphaMask[index] > 0) {
        continue;
      }

      const offset = index * 4;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      const darkness = backgroundLuma - luma;
      if (darkness < 8) {
        continue;
      }

      const maxChannel = Math.max(red, green, blue);
      const minChannel = Math.min(red, green, blue);
      const saturation = maxChannel - minChannel;
      if (saturation > 42) {
        continue;
      }

      let nearCar = false;
      for (let dy = -3; dy <= 2 && !nearCar; dy += 1) {
        for (let dx = -3; dx <= 3; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          if (foreground[ny * width + nx]) {
            nearCar = true;
            break;
          }
        }
      }

      if (!nearCar) {
        continue;
      }

      const alpha = Math.round(Math.min(118, darkness * 3.4 * verticalWeight));
      if (alpha > shadow[index]) {
        shadow[index] = alpha;
      }
    }
  }

  return boxBlur(shadow, width, height, 2);
}

function mergeAlphaMasks(baseAlpha, shadowAlpha) {
  const merged = new Uint8ClampedArray(baseAlpha.length);
  for (let index = 0; index < baseAlpha.length; index += 1) {
    merged[index] = Math.max(baseAlpha[index], shadowAlpha[index]);
  }
  return merged;
}

function summarizeResult({ foreground, alphaMask, width, height, background, threshold, edgeThreshold, isEdited }) {
  let opaquePixels = 0;
  let softPixels = 0;
  let sumAlpha = 0;
  let shadowPixels = 0;
  const bbox = getBoundingBox(foreground, width, height);

  for (let index = 0; index < alphaMask.length; index += 1) {
    const alpha = alphaMask[index];
    if (!alpha) {
      continue;
    }

    sumAlpha += alpha;
    if (alpha > 220) {
      opaquePixels += 1;
    } else {
      softPixels += 1;
      shadowPixels += 1;
    }
  }

  const coverage = sumAlpha / 255 / (width * height);
  const confidence = Math.max(0.2, Math.min(0.98, 1 - Math.abs(coverage - 0.34) * 1.4 - softPixels / (width * height * 4)));

  return {
    status: "ok",
    width,
    height,
    threshold,
    edge_threshold: edgeThreshold,
    edited: isEdited,
    estimated_background_rgb: {
      red: Math.round(background.red),
      green: Math.round(background.green),
      blue: Math.round(background.blue)
    },
    foreground_pixels: foreground.reduce((sum, value) => sum + value, 0),
    opaque_pixels: opaquePixels,
    soft_edge_pixels: softPixels,
    shadow_like_pixels: shadowPixels,
    foreground_ratio: Number(coverage.toFixed(4)),
    confidence: Number(confidence.toFixed(3)),
    bounding_box: bbox
  };
}

function renderSummary(summary) {
  const shadowCopy =
    summary.shadow_like_pixels > 0
      ? `已保留约 ${summary.shadow_like_pixels} 个半透明阴影/柔边像素。`
      : "本次结果几乎没有保留阴影层。";
  summaryCard.className = "summary-card";
  summaryCard.innerHTML = `
    <div class="summary-title">${summary.edited ? "商品图已更新，已手动修边" : "商品图已生成"}</div>
    <div class="summary-copy">主体占画面 ${(summary.foreground_ratio * 100).toFixed(1)}%，本次背景置信度 ${Math.round(
      summary.confidence * 100
    )}%。${shadowCopy} 现在下载的是接近参考图风格的白底商品图。</div>
  `;

  metricStrip.innerHTML = "";
  const metrics = [
    ["主体占比", `${(summary.foreground_ratio * 100).toFixed(1)}%`],
    ["实边像素", `${summary.opaque_pixels}`],
    ["阴影/柔边", `${summary.shadow_like_pixels}`],
    ["背景阈值", `${summary.threshold}`]
  ];

  for (const [label, value] of metrics) {
    const item = document.createElement("div");
    item.className = "metric-chip";
    item.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    metricStrip.appendChild(item);
  }
}

function renderJson(summary) {
  jsonOutput.textContent = JSON.stringify(summary, null, 2);
}

function createForegroundFromAlpha(alphaMask) {
  const foreground = new Uint8Array(alphaMask.length);
  for (let index = 0; index < alphaMask.length; index += 1) {
    foreground[index] = alphaMask[index] > 0 ? 1 : 0;
  }
  return foreground;
}

async function updateDownloadFromCanvas() {
  if (currentResultUrl) {
    URL.revokeObjectURL(currentResultUrl);
  }

  const blob = await new Promise((resolve, reject) => {
    exportCanvas.toBlob((value) => {
      if (value) {
        resolve(value);
      } else {
        reject(new Error("透明 PNG 导出失败。"));
      }
    }, "image/png");
  });

  currentResultUrl = URL.createObjectURL(blob);
  setDownloadState(true, currentResultUrl);
}

async function updateDownloadFromDataUrl(dataUrl) {
  if (currentResultUrl) {
    URL.revokeObjectURL(currentResultUrl);
  }

  const response = await fetch(dataUrl);
  const blob = await response.blob();
  currentResultUrl = URL.createObjectURL(blob);
  setDownloadState(true, currentResultUrl);
}

function boostStudioShadow(targetContext, bbox, canvasWidth, canvasHeight) {
  void targetContext;
  void bbox;
  void canvasWidth;
  void canvasHeight;
}

async function renderStudioFromApi(dataUrl, bbox) {
  const image = await loadImage(dataUrl);
  const scaledBox = bbox ? scaleBoundingBox(bbox, currentImageData.width, currentImageData.height, image.naturalWidth, image.naturalHeight) : null;

  exportCanvas.width = image.naturalWidth;
  exportCanvas.height = image.naturalHeight;
  exportContext.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
  exportContext.drawImage(image, 0, 0);
  boostStudioShadow(exportContext, scaledBox, exportCanvas.width, exportCanvas.height);

  studioCanvas.width = image.naturalWidth;
  studioCanvas.height = image.naturalHeight;
  studioCanvas.hidden = false;
  studioPlaceholder.hidden = true;
  studioContext.clearRect(0, 0, studioCanvas.width, studioCanvas.height);
  studioContext.drawImage(exportCanvas, 0, 0);
  await updateDownloadFromCanvas();
}

function buildCutoutCanvas(image, alphaMask, sourceWidth, sourceHeight) {
  cutoutCanvas.width = image.naturalWidth;
  cutoutCanvas.height = image.naturalHeight;
  cutoutContext.clearRect(0, 0, image.naturalWidth, image.naturalHeight);
  cutoutContext.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight);

  const fullSize = cutoutContext.getImageData(0, 0, image.naturalWidth, image.naturalHeight);
  for (let y = 0; y < image.naturalHeight; y += 1) {
    for (let x = 0; x < image.naturalWidth; x += 1) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor((x / image.naturalWidth) * sourceWidth));
      const sourceY = Math.min(sourceHeight - 1, Math.floor((y / image.naturalHeight) * sourceHeight));
      fullSize.data[(y * image.naturalWidth + x) * 4 + 3] = alphaMask[sourceY * sourceWidth + sourceX];
    }
  }
  cutoutContext.putImageData(fullSize, 0, 0);
}

function renderStudioComposite(targetContext, targetWidth, targetHeight, sourceCanvas, bbox) {
  targetContext.clearRect(0, 0, targetWidth, targetHeight);
  targetContext.fillStyle = "#ffffff";
  targetContext.fillRect(0, 0, targetWidth, targetHeight);

  const safeBox =
    bbox || {
      x: 0,
      y: 0,
      width: sourceCanvas.width,
      height: sourceCanvas.height
    };
  const padX = Math.round(safeBox.width * 0.12);
  const padTop = Math.round(safeBox.height * 0.14);
  const padBottom = Math.round(safeBox.height * 0.12);
  const cropX = Math.max(0, safeBox.x - padX);
  const cropY = Math.max(0, safeBox.y - padTop);
  const cropWidth = Math.min(sourceCanvas.width - cropX, safeBox.width + padX * 2);
  const cropHeight = Math.min(sourceCanvas.height - cropY, safeBox.height + padTop + padBottom);
  const scale = Math.min((targetWidth * 0.9) / cropWidth, (targetHeight * 0.68) / cropHeight);
  const drawWidth = cropWidth * scale;
  const drawHeight = cropHeight * scale;
  const drawX = (targetWidth - drawWidth) / 2;
  const drawY = targetHeight * 0.13;

  drawNaturalShadow(
    targetContext,
    sourceCanvas,
    safeBox,
    { x: cropX, y: cropY },
    {
      x: drawX,
      y: drawY,
      scale
    }
  );

  targetContext.drawImage(sourceCanvas, cropX, cropY, cropWidth, cropHeight, drawX, drawY, drawWidth, drawHeight);
}

function scaleBoundingBox(bbox, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  if (!bbox) {
    return null;
  }

  return {
    x: Math.round((bbox.x / sourceWidth) * targetWidth),
    y: Math.round((bbox.y / sourceHeight) * targetHeight),
    width: Math.max(1, Math.round((bbox.width / sourceWidth) * targetWidth)),
    height: Math.max(1, Math.round((bbox.height / sourceHeight) * targetHeight))
  };
}

function buildStudioCanvas(bbox) {
  const width = 1600;
  const height = 1200;
  const scaledBox = scaleBoundingBox(bbox, currentImageData.width, currentImageData.height, cutoutCanvas.width, cutoutCanvas.height);
  exportCanvas.width = width;
  exportCanvas.height = height;
  renderStudioComposite(exportContext, width, height, cutoutCanvas, scaledBox);

  studioCanvas.width = width;
  studioCanvas.height = height;
  studioCanvas.hidden = false;
  studioPlaceholder.hidden = true;
  renderStudioComposite(studioContext, width, height, cutoutCanvas, scaledBox);
}

function renderEditablePreview() {
  if (!currentImageData || !currentAlphaMask || !editContext) {
    return;
  }

  previewCanvas.width = currentImageData.width;
  previewCanvas.height = currentImageData.height;
  previewContext.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

  const previewImageData = new ImageData(currentImageData.width, currentImageData.height);
  for (let index = 0; index < currentAlphaMask.length; index += 1) {
    const offset = index * 4;
    previewImageData.data[offset] = currentImageData.data[offset];
    previewImageData.data[offset + 1] = currentImageData.data[offset + 1];
    previewImageData.data[offset + 2] = currentImageData.data[offset + 2];
    previewImageData.data[offset + 3] = currentAlphaMask[index];
  }
  previewContext.putImageData(previewImageData, 0, 0);

  editCanvas.width = currentImageData.width;
  editCanvas.height = currentImageData.height;
  editCanvas.hidden = false;
  resultPlaceholder.hidden = true;

  editContext.clearRect(0, 0, editCanvas.width, editCanvas.height);
  editContext.drawImage(previewCanvas, 0, 0);
}

async function commitRender(isEdited = false) {
  if (!currentImageElement || !currentImageData || !currentAlphaMask || !currentBackground) {
    return;
  }

  buildCutoutCanvas(currentImageElement, currentAlphaMask, currentImageData.width, currentImageData.height);
  const bbox = getBoundingBox(currentForegroundMask || createForegroundFromAlpha(currentAlphaMask), currentImageData.width, currentImageData.height);
  if (!isEdited && currentStudioApiDataUrl) {
    await renderStudioFromApi(currentStudioApiDataUrl, bbox);
  } else {
    buildStudioCanvas(bbox);
    await updateDownloadFromCanvas();
  }
  renderEditablePreview();
  const summary = summarizeResult({
    foreground: currentForegroundMask || createForegroundFromAlpha(currentAlphaMask),
    alphaMask: currentAlphaMask,
    width: currentImageData.width,
    height: currentImageData.height,
    background: currentBackground,
    threshold: currentThreshold,
    edgeThreshold: Math.round(currentEdgeThreshold),
    isEdited
  });
  renderSummary(summary);
  renderJson(summary);
}

function getCanvasPoint(event) {
  const rect = editCanvas.getBoundingClientRect();
  const scaleX = editCanvas.width / rect.width;
  const scaleY = editCanvas.height / rect.height;

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

function stampBrush(point) {
  if (!currentAlphaMask || !currentImageData) {
    return;
  }

  const radius = Number(brushSizeRange.value) / 2;
  const minX = Math.max(0, Math.floor(point.x - radius));
  const maxX = Math.min(currentImageData.width - 1, Math.ceil(point.x + radius));
  const minY = Math.max(0, Math.floor(point.y - radius));
  const maxY = Math.min(currentImageData.height - 1, Math.ceil(point.y + radius));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - point.x;
      const dy = y - point.y;
      if (dx * dx + dy * dy > radius * radius) {
        continue;
      }

      const index = y * currentImageData.width + x;
      currentAlphaMask[index] = brushMode === "erase" ? 0 : 255;
    }
  }
}

function drawSegment(from, to) {
  const distance = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));
  const steps = Math.ceil(distance / 2);

  for (let step = 0; step <= steps; step += 1) {
    const ratio = step / steps;
    stampBrush({
      x: from.x + (to.x - from.x) * ratio,
      y: from.y + (to.y - from.y) * ratio
    });
  }
}

let lastPaintPoint = null;

function handlePaintStart(event) {
  if (!currentAlphaMask || editCanvas.hidden) {
    return;
  }

  event.preventDefault();
  pushUndoSnapshot();
  isPainting = true;
  lastPaintPoint = getCanvasPoint(event);
  stampBrush(lastPaintPoint);
  renderEditablePreview();
}

function handlePaintMove(event) {
  if (!isPainting || !lastPaintPoint) {
    return;
  }

  event.preventDefault();
  const point = getCanvasPoint(event);
  drawSegment(lastPaintPoint, point);
  lastPaintPoint = point;
  renderEditablePreview();
}

async function handlePaintEnd() {
  if (!isPainting) {
    return;
  }

  isPainting = false;
  lastPaintPoint = null;
  await commitRender(true);
  setStatus(brushMode === "erase" ? "已擦除一部分背景。可继续修边或下载。" : "已恢复一部分车身。可继续修边或下载。", "success");
}

async function processCurrentFile() {
  if (!currentFile) {
    return;
  }

  if (!workingContext || !exportContext || !editContext || !previewContext) {
    setStatus("当前浏览器不支持 Canvas 图像处理。", "error");
    return;
  }

  setStatus("正在调用真实抠图接口...", "busy");
  setDownloadState(false);

  try {
    const localUrl = URL.createObjectURL(currentFile);
    const image = await loadImage(localUrl);
    URL.revokeObjectURL(localUrl);
    currentImageElement = image;

    const [cutoutResult, studioResult] = await Promise.all([requestCutout(currentFile), requestStudio(currentFile)]);
    currentStudioApiDataUrl = `data:${studioResult.image.mime_type};base64,${studioResult.image.base64}`;
    const cutoutUrl = `data:${cutoutResult.image.mime_type};base64,${cutoutResult.image.base64}`;
    const cutoutImage = await loadImage(cutoutUrl);
    const fitted = fitSize(image.naturalWidth, image.naturalHeight);
    workingCanvas.width = fitted.width;
    workingCanvas.height = fitted.height;
    workingContext.clearRect(0, 0, fitted.width, fitted.height);
    workingContext.drawImage(image, 0, 0, fitted.width, fitted.height);

    const imageData = workingContext.getImageData(0, 0, fitted.width, fitted.height);
    previewCanvas.width = fitted.width;
    previewCanvas.height = fitted.height;
    previewContext.clearRect(0, 0, fitted.width, fitted.height);
    previewContext.drawImage(cutoutImage, 0, 0, fitted.width, fitted.height);
    const cutoutImageData = previewContext.getImageData(0, 0, fitted.width, fitted.height);
    const alphaMask = new Uint8ClampedArray(fitted.width * fitted.height);
    for (let index = 0; index < alphaMask.length; index += 1) {
      alphaMask[index] = cutoutImageData.data[index * 4 + 3];
    }

    const foreground = createForegroundFromAlpha(alphaMask);
    const background = estimateBackgroundColor(imageData.data, imageData.width, imageData.height);
    const threshold = Number(aggressivenessRange.value);
    const edgeThreshold = 0;

    currentImageData = imageData;
    currentForegroundMask = foreground;
    currentAlphaMask = alphaMask;
    currentBackground = background;
    currentThreshold = threshold;
    currentEdgeThreshold = edgeThreshold;
    undoStack = [];
    updateUndoState();

    await commitRender(false);
    setStatus(`模型商品图已生成。cutout: ${cutoutResult.provider} · studio: ${studioResult.provider}`, "success");
  } catch (error) {
    summaryCard.className = "summary-card empty";
    summaryCard.textContent = "抠图失败";
    metricStrip.innerHTML = "";
    jsonOutput.textContent = JSON.stringify(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      null,
      2
    );
    setStatus(error instanceof Error ? error.message : "抠图失败", "error");
  }
}

async function handleFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    setStatus("请选择图片文件。", "error");
    return;
  }

  currentFile = file;
  processButton.disabled = false;
  imageMeta.textContent = `${file.name} · ${formatBytes(file.size)} · ${file.type || "unknown"}`;

  if (currentSourceUrl) {
    URL.revokeObjectURL(currentSourceUrl);
  }

  currentSourceUrl = URL.createObjectURL(file);
  sourceImage.src = currentSourceUrl;
  sourceImage.hidden = false;
  sourcePlaceholder.hidden = true;
  await processCurrentFile();
}

fileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files || [];
  if (file) {
    await handleFile(file);
  }
});

processButton.addEventListener("click", async () => {
  await processCurrentFile();
});

eraseButton.addEventListener("click", () => {
  setBrushMode("erase");
});

restoreButton.addEventListener("click", () => {
  setBrushMode("restore");
});

undoButton.addEventListener("click", async () => {
  if (!undoStack.length) {
    return;
  }

  currentAlphaMask = undoStack.pop();
  updateUndoState();
  await commitRender(true);
  setStatus("已撤销上一步修边。", "success");
});

aggressivenessRange.addEventListener("input", updateRangeLabels);
featherRange.addEventListener("input", updateRangeLabels);
brushSizeRange.addEventListener("input", updateRangeLabels);

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragover");
  });
});

dropzone.addEventListener("drop", async (event) => {
  const [file] = event.dataTransfer?.files || [];
  if (file) {
    fileInput.files = event.dataTransfer.files;
    await handleFile(file);
  }
});

editCanvas.addEventListener("pointerdown", handlePaintStart);
editCanvas.addEventListener("pointermove", handlePaintMove);
editCanvas.addEventListener("pointerup", handlePaintEnd);
editCanvas.addEventListener("pointerleave", handlePaintEnd);
editCanvas.addEventListener("pointercancel", handlePaintEnd);

updateRangeLabels();
setDownloadState(false);
setBrushMode("erase");
