const TARGET_ASPECT = 16 / 5;
const TARGET_WIDTH = 640;
const TARGET_HEIGHT = 200;

const fileInput = document.getElementById("fileInput");
const saveButton = document.getElementById("saveButton");
const resizeCheckbox = document.getElementById("resizeCheckbox");
const filenameInput = document.getElementById("filenameInput");
const imageInfo = document.getElementById("imageInfo");
const cropInfo = document.getElementById("cropInfo");
const previewCanvas = document.getElementById("previewCanvas");
const ctx = previewCanvas.getContext("2d");
const MIN_CROP_WIDTH = 64;
const HANDLE_RADIUS = 10;

let loadedImage = null;
let imageBounds = null;
let cropRect = null;
let activePointerId = null;
let dragOffset = { x: 0, y: 0 };
let currentObjectUrl = null;
let interaction = null;
let outputNameDirty = false;

function setCanvasResolution() {
  const ratio = window.devicePixelRatio || 1;
  const displayWidth = previewCanvas.clientWidth || 960;
  const desiredWidth = Math.max(320, Math.round(displayWidth));
  const desiredHeight = Math.round(desiredWidth * (2 / 3));

  previewCanvas.width = Math.round(desiredWidth * ratio);
  previewCanvas.height = Math.round(desiredHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  if (loadedImage) {
    recomputeLayout(false);
  } else {
    drawEmptyState();
  }
}

function drawEmptyState() {
  const width = previewCanvas.width / (window.devicePixelRatio || 1);
  const height = previewCanvas.height / (window.devicePixelRatio || 1);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f6efdf";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#8e7d69";
  ctx.font = '600 20px "Space Grotesk", "Noto Sans JP", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("画像を選択するとここに表示されます", width / 2, height / 2);
}

function fitRect(srcWidth, srcHeight, dstWidth, dstHeight) {
  const scale = Math.min(dstWidth / srcWidth, dstHeight / srcHeight);
  const width = srcWidth * scale;
  const height = srcHeight * scale;

  return {
    x: (dstWidth - width) / 2,
    y: (dstHeight - height) / 2,
    width,
    height,
    scale
  };
}

function createInitialCrop(bounds) {
  const maxWidthByHeight = bounds.height * TARGET_ASPECT;
  const width = Math.min(bounds.width * 0.86, maxWidthByHeight);
  const height = width / TARGET_ASPECT;

  return {
    width,
    height,
    x: bounds.x + (bounds.width - width) / 2,
    y: bounds.y + (bounds.height - height) / 2
  };
}

function clampCropToBounds(rect, bounds) {
  rect.x = Math.max(bounds.x, Math.min(rect.x, bounds.x + bounds.width - rect.width));
  rect.y = Math.max(bounds.y, Math.min(rect.y, bounds.y + bounds.height - rect.height));
}

function getHandlePoints() {
  return {
    nw: { x: cropRect.x, y: cropRect.y },
    ne: { x: cropRect.x + cropRect.width, y: cropRect.y },
    sw: { x: cropRect.x, y: cropRect.y + cropRect.height },
    se: { x: cropRect.x + cropRect.width, y: cropRect.y + cropRect.height }
  };
}

function getHitHandle(point) {
  const handles = getHandlePoints();
  for (const [name, handle] of Object.entries(handles)) {
    const dx = point.x - handle.x;
    const dy = point.y - handle.y;
    if (Math.hypot(dx, dy) <= HANDLE_RADIUS + 4) {
      return name;
    }
  }
  return null;
}

function getResizeCursor(handle) {
  if (handle === "nw" || handle === "se") {
    return "nwse-resize";
  }
  return "nesw-resize";
}

function getEffectiveMinCropWidth() {
  return Math.min(MIN_CROP_WIDTH, imageBounds.width, imageBounds.height * TARGET_ASPECT);
}

function getMaxSizeFromAnchor(anchorX, anchorY, directionX, directionY) {
  const maxWidthByX = directionX > 0
    ? imageBounds.x + imageBounds.width - anchorX
    : anchorX - imageBounds.x;
  const maxWidthByY = (directionY > 0
    ? imageBounds.y + imageBounds.height - anchorY
    : anchorY - imageBounds.y) * TARGET_ASPECT;

  return Math.min(maxWidthByX, maxWidthByY);
}

function resizeCropFromAnchor(point) {
  const { anchorX, anchorY, directionX, directionY } = interaction;
  const widthFromX = Math.abs(point.x - anchorX);
  const widthFromY = Math.abs(point.y - anchorY) * TARGET_ASPECT;
  const maxWidth = getMaxSizeFromAnchor(anchorX, anchorY, directionX, directionY);
  const minWidth = Math.min(getEffectiveMinCropWidth(), maxWidth);
  const nextWidth = Math.min(maxWidth, Math.max(minWidth, Math.min(widthFromX, widthFromY)));
  const nextHeight = nextWidth / TARGET_ASPECT;

  cropRect.width = nextWidth;
  cropRect.height = nextHeight;
  cropRect.x = directionX > 0 ? anchorX : anchorX - nextWidth;
  cropRect.y = directionY > 0 ? anchorY : anchorY - nextHeight;
  clampCropToBounds(cropRect, imageBounds);
}

function recomputeLayout(resetCrop = true) {
  const width = previewCanvas.width / (window.devicePixelRatio || 1);
  const height = previewCanvas.height / (window.devicePixelRatio || 1);

  imageBounds = fitRect(loadedImage.naturalWidth, loadedImage.naturalHeight, width, height);

  if (
    resetCrop ||
    !cropRect ||
    cropRect.width > imageBounds.width ||
    cropRect.height > imageBounds.height
  ) {
    cropRect = createInitialCrop(imageBounds);
  } else {
    cropRect = {
      x: imageBounds.x + (cropRect.xRatio * imageBounds.width),
      y: imageBounds.y + (cropRect.yRatio * imageBounds.height),
      width: cropRect.widthRatio * imageBounds.width,
      height: cropRect.heightRatio * imageBounds.height
    };
    clampCropToBounds(cropRect, imageBounds);
  }

  storeCropRatios();
  draw();
}

function storeCropRatios() {
  cropRect.xRatio = (cropRect.x - imageBounds.x) / imageBounds.width;
  cropRect.yRatio = (cropRect.y - imageBounds.y) / imageBounds.height;
  cropRect.widthRatio = cropRect.width / imageBounds.width;
  cropRect.heightRatio = cropRect.height / imageBounds.height;
}

function getSourceCropRect() {
  const scaleX = loadedImage.naturalWidth / imageBounds.width;
  const scaleY = loadedImage.naturalHeight / imageBounds.height;

  const x = Math.round((cropRect.x - imageBounds.x) * scaleX);
  const y = Math.round((cropRect.y - imageBounds.y) * scaleY);
  const width = Math.round(cropRect.width * scaleX);
  const height = Math.round(cropRect.height * scaleY);

  return {
    x: Math.max(0, Math.min(x, loadedImage.naturalWidth - width)),
    y: Math.max(0, Math.min(y, loadedImage.naturalHeight - height)),
    width: Math.min(width, loadedImage.naturalWidth),
    height: Math.min(height, loadedImage.naturalHeight)
  };
}

function draw() {
  const width = previewCanvas.width / (window.devicePixelRatio || 1);
  const height = previewCanvas.height / (window.devicePixelRatio || 1);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f6efdf";
  ctx.fillRect(0, 0, width, height);

  ctx.drawImage(
    loadedImage,
    imageBounds.x,
    imageBounds.y,
    imageBounds.width,
    imageBounds.height
  );

  ctx.save();
  ctx.fillStyle = "rgba(10, 10, 10, 0.45)";
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.rect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
  ctx.fill("evenodd");
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);

  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1;
  for (let column = 1; column <= 3; column += 1) {
    const x = cropRect.x + (cropRect.width / 4) * column;
    ctx.beginPath();
    ctx.moveTo(x, cropRect.y);
    ctx.lineTo(x, cropRect.y + cropRect.height);
    ctx.stroke();
  }
  for (let row = 1; row <= 1; row += 1) {
    const y = cropRect.y + cropRect.height / 2;
    ctx.beginPath();
    ctx.moveTo(cropRect.x, y);
    ctx.lineTo(cropRect.x + cropRect.width, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#d66e31";
  for (const handle of Object.values(getHandlePoints())) {
    ctx.beginPath();
    ctx.arc(handle.x, handle.y, HANDLE_RADIUS / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();

  const sourceCrop = getSourceCropRect();
  cropInfo.textContent = `${sourceCrop.x}, ${sourceCrop.y}, ${sourceCrop.width} x ${sourceCrop.height}`;
}

function getCanvasPoint(event) {
  const rect = previewCanvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * (previewCanvas.width / (window.devicePixelRatio || 1));
  const y = ((event.clientY - rect.top) / rect.height) * (previewCanvas.height / (window.devicePixelRatio || 1));

  return { x, y };
}

function isInsideCrop(point) {
  return (
    point.x >= cropRect.x &&
    point.x <= cropRect.x + cropRect.width &&
    point.y >= cropRect.y &&
    point.y <= cropRect.y + cropRect.height
  );
}

function handlePointerDown(event) {
  if (!loadedImage) {
    return;
  }

  const point = getCanvasPoint(event);
  const hitHandle = getHitHandle(point);

  if (!hitHandle && !isInsideCrop(point)) {
    return;
  }

  activePointerId = event.pointerId;
  if (hitHandle) {
    const anchorMap = {
      nw: {
        anchorX: cropRect.x + cropRect.width,
        anchorY: cropRect.y + cropRect.height,
        directionX: -1,
        directionY: -1
      },
      ne: {
        anchorX: cropRect.x,
        anchorY: cropRect.y + cropRect.height,
        directionX: 1,
        directionY: -1
      },
      sw: {
        anchorX: cropRect.x + cropRect.width,
        anchorY: cropRect.y,
        directionX: -1,
        directionY: 1
      },
      se: {
        anchorX: cropRect.x,
        anchorY: cropRect.y,
        directionX: 1,
        directionY: 1
      }
    };
    interaction = {
      type: "resize",
      handle: hitHandle,
      ...anchorMap[hitHandle]
    };
  } else {
    dragOffset = {
      x: point.x - cropRect.x,
      y: point.y - cropRect.y
    };
    interaction = { type: "move" };
  }

  previewCanvas.classList.add("dragging");
  previewCanvas.setPointerCapture(activePointerId);
}

function handlePointerMove(event) {
  if (!loadedImage) {
    return;
  }

  const point = getCanvasPoint(event);
  const hitHandle = getHitHandle(point);

  if (activePointerId !== event.pointerId) {
    if (hitHandle) {
      previewCanvas.style.cursor = getResizeCursor(hitHandle);
    } else if (isInsideCrop(point)) {
      previewCanvas.style.cursor = "grab";
    } else {
      previewCanvas.style.cursor = "default";
    }
    return;
  }

  if (interaction?.type === "resize") {
    resizeCropFromAnchor(point);
  } else {
    cropRect.x = point.x - dragOffset.x;
    cropRect.y = point.y - dragOffset.y;
    clampCropToBounds(cropRect, imageBounds);
  }
  storeCropRatios();
  draw();
}

function endDrag(event) {
  if (activePointerId !== event.pointerId) {
    return;
  }

  previewCanvas.classList.remove("dragging");
  if (previewCanvas.hasPointerCapture(activePointerId)) {
    previewCanvas.releasePointerCapture(activePointerId);
  }
  activePointerId = null;
  interaction = null;
  previewCanvas.style.cursor = "grab";
}

function loadImageFromFile(file) {
  if (!file) {
    return;
  }

  if (file.type && !file.type.startsWith("image/")) {
    window.alert("画像ファイルを選択してください。");
    return;
  }

  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
  }

  currentObjectUrl = URL.createObjectURL(file);
  const image = new Image();

  image.onload = () => {
    loadedImage = image;
    imageInfo.textContent = `${file.name} / ${image.naturalWidth} x ${image.naturalHeight}`;
    filenameInput.value = getDefaultOutputName(file.name, resizeCheckbox.checked);
    outputNameDirty = false;
    saveButton.disabled = false;
    recomputeLayout(true);
  };

  image.onerror = () => {
    window.alert("画像の読み込みに失敗しました。");
  };

  image.src = currentObjectUrl;
}

function getDefaultOutputName(originalName, resized) {
  const base = originalName.replace(/\.[^.]+$/, "");
  return `${base}_${resized ? "640x200_" : ""}cropped`;
}

function buildDownloadName(originalName, resized) {
  const requestedName = filenameInput.value.trim() || getDefaultOutputName(originalName, resized);
  return requestedName.toLowerCase().endsWith(".png") ? requestedName : `${requestedName}.png`;
}

function saveCroppedImage() {
  if (!loadedImage) {
    return;
  }

  const sourceCrop = getSourceCropRect();
  const shouldResize = resizeCheckbox.checked;
  const outputWidth = shouldResize ? TARGET_WIDTH : sourceCrop.width;
  const outputHeight = shouldResize ? TARGET_HEIGHT : sourceCrop.height;

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  const outputCtx = outputCanvas.getContext("2d");

  outputCtx.drawImage(
    loadedImage,
    sourceCrop.x,
    sourceCrop.y,
    sourceCrop.width,
    sourceCrop.height,
    0,
    0,
    outputWidth,
    outputHeight
  );

  outputCanvas.toBlob((blob) => {
    if (!blob) {
      window.alert("保存用画像の生成に失敗しました。");
      return;
    }

    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = buildDownloadName(fileInput.files[0]?.name || "image.png", shouldResize);
    link.click();
    URL.revokeObjectURL(downloadUrl);
  }, "image/png");
}

fileInput.addEventListener("change", (event) => {
  loadImageFromFile(event.target.files?.[0] || null);
});

saveButton.addEventListener("click", saveCroppedImage);
previewCanvas.addEventListener("pointerdown", handlePointerDown);
previewCanvas.addEventListener("pointermove", handlePointerMove);
previewCanvas.addEventListener("pointerup", endDrag);
previewCanvas.addEventListener("pointercancel", endDrag);
previewCanvas.addEventListener("pointerleave", () => {
  if (activePointerId === null) {
    previewCanvas.style.cursor = "default";
  }
});
resizeCheckbox.addEventListener("change", () => {
  if (fileInput.files[0] && !outputNameDirty) {
    filenameInput.value = getDefaultOutputName(fileInput.files[0].name, resizeCheckbox.checked);
  }
});
filenameInput.addEventListener("input", () => {
  outputNameDirty = filenameInput.value.trim() !== "";
});
window.addEventListener("resize", setCanvasResolution);

setCanvasResolution();
