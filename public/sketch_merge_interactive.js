// sketch_merge_interactive.js
// Interactive 模式 — 僅保留手動模式邏輯，無倒數框
// oneCanvas 顯示 init_image + order 0-7 溶解效果 + order -1 直接顯示

// ===== 全域設定 =====
let movingSquaresHalfRate = false;
let isOneCanvasLeft = false; // true: oneCanvas(圖片溶解)在左, twoCanvas(高爾頓板)在右; false: 相反
let targetFrameRate = 50;
let DEBUG = false;

// ===== Interactive 佈局全域設定（可調整）=====
let interactiveMargin = 30;  // 各圖片間距與邊距（像素）

function debugLog(...args) { if (DEBUG) console.log(...args); }

// ===== 合併畫布尺寸 =====
let canvasWidth = 2160;
let canvasHeight = 1920;
let twoCanvasWidth = 1080;
let oneCanvasWidth = 1080;
let oneCanvasX = isOneCanvasLeft ? 0 : twoCanvasWidth;
let twoCanvasX = isOneCanvasLeft ? oneCanvasWidth : 0;


// ========== twoCanvas 高爾頓板動畫變數 ==========
let sampleRangeMin = -3;
let sampleRangeMax = 3;
let marginHeight = 120;
let marginWidth = twoCanvasWidth / 6;
let offsetHeight = -30;
let imgHeight = canvasHeight / 2 - marginHeight * 2;
let imgWidth = imgHeight * 2 / 3;
let histogramHeight = canvasHeight / 4 - marginHeight * 1.2;
let scale_factor = 12;
let noiseWidth = imgWidth / scale_factor;
let noiseHeight = imgHeight / scale_factor;
let thirdHeightOffset = -10;

let fixedBins = [0, 2, 8, 10, 15, 19, 25, 30, 35, 40, 45, 53, 64, 77, 87, 77, 92, 64, 46, 40, 35, 30, 27, 23, 17, 13, 10, 6, 3, 2];
let binCount = fixedBins.length;
let totalSampleCount = fixedBins.reduce((a, b) => a + b);

let samples = [];
let mappedBins = [];
let expandedBins = [];
let expandedBinActiveIndices = [];
let movingSquareFillBuckets = Array.from({ length: 256 }, () => []);
let squaresPerExpandedBin = [];
let cachedMaxExpandedHeight = 0;
let squareSize = scale_factor;
let flattenedValues = [];
let samplesByBin = [];
let sampledSquaresByBin = [];
let samplePool = [];
let samplePoolUsed = 0;

let isAnimating = true;
let firstAnimationComplete = false;
let circlesFallingComplete = false;
let colorTransitionComplete = false;
let colorTransitionStartTime = 0;
let colorTransitionDuration = 2.0;
let secondAnimationComplete = false;
let thirdAnimationStartTime = 0;
let thirdAnimationComplete = false;
let binWidth = 0;
let circleSize = 0;
let maxCircleCount;
let cachedHistogramWidth = 0;
let circleSpacing;

let pauseDuration = 0.5, pauseStartTime = 0, pauseComplete = false;
let secondGraphPauseDuration = 0.5, secondGraphPauseStartTime = 0, secondGraphPauseComplete = false;
let gaussianPauseDuration = 1, gaussianPauseStartTime = 0, gaussianPauseComplete = false;

let line1Progress = 0, line1AnimationStartTime = 0, line1AnimationDuration = 1.0, line1AnimationComplete = false;
let line2Progress = 0, line2AnimationStartTime = 0, line2AnimationDuration = 1.0, line2AnimationComplete = false;

let circleFallSpeed = 0.2, circleMinDelay = 0.02, circleMaxDelay = 0.15, circleStartHeightMultiplier = 8;
let squareFallSpeed = 1.5, squareMinDelay = 0.05, squareMaxDelay = 0.08, squareHoverTime = 0.04, squareMoveSpeed = 0.05;
let gaussianMoveSpeed = 0.05, matrixMoveSpeed = 0.05;

let cornerRadius = 150, gaussianSigmaX = 0.2, gaussianSigmaY = 0.2;
let finalMatrixAnimationComplete = false, finalMatrixValuesPrinted = false;
let shuffledViOrder = null;
let barAnimations = [], squareAnimations = [];

let finalMatrixGraphics = null, finalMatrixCached = false;
let barChartGraphics = null, barChartCached = false;
let squaresGraphics = null, squaresCached = false;
let movingSquaresGraphics = null;
let gaussianGraphics = null, gaussianCached = false;
let gaussianTargetPool = [], gaussianTargetPoolReady = false;
let hasReceivedData = false;

// ========== Interactive oneCanvas 變數 ==========
// interactivePhase 狀態機：
//   'waitingInitImage'      : 等待 generator/received_init_image
//   'collectingImages'      : 收集 order 0~7 及 -1 的圖片
//   'waitingOrder7Dissolve' : 9 張全收，等待 order:7 溶解完成 + 0.5s 延遲
//   'waitingEnterAfterAll'  : 延遲結束，顯示 order:-1 與 Please press the key
//   'sentStartDraw'         : 已送出 generator/start_draw，等待下一輪 init_image（畫面不變）
let interactivePhase = 'waitingInitImage';

let interactiveLayout = null;        // 佈局計算結果（setup 時初始化）
let interactiveInitImg = null;       // p5.Image：init_image（直接顯示）
let interactiveImages = {};          // { [order]: p5.Image }
let interactiveDissolves = {};       // { [order]: dissolveState } 溶解動畫狀態
let interactiveTotalReceived = 0;    // 已處理的圖片數（含 -1，共 9 張）
let interactiveBlockSize = 12; // 溶解方塊大小（像素）
let interactiveMoveDuration = 1.2; // 移動動畫時長（秒，可調整）
let interactiveBottomText = '';    // 兩側 Canvas 底部顯示文字
let interactiveFinalDelay = 0.5;   // order:7 溶解結束後再等待的秒數
let interactiveOrder7DoneTime = -1; // order:7 溶解完成的時間（-1 = 尚未完成）

// ========== 開機 / MQTT 狀態 ==========
let isGeneratorOn = false;
let isGaltonBoardOn = false;
let isPhysiontraceOn = false;
let client;
let noiseWaitingState = true;
let hasMainSequenceStarted = false;
let lastHandshakeTime = -999;
let currentTimeSeconds = 0;

// ===== 通用輔助函數 =====
function getSum(total, num) { return total + num; }

function clearArrayOfArrays(arr) {
  for (let i = 0; i < arr.length; i++) {
    if (Array.isArray(arr[i])) arr[i].length = 0;
  }
  arr.length = 0;
}

class Sample {
  constructor(val) { this.reset(val); }
  reset(val) {
    this.val = val;
    this.sortedIdx = undefined; this.sortedX = undefined; this.sortedY = undefined;
    this.noiseIdx = undefined; this.noiseX = undefined; this.noiseY = undefined;
    this.targetNoiseX = undefined; this.targetNoiseY = undefined;
    this.expandedBinIndex = undefined; this.expandedBinOffset = undefined;
    this.inFinalPosition = false;
    this.currentX = undefined; this.currentY = undefined;
    this.finalTargetX = undefined; this.finalTargetY = undefined;
    this.inFinalMatrixPosition = false;
  }
}

function acquireSample(val) {
  let sample = samplePool[samplePoolUsed];
  if (!sample) { sample = new Sample(val); samplePool[samplePoolUsed] = sample; }
  else sample.reset(val);
  samplePoolUsed++;
  return sample;
}

function ensureGaussianTargetPool() {
  if (gaussianTargetPoolReady && gaussianTargetPool.length === noiseWidth * noiseHeight) return;
  gaussianTargetPool.length = 0;

  let centerX = twoCanvasWidth / 2;
  let centerY = canvasHeight / 2 + canvasHeight / 4;
  let rectLeft = marginHeight;
  let rectRight = twoCanvasWidth - marginHeight;
  let rectTop = centerY - imgHeight / 2 - marginHeight / 2;
  let rectBottom = centerY + imgHeight / 2 + marginHeight / 2;
  let rectWidth = rectRight - rectLeft;
  let rectHeight = rectBottom - rectTop;

  let poolSize = noiseWidth * noiseHeight;
  for (let i = 0; i < poolSize; i++) {
    let validPosition = false, targetX, targetY, attempts = 0;
    while (!validPosition && attempts < 100) {
      attempts++;
      let u1 = random(), u2 = random();
      let z1 = sqrt(-2 * log(u1)) * cos(TWO_PI * u2);
      let z2 = sqrt(-2 * log(u1)) * sin(TWO_PI * u2);
      targetX = centerX + z1 * (rectWidth * gaussianSigmaX);
      targetY = centerY + z2 * (rectHeight * gaussianSigmaY);
      if (isPointInRoundedRect(targetX, targetY, rectLeft, rectTop, rectWidth, rectHeight, cornerRadius)) {
        validPosition = true;
      }
    }
    if (!validPosition) {
      do {
        targetX = random(rectLeft, rectRight);
        targetY = random(rectTop, rectBottom);
      } while (!isPointInRoundedRect(targetX, targetY, rectLeft, rectTop, rectWidth, rectHeight, cornerRadius));
    }
    gaussianTargetPool.push({ x: targetX, y: targetY });
  }
  gaussianTargetPoolReady = true;
}

function isPointInRoundedRect(x, y, rectX, rectY, rectWidth, rectHeight, radius) {
  if (x >= rectX + radius && x <= rectX + rectWidth - radius &&
      y >= rectY + radius && y <= rectY + rectHeight - radius) return true;
  if (x < rectX + radius && y < rectY + radius)
    return dist(x, y, rectX + radius, rectY + radius) <= radius;
  if (x > rectX + rectWidth - radius && y < rectY + radius)
    return dist(x, y, rectX + rectWidth - radius, rectY + radius) <= radius;
  if (x < rectX + radius && y > rectY + rectHeight - radius)
    return dist(x, y, rectX + radius, rectY + rectHeight - radius) <= radius;
  if (x > rectX + rectWidth - radius && y > rectY + rectHeight - radius)
    return dist(x, y, rectX + rectWidth - radius, rectY + rectHeight - radius) <= radius;
  if ((x >= rectX + radius && x <= rectX + rectWidth - radius) && (y >= rectY && y <= rectY + rectHeight)) return true;
  if ((x >= rectX && x <= rectX + rectWidth) && (y >= rectY + radius && y <= rectY + rectHeight - radius)) return true;
  return false;
}

function smoothstep(t) { return t * t * (3 - 2 * t); }

// ========== twoCanvas 高爾頓板動畫函數 ==========
function setupBarAnimation() {
  barAnimations.length = binCount;
  for (let i = 0; i < binCount; i++) {
    let anim = barAnimations[i];
    if (!anim) { anim = {}; barAnimations[i] = anim; }
    anim.progress = 0;
    anim.baseSpeed = 0.05;
    anim.currentSpeed = 0;
    anim.phase = random(0, TWO_PI);
    anim.frequency = random(2, 4);
    anim.speedPhase = random(0, TWO_PI);
    anim.speedFrequency = random(1, 2);
    if (!Array.isArray(anim.circles)) anim.circles = []; else anim.circles.length = 0;
    anim.nextCircleIndex = 0;
    anim.nextCircleDelay = random(circleMinDelay, circleMaxDelay);
    anim.lastCircleTime = 0;
  }

  let binsPerOriginalBin = (twoCanvasWidth - marginWidth * 2) / scale_factor / binCount;
  let totalExpandedBins = binCount * binsPerOriginalBin;
  squareAnimations.length = totalExpandedBins;
  for (let i = 0; i < totalExpandedBins; i++) {
    let anim = squareAnimations[i];
    if (!anim) { anim = {}; squareAnimations[i] = anim; }
    anim.progress = 0;
    anim.baseSpeed = 0.05;
    anim.currentSpeed = 0;
    anim.phase = random(0, TWO_PI);
    anim.frequency = random(2, 4);
    anim.speedPhase = random(0, TWO_PI);
    anim.speedFrequency = random(1, 2);
    if (!Array.isArray(anim.squares)) anim.squares = []; else anim.squares.length = 0;
    anim.nextSquareIndex = 0;
    anim.nextSquareDelay = random(squareMinDelay, squareMaxDelay);
    anim.lastSquareTime = 0;
    anim.settledCount = 0;
    anim.squareDone = false;
  }
}

function initializeData() {
  try {
    if (!Array.isArray(fixedBins) || fixedBins.length < 5) throw new Error('資料點數量不足');
    if (!fixedBins.every(bin => typeof bin === 'number')) throw new Error('資料點必須全為數值');
    if (fixedBins.every(bin => bin === 0)) {
      fixedBins = [0, 2, 8, 10, 15, 19, 25, 30, 35, 40, 45, 53, 64, 77, 87, 77, 92, 64, 46, 40, 35, 30, 27, 23, 17, 13, 10, 6, 3, 2];
    }

    isAnimating = true;
    firstAnimationComplete = false; circlesFallingComplete = false;
    colorTransitionComplete = false; colorTransitionStartTime = 0;
    secondAnimationComplete = false; thirdAnimationStartTime = 0; thirdAnimationComplete = false;
    pauseStartTime = 0; pauseComplete = false;
    secondGraphPauseStartTime = 0; secondGraphPauseComplete = false;
    gaussianPauseStartTime = 0; gaussianPauseComplete = false;
    line1Progress = 0; line1AnimationStartTime = 0; line1AnimationComplete = false;
    line2Progress = 0; line2AnimationStartTime = 0; line2AnimationComplete = false;
    finalMatrixAnimationComplete = false; finalMatrixValuesPrinted = false;
    finalMatrixCached = false;
    if (finalMatrixGraphics) finalMatrixGraphics.clear();
    barChartCached = false; if (barChartGraphics) barChartGraphics.clear();
    squaresCached = false; if (squaresGraphics) squaresGraphics.clear();
    if (movingSquaresGraphics) movingSquaresGraphics.clear();
    gaussianCached = false; if (gaussianGraphics) gaussianGraphics.clear();

    binCount = fixedBins.length;
    samplePoolUsed = 0; samples.length = 0; mappedBins.length = 0;
    clearArrayOfArrays(expandedBins); clearArrayOfArrays(samplesByBin);
    squaresPerExpandedBin.length = 0; flattenedValues.length = 0;
    clearArrayOfArrays(sampledSquaresByBin);

    try {
      totalSampleCount = fixedBins.reduce(getSum);
      if (totalSampleCount <= 0) throw new Error('樣本總數為零');
    } catch (e) {
      totalSampleCount = 1000;
      fixedBins = fixedBins.map(bin => bin > 0 ? bin : 1);
    }

    let binsPerOriginalBin = (twoCanvasWidth - marginWidth * 2) / scale_factor / binCount;
    for (let i = 0; i < binCount; i++) {
      let count = round(noiseWidth * noiseHeight * (fixedBins[i] / totalSampleCount));
      let binLow = map(i, 0, binCount, sampleRangeMin, sampleRangeMax);
      let binHigh = map(i + 1, 0, binCount, sampleRangeMin, sampleRangeMax);
      mappedBins.push(count);
      for (let j = 0; j < count; j++) {
        if (samples.length === noiseWidth * noiseHeight) { mappedBins[mappedBins.length - 1]--; }
        else {
          let val = map(random(binLow, binHigh), sampleRangeMin, sampleRangeMax, 0, 255);
          samples.push(acquireSample(val));
        }
      }
    }
    if (samples.length < noiseWidth * noiseHeight) {
      let deficit = noiseWidth * noiseHeight - samples.length;
      for (let i = 0; i < deficit; i++) {
        let binIndex = floor(random(0, binCount));
        mappedBins[binIndex]++;
        let binLow = map(binIndex, 0, binCount, sampleRangeMin, sampleRangeMax);
        let binHigh = map(binIndex + 1, 0, binCount, sampleRangeMin, sampleRangeMax);
        let val = map(random(binLow, binHigh), sampleRangeMin, sampleRangeMax, 0, 255);
        samples.push(acquireSample(val));
      }
    }

    shuffle(samples, true);
    for (let i = 0; i < samples.length; i++) samples[i].noiseIdx = i;
    for (let i = 0, idx = 0; i < noiseWidth; i++) {
      for (let j = 0; j < noiseHeight; j++) { samples[idx].noiseX = i; samples[idx].noiseY = j; idx++; }
    }
    samples.sort((a, b) => b.val - a.val);
    for (let i = 0; i < samples.length; i++) samples[i].sortedIdx = i;
    for (let i = 0, idx = 0; i < binCount; i++) {
      for (let j = 0; j < mappedBins[i]; j++) { samples[idx].sortedX = i; samples[idx].sortedY = j; idx++; }
    }

    for (let i = 0; i < binCount; i++) {
      let squaresInBin = mappedBins[i];
      let squaresPerNewBin = Math.floor(squaresInBin / binsPerOriginalBin);
      let remainder = squaresInBin % binsPerOriginalBin;
      for (let j = 0; j < binsPerOriginalBin; j++) {
        let newBinCount = squaresPerNewBin;
        if (i < binCount / 2) { if (j === binsPerOriginalBin - 1) newBinCount += remainder; }
        else { if (j === 0) newBinCount += remainder; }
        squaresPerExpandedBin.push(newBinCount);
      }
    }

    let sampleIndex = 0;
    for (let i = 0; i < binCount; i++) {
      let squaresInOriginalBin = mappedBins[i];
      let squaresPerNewBin = Math.floor(squaresInOriginalBin / binsPerOriginalBin);
      let remainder = squaresInOriginalBin % binsPerOriginalBin;
      let expandedBinStart = i * binsPerOriginalBin;
      for (let j = 0; j < squaresInOriginalBin; j++) {
        let targetBin;
        if (i < binCount / 2) { targetBin = Math.min(Math.floor(j / squaresPerNewBin), binsPerOriginalBin - 1); }
        else {
          if (j < squaresPerNewBin + remainder) targetBin = 0;
          else targetBin = Math.min(Math.floor((j - remainder) / squaresPerNewBin), binsPerOriginalBin - 1);
        }
        let ebIdx = expandedBinStart + targetBin;
        if (!expandedBins[ebIdx]) expandedBins[ebIdx] = [];
        samples[sampleIndex].expandedBinIndex = ebIdx;
        samples[sampleIndex].expandedBinOffset = expandedBins[ebIdx].length;
        expandedBins[ebIdx].push(samples[sampleIndex]);
        sampleIndex++;
      }
    }

    expandedBinActiveIndices.length = 0;
    for (let eb = 0; eb < expandedBins.length; eb++) {
      if (expandedBins[eb] && expandedBins[eb].length > 0) expandedBinActiveIndices.push(eb);
    }

    cachedHistogramWidth = twoCanvasWidth - marginWidth * 2;
    binWidth = cachedHistogramWidth / binCount;
    circleSize = binWidth;
    circleSpacing = circleSize;
    maxCircleCount = floor(histogramHeight / circleSpacing) + 1;
    ensureGaussianTargetPool();

    samplesByBin.length = binCount;
    for (let i = 0; i < binCount; i++) {
      if (!Array.isArray(samplesByBin[i])) samplesByBin[i] = []; else samplesByBin[i].length = 0;
    }
    for (let i = 0; i < samples.length; i++) {
      let binIdx = samples[i].sortedX;
      if (binIdx >= 0 && binIdx < binCount) samplesByBin[binIdx].push(samples[i]);
    }
    for (let i = 0; i < samples.length; i++) {
      samples[i].targetNoiseX = samples[i].noiseX;
      samples[i].targetNoiseY = samples[i].noiseY;
      samples[i].inFinalPosition = false;
    }

    let cachedMaxCount = max(mappedBins);
    sampledSquaresByBin.length = binCount;
    for (let i = 0; i < binCount; i++) {
      let totalHeight = histogramHeight * (mappedBins[i] / cachedMaxCount);
      let maxCircles = floor(totalHeight / circleSize) + 1;
      let squaresInBin = samplesByBin[i];
      let step = squaresInBin.length / maxCircles;
      let sampled = sampledSquaresByBin[i];
      if (!Array.isArray(sampled)) { sampled = []; sampledSquaresByBin[i] = sampled; } else sampled.length = 0;
      for (let j = 0; j < squaresInBin.length; j += step) {
        sampled.push(squaresInBin[round(j)]);
        if (sampled.length >= maxCircles) break;
      }
    }

    cachedMaxExpandedHeight = 0;
    for (let i = 0; i < squaresPerExpandedBin.length; i++) {
      if (squaresPerExpandedBin[i] > cachedMaxExpandedHeight) cachedMaxExpandedHeight = squaresPerExpandedBin[i];
    }

    setupBarAnimation();

    shuffledViOrder = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = shuffledViOrder[i]; shuffledViOrder[i] = shuffledViOrder[j]; shuffledViOrder[j] = tmp;
    }

    if (!squaresGraphics) squaresGraphics = createGraphics(twoCanvasWidth, canvasHeight);
    if (!gaussianGraphics) gaussianGraphics = createGraphics(twoCanvasWidth, canvasHeight);
    if (!finalMatrixGraphics) finalMatrixGraphics = createGraphics(twoCanvasWidth, canvasHeight);

    debugLog('右側動畫初始化完成，樣本總數:', totalSampleCount);
  } catch (error) {
    console.error('初始化數據時出錯:', error);
    hasReceivedData = false;
  }
}

// ========== Interactive oneCanvas 函數 ==========

// 計算並回傳佈局資訊
// 圖片排列（oneCanvas 1080×1920）：
//   Row 0: init_image        （1 欄置中，比例 946:1419）
//   Row 1: order:0  order:4  （2 欄置中，比例 946:1419）
//   Row 2: order:1  order:5
//   Row 3: order:2  order:6
//   Row 4: order:3  order:7
//   Row 5: order:-1          （1 欄置中，正方形）
// 保留底部 90px 做狀態文字顯示
function computeInteractiveLayout() {
  let availH = canvasHeight - 90; // 保留底部 90px
  let h = (availH - 7 * interactiveMargin) / 6;
  let wRatio = h * 946 / 1419;
  let wSquare = h;

  let rowYs = [];
  for (let r = 0; r < 6; r++) rowYs.push(interactiveMargin + r * (h + interactiveMargin));

  let twoColW = 2 * wRatio + interactiveMargin;
  let twoColX = (oneCanvasWidth - twoColW) / 2;
  let singleInitX = (oneCanvasWidth - wRatio) / 2;
  let singleQRX = (oneCanvasWidth - wSquare) / 2;

  return {
    h, wRatio, wSquare,
    slots: {
      'init': { x: singleInitX,                             y: rowYs[0], w: wRatio,  h: h },
      0:      { x: twoColX,                                 y: rowYs[1], w: wRatio,  h: h },
      4:      { x: twoColX + wRatio + interactiveMargin,    y: rowYs[1], w: wRatio,  h: h },
      1:      { x: twoColX,                                 y: rowYs[2], w: wRatio,  h: h },
      5:      { x: twoColX + wRatio + interactiveMargin,    y: rowYs[2], w: wRatio,  h: h },
      2:      { x: twoColX,                                 y: rowYs[3], w: wRatio,  h: h },
      6:      { x: twoColX + wRatio + interactiveMargin,    y: rowYs[3], w: wRatio,  h: h },
      3:      { x: twoColX,                                 y: rowYs[4], w: wRatio,  h: h },
      7:      { x: twoColX + wRatio + interactiveMargin,    y: rowYs[4], w: wRatio,  h: h },
      '-1':   { x: singleQRX,                               y: rowYs[5], w: wSquare, h: wSquare }
    }
  };
}

// 開始 order 0-7 的溶解動畫
// order > 0：先將 order-1 的圖片移動到 order 位置，再溶解成目標圖片
// order = 0：直接從白色溶解
function startInteractiveDissolve(order, img) {
  let slot = interactiveLayout.slots[order];
  if (!slot) return;

  let sw = Math.round(slot.w);
  let sh = Math.round(slot.h);

  // 建立目標圖片並縮放至 slot 尺寸
  let targetImg = createImage(img.width, img.height);
  targetImg.copy(img, 0, 0, img.width, img.height, 0, 0, img.width, img.height);
  targetImg.resize(sw, sh);
  targetImg.loadPixels();

  // 取得前一格狀態（order-1，用於移動動畫起點 & 溶解初始畫面）
  const prevState = (order > 0) ? interactiveDissolves[order - 1] : null;
  const prevSlot  = (order > 0) ? interactiveLayout.slots[order - 1] : null;

  // 建立混合圖片：
  //   order > 0 且前一格存在 → 從前一步圖片開始溶解（移動結束後）
  //   order = 0             → 從白色開始
  let blended = createImage(sw, sh);
  blended.loadPixels();
  if (prevState && prevState.targetImg && prevState.targetImg.pixels && prevState.targetImg.pixels.length > 0) {
    blended.pixels.set(prevState.targetImg.pixels);
  } else {
    for (let i = 0; i < blended.pixels.length; i += 4) {
      blended.pixels[i] = blended.pixels[i + 1] = blended.pixels[i + 2] = 255;
      blended.pixels[i + 3] = 255;
    }
  }
  blended.updatePixels();

  let bs = interactiveBlockSize;
  let bx = Math.ceil(sw / bs);
  let by = Math.ceil(sh / bs);
  let total = bx * by;

  let startTimes    = new Float32Array(total);
  let grayDurations = new Float32Array(total);
  let grayEndTimes  = new Float32Array(total);
  let grayValues    = new Float32Array(total);
  let blockDone     = new Uint8Array(total);
  let blockInGray   = new Uint8Array(total);

  for (let i = 0; i < total; i++) {
    let st = Math.random() * 2.8 + 0.2;
    let gd = Math.random() * 1.0 + 0.3;
    startTimes[i]    = st;
    grayDurations[i] = gd;
    grayEndTimes[i]  = st + gd;
    // 近似高斯灰度值
    let u = Math.max(Math.random(), 1e-10), v = Math.random();
    let z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    grayValues[i] = Math.max(0, Math.min(255, Math.round(128 + z * 60)));
  }

  let sortedByStart = Array.from({ length: total }, (_, i) => i).sort((a, b) => startTimes[a] - startTimes[b]);
  let sortedByEnd   = Array.from({ length: total }, (_, i) => i).sort((a, b) => grayEndTimes[a] - grayEndTimes[b]);

  interactiveDissolves[order] = {
    targetImg, blended, slot,
    blockSize: bs, blocksX: bx, blocksY: by, totalBlocks: total,
    startTimes, grayDurations, grayEndTimes, grayValues,
    blockDone, blockInGray,
    sortedByStart, sortedByEnd,
    nextGrayIdx: 0, nextFinalIdx: 0,
    remainingBlocks: total,
    globalTime: 0,
    lastFrameTime: millis() / 1000.0,
    done: false,
    // ── 移動動畫狀態 ──
    phase: prevState ? 'moving' : 'dissolving',
    moveStartTime: millis() / 1000.0,
    moveFromX: prevSlot ? prevSlot.x : slot.x,
    moveFromY: prevSlot ? prevSlot.y : slot.y,
    prevTargetImg: prevState ? prevState.targetImg : null
  };
}

function paintInteractiveBlockGray(state, bi) {
  if (state.blockInGray[bi] || state.blockDone[bi]) return false;
  let gv = state.grayValues[bi];
  let bx = (bi % state.blocksX) * state.blockSize;
  let by = Math.floor(bi / state.blocksX) * state.blockSize;
  let ex = Math.min(bx + state.blockSize, state.targetImg.width);
  let ey = Math.min(by + state.blockSize, state.targetImg.height);
  let w  = state.targetImg.width;
  state.blockInGray[bi] = 1;
  for (let y = by; y < ey; y++) {
    for (let x = bx; x < ex; x++) {
      let i = (y * w + x) * 4;
      state.blended.pixels[i] = gv;
      state.blended.pixels[i + 1] = gv;
      state.blended.pixels[i + 2] = gv;
      state.blended.pixels[i + 3] = 255;
    }
  }
  return true;
}

function paintInteractiveBlockFinal(state, bi) {
  if (state.blockDone[bi]) return false;
  let bx = (bi % state.blocksX) * state.blockSize;
  let by = Math.floor(bi / state.blocksX) * state.blockSize;
  let ex = Math.min(bx + state.blockSize, state.targetImg.width);
  let ey = Math.min(by + state.blockSize, state.targetImg.height);
  let w  = state.targetImg.width;
  for (let y = by; y < ey; y++) {
    for (let x = bx; x < ex; x++) {
      let i = (y * w + x) * 4;
      state.blended.pixels[i]     = state.targetImg.pixels[i];
      state.blended.pixels[i + 1] = state.targetImg.pixels[i + 1];
      state.blended.pixels[i + 2] = state.targetImg.pixels[i + 2];
      state.blended.pixels[i + 3] = state.targetImg.pixels[i + 3];
    }
  }
  state.blockDone[bi] = 1;
  state.remainingBlocks--;
  return true;
}

function advanceInteractiveDissolve(state) {
  let t = state.globalTime;
  let dirty = false;

  while (state.nextGrayIdx < state.totalBlocks) {
    let bi = state.sortedByStart[state.nextGrayIdx];
    if (state.startTimes[bi] > t) break;
    dirty = paintInteractiveBlockGray(state, bi) || dirty;
    state.nextGrayIdx++;
  }
  while (state.nextFinalIdx < state.totalBlocks) {
    let bi = state.sortedByEnd[state.nextFinalIdx];
    if (state.grayEndTimes[bi] > t) break;
    dirty = paintInteractiveBlockFinal(state, bi) || dirty;
    state.nextFinalIdx++;
  }
  if (dirty) state.blended.updatePixels();
  if (state.remainingBlocks <= 0) state.done = true;
  return dirty;
}

// 繪製 interactive 圖片格局（oneCanvas 局部座標）
function drawInteractiveGrid() {
  if (!interactiveLayout) return;

  let nowSec = millis() / 1000.0;
  let slots = interactiveLayout.slots;

  // ── 推進所有動畫狀態 ──
  for (let order in interactiveDissolves) {
    let state = interactiveDissolves[order];
    if (state.done) continue;

    if (state.phase === 'moving') {
      // 移動階段：計時推進，到達終點時切換為溶解
      let elapsed = nowSec - state.moveStartTime;
      if (elapsed >= interactiveMoveDuration) {
        state.phase = 'dissolving';
        state.globalTime = 0;
        state.lastFrameTime = nowSec;
      } else {
        state.lastFrameTime = nowSec; // 保持時間同步，切換溶解後 dt 不會驟增
      }
    } else {
      // 溶解階段：推進 pixel 轉場
      let dt = nowSec - state.lastFrameTime;
      state.lastFrameTime = nowSec;
      state.globalTime += dt;
      advanceInteractiveDissolve(state);
    }
  }

  // ── 等待 order:7 溶解完成 + 延遲後切換最終狀態 ──
  if (interactivePhase === 'waitingOrder7Dissolve') {
    let d7 = interactiveDissolves[7];
    if (d7 && d7.done) {
      if (interactiveOrder7DoneTime < 0) {
        interactiveOrder7DoneTime = nowSec; // 記錄完成時間點
        debugLog('[Interactive] order:7 溶解完成，開始計', interactiveFinalDelay, '秒延遲');
      } else if (nowSec - interactiveOrder7DoneTime >= interactiveFinalDelay) {
        interactivePhase = 'waitingEnterAfterAll';
        debugLog('[Interactive] 延遲結束，切換為 waitingEnterAfterAll');
      }
    }
  }

  // Row 0: init_image（直接顯示）
  let sl = slots['init'];
  if (interactiveInitImg) {
    image(interactiveInitImg, sl.x, sl.y, sl.w, sl.h);
  } else {
    fill(230); noStroke();
    rect(sl.x, sl.y, sl.w, sl.h);
  }

  // Rows 1-4: order 0~7（移動 or 溶解）
  // 移動中的圖片延後到最後繪製，確保在所有格子最上層
  let movingImg = null, movingX = 0, movingY = 0, movingW = 0, movingH = 0;

  for (let order = 0; order <= 7; order++) {
    sl = slots[order];
    let dissolve = interactiveDissolves[order];

    if (dissolve) {
      if (dissolve.phase === 'moving') {
        // 目標格子暫時顯示灰底佔位
        fill(230); noStroke();
        rect(sl.x, sl.y, sl.w, sl.h);

        // 計算移動中圖片的插值位置（最後統一繪製在最上層）
        let elapsed = nowSec - dissolve.moveStartTime;
        let t = Math.min(1.0, elapsed / interactiveMoveDuration);
        let easedT = smoothstep(t);
        let drawX = lerp(dissolve.moveFromX, sl.x, easedT);
        let drawY = lerp(dissolve.moveFromY, sl.y, easedT);
        if (dissolve.prevTargetImg) {
          movingImg = dissolve.prevTargetImg;
          movingX = drawX; movingY = drawY;
          movingW = sl.w;  movingH = sl.h;
        }
      } else {
        // 溶解階段：直接繪製 blended
        image(dissolve.blended, sl.x, sl.y, sl.w, sl.h);
      }
    } else {
      fill(230); noStroke();
      rect(sl.x, sl.y, sl.w, sl.h);
    }
  }

  // Step 標籤：order 0-3 顯示於圖片左側，order 4-7 顯示於圖片右側
  const stepLabels = {
    0: 'Step 1', 1: 'Step 2', 2: 'Step 3', 3: 'Step 4',
    4: 'Step 5', 5: 'Step 6', 6: 'Step 7', 7: 'Step 8'
  };
  fill(0); noStroke(); textSize(28);
  for (let order = 0; order <= 7; order++) {
    sl = slots[order];
    let cy = sl.y + sl.h / 2;
    if (order <= 3) { textAlign(RIGHT, CENTER); text(stepLabels[order], sl.x - 50, cy); }
    else             { textAlign(LEFT,  CENTER); text(stepLabels[order], sl.x + sl.w + 50, cy); }
  }

  // Row 5: order -1（order:7 溶解完成 + 延遲結束後才顯示）
  sl = slots['-1'];
  if (interactiveImages[-1] && interactivePhase === 'waitingEnterAfterAll') {
    image(interactiveImages[-1], sl.x, sl.y, sl.w, sl.h);
  }

  // 移動中的圖片繪製在最上層（蓋過格子、標籤等所有元素）
  if (movingImg) {
    image(movingImg, movingX, movingY, movingW, movingH);
  }
}

// 重設 interactive 狀態（新一輪開始時呼叫）
function resetInteractiveState() {
  interactiveInitImg       = null;
  interactiveImages        = {};
  interactiveDissolves     = {};
  interactiveTotalReceived = 0;
  interactiveOrder7DoneTime = -1;
  interactivePhase = 'waitingInitImage';
  debugLog('[Interactive] 狀態已重設，等待新的 init_image');
}

// 將絕對系統路徑轉為相對於 public/ 的 URL（供瀏覽器使用）
function toRelativeUrl(absPath) {
  if (!absPath) return absPath;
  const marker = '/public/';
  const idx = absPath.indexOf(marker);
  if (idx !== -1) return absPath.slice(idx + marker.length);
  return absPath; // 若已是相對路徑則直接回傳
}

// 收到 generator/received_init_image
function handleReceivedInitImage(initImagePath) {
  debugLog('[Interactive] 收到 init_image_path:', initImagePath);
  resetInteractiveState();
  const url = toRelativeUrl(initImagePath);
  loadImage(url,
    img => {
      interactiveInitImg = img;
      interactivePhase = 'collectingImages';
      debugLog('[Interactive] init_image 載入完成，直接切換為 collectingImages');
    },
    () => console.error('[Interactive] init_image 載入失敗:', url)
  );
}

// 收到 generator/completed_to_main_interactive（order 0-7 或 -1）
function handleCompletedToMainInteractive(order, imagePath) {
  debugLog('[Interactive] 收到 completed order:', order, 'path:', imagePath);
  const url = toRelativeUrl(imagePath);
  loadImage(url,
    img => {
      if (order >= 0 && order <= 7) {
        // order 0-7：溶解顯示
        interactiveImages[order] = img;
        startInteractiveDissolve(order, img);
      } else if (order === -1) {
        // order -1：直接顯示
        interactiveImages[-1] = img;
      }
      interactiveTotalReceived++;
      debugLog('[Interactive] 圖片已載入，已收到', interactiveTotalReceived, '/ 9 張');

      if (interactiveTotalReceived >= 9) {
        interactivePhase = 'waitingOrder7Dissolve';
        interactiveOrder7DoneTime = -1;
        debugLog('[Interactive] 9 張全收，等待 order:7 溶解完成後顯示最終畫面');
      }
    },
    () => console.error('[Interactive] 圖片載入失敗:', url)
  );
}

// 發送 generator/start_draw
function sendStartDrawMessage() {
  if (client && client.connected) {
    const payload = JSON.stringify({ order: 4 });
    client.publish('generator/start_draw', payload, { qos: 0, retain: false }, err => {
      if (err) console.error('[Interactive] 發送 start_draw 失敗:', err);
      else debugLog('[Interactive] 已發送 generator/start_draw order:4');
    });
  } else {
    console.warn('[Interactive] MQTT 未連接，無法發送 start_draw');
  }
}

// 繪製 interactive oneCanvas（含狀態判斷）
function drawOneInteractive() {
  // sentStartDraw 期間：保持畫面不變
  if (interactivePhase === 'sentStartDraw') return;

  push();
  translate(oneCanvasX, 0);

  // 清除 oneCanvas
  fill(255); noStroke();
  rect(0, 0, oneCanvasWidth, canvasHeight);

  if (!hasMainSequenceStarted) {
    pop();
    return;
  }

  switch (interactivePhase) {
    case 'waitingInitImage':
      fill(0);
      textAlign(CENTER, CENTER);
      textSize(36);
      text('Waiting for the input image ......', oneCanvasWidth / 2, canvasHeight / 2);
      break;

    case 'showingInitImage':
    case 'collectingImages':
    case 'waitingOrder7Dissolve':
    case 'waitingEnterAfterAll':
      drawInteractiveGrid();
      break;
  }

  pop();
}

// ========== MQTT 連接和事件處理 ==========
function connectToMQTT() {
  const clientId = 'galton_interactive_client_' + Math.random().toString(16).substr(2, 8);
  const mqttQoS = { subscribe: 2, publish: 2 };

  let hosts = ['ws://localhost:8083/mqtt'];
  const urlParams = new URLSearchParams(window.location.search);
  const mqttHost = urlParams.get('mqtt_host');
  const mqttPort = urlParams.get('mqtt_port');
  const mqttPath = urlParams.get('mqtt_path');
  if (mqttHost) {
    const port = mqttPort || '8083';
    const path = mqttPath || '/mqtt';
    hosts.unshift(`ws://${mqttHost}:${port}${path}`);
  }

  let currentHostIndex = 0;
  let host = hosts[currentHostIndex];
  let connectionAttempts = 0;
  const maxConnectionAttempts = 3;

  const options = {
    keepalive: 60, clientId, clean: true,
    reconnectPeriod: 3000, connectTimeout: 30000,
    protocolId: 'MQTT', protocolVersion: 4, rejectUnauthorized: false
  };

  debugLog('嘗試連接到 MQTT broker:', host);
  client = mqtt.connect(host, options);

  client.on('connect', function () {
    debugLog('已連接到 MQTT broker:', host);
    connectionAttempts = 0;

    const subOpts = { qos: mqttQoS.subscribe };

    client.subscribe('galton/bins', subOpts, err => {
      if (err) console.error('訂閱 galton/bins 失敗:', err);
      else debugLog('已訂閱 galton/bins');
    });
    client.subscribe('galton/handshakeReply', subOpts, err => {
      if (err) console.error('訂閱 galton/handshakeReply 失敗:', err);
      else debugLog('已訂閱 galton/handshakeReply');
    });
    client.subscribe('generator/received_init_image', subOpts, err => {
      if (err) console.error('訂閱 generator/received_init_image 失敗:', err);
      else debugLog('已訂閱 generator/received_init_image');
    });
    client.subscribe('generator/completed_to_main_interactive', subOpts, err => {
      if (err) console.error('訂閱 generator/completed_to_main_interactive 失敗:', err);
      else debugLog('已訂閱 generator/completed_to_main_interactive');
    });
    client.subscribe('physionotrace/completed', subOpts, err => {
      if (err) console.error('訂閱 physionotrace/completed 失敗:', err);
      else debugLog('已訂閱 physionotrace/completed');
    });

    window.mqttQoS = mqttQoS;
  });

  client.on('error', function (error) {
    console.error(`MQTT 連接錯誤 (${host}):`, error);
    connectionAttempts++;
    if (connectionAttempts >= maxConnectionAttempts) {
      connectionAttempts = 0;
      currentHostIndex++;
      if (currentHostIndex < hosts.length) {
        client.end(true);
        setTimeout(() => {
          host = hosts[currentHostIndex];
          client = mqtt.connect(host, options);
          setupEventHandlers(client, host);
        }, 1000);
      } else {
        console.error('所有 MQTT 連接選項都失敗');
      }
    }
  });

  setupEventHandlers(client, host);
}

function setupEventHandlers(clientInstance, currentHost) {
  clientInstance.on('reconnect', () => debugLog(`重新連接到 MQTT (${currentHost})...`));
  clientInstance.on('close', () => debugLog(`MQTT 連接已關閉 (${currentHost})`));
  clientInstance.on('offline', () => debugLog(`MQTT 客戶端離線 (${currentHost})`));

  clientInstance.on('message', function (topic, message) {

    // ── Handshake reply ──
    if (topic === 'galton/handshakeReply') {
      try {
        const data = JSON.parse(message.toString());
        if (data.device === 'generator')     isGeneratorOn     = true;
        if (data.device === 'galtonBoard')   isGaltonBoardOn   = true;
        if (data.device === 'physionotrace') isPhysiontraceOn  = true;

        if (isGeneratorOn && isGaltonBoardOn && isPhysiontraceOn && !hasMainSequenceStarted) {
          clientInstance.publish('main/handshakeAll', JSON.stringify({ status: true }));
          hasMainSequenceStarted = true;
          noiseWaitingState = true;
          interactivePhase = 'waitingInitImage';
          debugLog('所有裝置已連線，主序列自動開始');
        }
      } catch (e) { console.error('解析 handshakeReply 失敗:', e); }

    // ── Galton bins（驅動 twoCanvas 動畫）──
    } else if (topic === 'galton/bins') {
      try {
        const data = JSON.parse(message.toString());
        let newFixedBins;
        if (Array.isArray(data)) newFixedBins = data;
        else if (data.fixedBins && Array.isArray(data.fixedBins)) newFixedBins = data.fixedBins;
        else newFixedBins = Object.values(data);
        if (!newFixedBins.every(item => typeof item === 'number')) throw new Error('非數值元素');
        fixedBins = newFixedBins;
        initializeData();
        hasReceivedData = true;
        noiseWaitingState = false;
        debugLog('收到 galton/bins，twoCanvas 動畫啟動');
      } catch (e) { console.error('解析 galton/bins 失敗:', e); }

    // ── 收到 init_image 路徑 ──
    } else if (topic === 'generator/received_init_image') {
      try {
        const data = JSON.parse(message.toString());
        if (data.init_image_path) {
          clientInstance.publish('galton/start', JSON.stringify({ status: 'start' }), { qos: 0, retain: false }, err => {
            if (err) console.error('發送 galton/start 失敗:', err);
            else debugLog('已發送 galton/start');
          });
          noiseWaitingState = true;
          interactiveBottomText = '';
          handleReceivedInitImage(data.init_image_path);
        }
      } catch (e) { console.error('解析 received_init_image 失敗:', e); }

    // ── 收到各 order 圖片 ──
    } else if (topic === 'generator/completed_to_main_interactive') {
      try {
        const data = JSON.parse(message.toString());
        const order = data.order;
        const imgPath = data.image_path;
        if (imgPath === undefined || imgPath === null || order === undefined) return;

        if (interactivePhase === 'collectingImages') {
          handleCompletedToMainInteractive(order, imgPath);
        }
      } catch (e) { console.error('解析 completed_to_main_interactive 失敗:', e); }

    // ── physionotrace 完成 ──
    } else if (topic === 'physionotrace/completed') {
      try {
        const data = JSON.parse(message.toString());
        if (data.status === 'completed') {
          interactiveBottomText = 'Waiting for the next image ......';
          debugLog('[Interactive] physionotrace 完成，顯示 Waiting for next image');
        }
      } catch (e) { console.error('解析 physionotrace/completed 失敗:', e); }
    }
  });
}

function sendHandshakeMessage() {
  if (client && client.connected) {
    client.publish('galton/handshake', JSON.stringify({
      timestamp: new Date().toISOString(),
      status: 'handshake'
    }), { qos: 0, retain: false }, err => {
      if (err) console.error('發送 handshake 失敗:', err);
    });
  }
}

// ========== twoCanvas 批次渲染函數 ==========
function drawChart2MovingSquaresNativeBatched(ctx) {
  if (!ctx) ctx = drawingContext;
  const sz = squareSize;
  const buckets = movingSquareFillBuckets;
  for (let b = 0; b < 256; b++) buckets[b].length = 0;
  for (let k = 0; k < expandedBinActiveIndices.length; k++) {
    const i = expandedBinActiveIndices[k];
    const anim = squareAnimations[i];
    if (anim.squareDone) continue;
    const x = marginWidth + i * sz;
    const arr = anim.squares;
    const startJ = anim.settledCount || 0;
    for (let j = startJ; j < arr.length; j++) {
      const sq = arr[j];
      if (sq.settled) continue;
      const vi = Math.max(0, Math.min(255, Math.floor(sq.val)));
      buckets[vi].push(x, sq.y + offsetHeight);
    }
  }
  ctx.save(); ctx.imageSmoothingEnabled = false;
  for (let vi = 0; vi < 256; vi++) {
    const pts = buckets[vi];
    if (pts.length === 0) continue;
    ctx.fillStyle = `rgb(${vi},${vi},${vi})`;
    for (let p = 0; p < pts.length; p += 2) ctx.fillRect(pts[p], pts[p + 1], sz, sz);
  }
  ctx.restore();
}

function drawSamplesNativeBatched() {
  const ctx = drawingContext;
  const sz = squareSize;
  const buckets = movingSquareFillBuckets;
  for (let b = 0; b < 256; b++) buckets[b].length = 0;
  for (let i = 0; i < samples.length; i++) {
    const vi = Math.max(0, Math.min(255, Math.floor(samples[i].val)));
    buckets[vi].push(samples[i].currentX, samples[i].currentY + offsetHeight);
  }
  ctx.save(); ctx.imageSmoothingEnabled = false;
  const viSeq = shuffledViOrder;
  for (let k = 0; k < 256; k++) {
    const vi = viSeq[k];
    const pts = buckets[vi];
    if (pts.length === 0) continue;
    ctx.fillStyle = `rgb(${vi},${vi},${vi})`;
    for (let p = 0; p < pts.length; p += 2) ctx.fillRect(pts[p], pts[p + 1], sz, sz);
  }
  ctx.restore();
}

// ========== twoCanvas 主繪製函數 ==========
function drawTwoAnimation() {
  push();
  translate(twoCanvasX, 0);

  if (!hasReceivedData) { pop(); return; }

  let allCirclesInPlace = true, allCirclesGenerated = true;

  if (line1AnimationStartTime === 0) line1AnimationStartTime = currentTimeSeconds;
  if (!line1AnimationComplete) {
    let elapsed = currentTimeSeconds - line1AnimationStartTime;
    line1Progress = Math.min(1, elapsed / line1AnimationDuration);
    if (line1Progress >= 1) line1AnimationComplete = true;
  }

  if (line1AnimationComplete) {
    if (colorTransitionComplete && barChartCached) {
      image(barChartGraphics, 0, 0);
    } else {
      for (let i = 0; i < binCount; i++) {
        if (mappedBins[i] !== 0) {
          let anim = barAnimations[i];
          if (isAnimating) {
            let speedMultiplier = sin(currentTimeSeconds * anim.speedFrequency + anim.speedPhase) * 0.5 + 0.5;
            anim.currentSpeed = anim.baseSpeed * speedMultiplier;
            anim.progress += anim.currentSpeed;
            let sampledSquares = sampledSquaresByBin[i];
            let targetCount = sampledSquares.length;
            if (anim.nextCircleIndex < targetCount) {
              if (currentTimeSeconds - anim.lastCircleTime >= anim.nextCircleDelay) {
                let targetY = canvasHeight / 4 - (anim.circles.length * circleSpacing);
                anim.circles.push({ y: targetY - circleSize * circleStartHeightMultiplier, targetY, val: sampledSquares[anim.nextCircleIndex].val });
                anim.nextCircleIndex++;
                anim.nextCircleDelay = random(circleMinDelay, circleMaxDelay);
                anim.lastCircleTime = currentTimeSeconds;
              }
            }
            if (!circlesFallingComplete) {
              for (let j = 0; j < anim.circles.length; j++) {
                let cir = anim.circles[j];
                if (Math.abs(cir.y - cir.targetY) < 0.5) cir.y = cir.targetY;
                else cir.y = lerp(cir.y, cir.targetY, circleFallSpeed);
              }
              for (let j = 0; j < anim.circles.length; j++) {
                if (Math.abs(anim.circles[j].y - anim.circles[j].targetY) > 0.1) allCirclesInPlace = false;
              }
              if (anim.nextCircleIndex < targetCount) { allCirclesInPlace = false; allCirclesGenerated = false; }
            }
          }

          let x = marginWidth + i * binWidth + binWidth / 2;
          strokeWeight(1);
          if (colorTransitionComplete) {
            for (let j = 0; j < anim.circles.length; j++) {
              let cir = anim.circles[j];
              fill(cir.val); stroke(cir.val);
              circle(x, cir.y + offsetHeight, circleSize);
            }
          } else if (circlesFallingComplete) {
            let elapsed = currentTimeSeconds - colorTransitionStartTime;
            let progress = elapsed / colorTransitionDuration;
            let binWeight = i / (binCount - 1);
            for (let j = 0; j < anim.circles.length; j++) {
              let cir = anim.circles[j];
              let circleColor = 175;
              let circlePositionInBin = j / Math.max(1, anim.circles.length - 1);
              let startThreshold = binWeight * 0.9 + circlePositionInBin * 0.1;
              if (progress > startThreshold) {
                let normalizedProgress = (progress - startThreshold) / (1 - startThreshold);
                let easedProgress = 1 - Math.pow(1 - Math.min(1, normalizedProgress * 1.5), 3);
                circleColor = lerp(175, cir.val, easedProgress);
              }
              fill(circleColor); stroke(circleColor);
              circle(x, cir.y + offsetHeight, circleSize);
            }
          } else {
            fill(175); stroke(175);
            for (let j = 0; j < anim.circles.length; j++) {
              circle(x, anim.circles[j].y + offsetHeight, circleSize);
            }
          }
        } else {
          barAnimations[i].progress = 2;
        }
      }

      if (colorTransitionComplete && !barChartCached) {
        if (!barChartGraphics) barChartGraphics = createGraphics(twoCanvasWidth, canvasHeight);
        barChartGraphics.clear();
        for (let i = 0; i < binCount; i++) {
          if (mappedBins[i] !== 0) {
            let anim = barAnimations[i];
            let x = marginWidth + i * binWidth + binWidth / 2;
            barChartGraphics.strokeWeight(1);
            for (let j = 0; j < anim.circles.length; j++) {
              let cir = anim.circles[j];
              barChartGraphics.fill(cir.val); barChartGraphics.stroke(cir.val);
              barChartGraphics.circle(x, cir.y + offsetHeight, circleSize);
            }
          }
        }
        barChartCached = true;
      }
    }
  }

  fill(175); stroke(0); strokeWeight(1);

  if (!line1AnimationComplete) {
    line1Progress = Math.min(1, (currentTimeSeconds - line1AnimationStartTime) / line1AnimationDuration);
    let ep = 1 - Math.pow(1 - line1Progress, 3);
    let lineEndX = marginWidth + (twoCanvasWidth - marginWidth * 2) * ep;
    line(marginWidth, canvasHeight / 4 + circleSize / 2 + offsetHeight, lineEndX, canvasHeight / 4 + circleSize / 2 + offsetHeight);
    if (line1Progress >= 1) line1AnimationComplete = true;
  } else {
    line(marginWidth, canvasHeight / 4 + circleSize / 2 + offsetHeight, twoCanvasWidth - marginWidth, canvasHeight / 4 + circleSize / 2 + offsetHeight);
  }

  if (!circlesFallingComplete && allCirclesInPlace && allCirclesGenerated) {
    let reallyAllInPlace = true;
    for (let i = 0; i < binCount; i++) {
      if (mappedBins[i] !== 0) {
        let anim = barAnimations[i];
        let targetCount = sampledSquaresByBin[i].length;
        if (anim.circles.length < targetCount || anim.nextCircleIndex < targetCount) { reallyAllInPlace = false; break; }
        for (let j = 0; j < anim.circles.length; j++) {
          if (Math.abs(anim.circles[j].y - anim.circles[j].targetY) > 0.05) { reallyAllInPlace = false; break; }
        }
        if (!reallyAllInPlace) break;
      }
    }
    if (reallyAllInPlace) { circlesFallingComplete = true; colorTransitionStartTime = currentTimeSeconds; }
  }

  if (circlesFallingComplete && !colorTransitionComplete) {
    if (currentTimeSeconds - colorTransitionStartTime >= colorTransitionDuration) {
      colorTransitionComplete = true; firstAnimationComplete = true; pauseStartTime = currentTimeSeconds;
    }
  }
  if (colorTransitionComplete && !pauseComplete) {
    if (currentTimeSeconds - pauseStartTime >= pauseDuration) pauseComplete = true;
  }

  if (pauseComplete) {
    if (!line2AnimationComplete) {
      if (line2AnimationStartTime === 0) line2AnimationStartTime = currentTimeSeconds;
      let elapsed = currentTimeSeconds - line2AnimationStartTime;
      line2Progress = Math.min(1, elapsed / line2AnimationDuration);
      if (line2Progress >= 1) line2AnimationComplete = true;
    }

    if (line2AnimationComplete) {
      let expandedBinWidth = squareSize;
      if (!secondAnimationComplete) {
        if (!squaresGraphics) squaresGraphics = createGraphics(twoCanvasWidth, canvasHeight);
        squaresGraphics.noStroke();
        let squareSpacing = maxCircleCount * circleSize / (cachedMaxExpandedHeight - 1);
        let allSquaresInPlace = true;

        for (let k = 0; k < expandedBinActiveIndices.length; k++) {
          let i = expandedBinActiveIndices[k];
          let anim = squareAnimations[i];
          let x = marginWidth + i * expandedBinWidth;
          if (anim.squareDone) continue;

          if (isAnimating) {
            let targetLength = expandedBins[i].length;
            if (anim.squares.length < targetLength) {
              if (currentTimeSeconds - anim.lastSquareTime >= anim.nextSquareDelay) {
                let squareIndex = anim.squares.length;
                let targetY = canvasHeight / 2 - squareSize - (squareIndex * squareSpacing);
                anim.squares.push({ y: canvasHeight / 4 + circleSize / 2, targetY, val: expandedBins[i][squareIndex].val, startTime: currentTimeSeconds, settled: false });
                anim.nextSquareDelay = random(squareMinDelay, squareMaxDelay);
                anim.lastSquareTime = currentTimeSeconds;
              }
            }
            while (anim.settledCount < anim.squares.length && anim.squares[anim.settledCount].settled) anim.settledCount++;
            for (let j = anim.settledCount; j < anim.squares.length; j++) {
              let sq = anim.squares[j];
              if (currentTimeSeconds - sq.startTime < squareHoverTime) break;
              if (!sq.settled) {
                let direction = sq.targetY < sq.y ? -1 : 1;
                sq.y += direction * squareFallSpeed * 0.6 * deltaTime;
                if (direction === -1 && sq.y <= sq.targetY) sq.y = sq.targetY;
                else if (direction === 1 && sq.y >= sq.targetY) sq.y = sq.targetY;
              }
              if (!sq.settled && Math.abs(sq.y - sq.targetY) <= 0.1) {
                sq.y = sq.targetY; sq.settled = true;
                let gv = Math.max(0, Math.min(255, Math.floor(sq.val)));
                let gctx = squaresGraphics.drawingContext;
                gctx.fillStyle = `rgb(${gv},${gv},${gv})`;
                gctx.fillRect(x, sq.y + offsetHeight, squareSize, squareSize);
              }
              if (!sq.settled && Math.abs(sq.y - sq.targetY) > 0.1) allSquaresInPlace = false;
            }
            if (anim.squares.length < targetLength) allSquaresInPlace = false;
            else if (anim.settledCount >= anim.squares.length) anim.squareDone = true;
          }
        }
        image(squaresGraphics, 0, 0);
        if (!movingSquaresGraphics) movingSquaresGraphics = createGraphics(twoCanvasWidth, canvasHeight);
        if (!movingSquaresHalfRate || frameCount % 2 === 0) {
          movingSquaresGraphics.clear();
          drawChart2MovingSquaresNativeBatched(movingSquaresGraphics.drawingContext);
        }
        image(movingSquaresGraphics, 0, 0);
        if (allSquaresInPlace) { secondAnimationComplete = true; secondGraphPauseStartTime = currentTimeSeconds; squaresCached = true; }
      } else {
        if (!squaresCached) {
          if (!squaresGraphics) squaresGraphics = createGraphics(twoCanvasWidth, canvasHeight);
          squaresGraphics.clear(); squaresGraphics.noStroke();
          for (let k = 0; k < expandedBinActiveIndices.length; k++) {
            let i = expandedBinActiveIndices[k];
            let anim = squareAnimations[i];
            let x = marginWidth + i * expandedBinWidth;
            for (let j = 0; j < anim.squares.length; j++) {
              let sq = anim.squares[j];
              squaresGraphics.fill(sq.val);
              squaresGraphics.square(x, sq.y + offsetHeight, squareSize);
            }
          }
          squaresCached = true;
        }
        image(squaresGraphics, 0, 0);
      }
    }

    strokeWeight(1); stroke(0);
    if (!line2AnimationComplete) {
      let ep = 1 - Math.pow(1 - line2Progress, 3);
      let lineEndX = marginWidth + (twoCanvasWidth - marginWidth * 2) * ep;
      line(marginWidth, canvasHeight / 2 + offsetHeight, lineEndX, canvasHeight / 2 + offsetHeight);
    } else {
      line(marginWidth, canvasHeight / 2 + offsetHeight, twoCanvasWidth - marginWidth, canvasHeight / 2 + offsetHeight);
    }
  }

  if (secondAnimationComplete && !secondGraphPauseComplete) {
    let expandedBinWidth = squareSize;
    strokeWeight(1); stroke(0);
    line(marginWidth, canvasHeight / 2 + offsetHeight, twoCanvasWidth - marginWidth, canvasHeight / 2 + offsetHeight);
    if (currentTimeSeconds - secondGraphPauseStartTime >= secondGraphPauseDuration) {
      secondGraphPauseComplete = true;
      thirdAnimationStartTime = currentTimeSeconds;
      let targetPoolOffset = floor(random(gaussianTargetPool.length));
      for (let i = 0; i < samples.length; i++) {
        samples[i].currentX = marginWidth + i % noiseWidth * squareSize;
        samples[i].currentY = canvasHeight / 2 - marginHeight - squareSize;
        let ebI = samples[i].expandedBinIndex;
        let ebO = samples[i].expandedBinOffset;
        if (ebI !== undefined && squareAnimations[ebI] && squareAnimations[ebI].squares && ebO < squareAnimations[ebI].squares.length) {
          let sq = squareAnimations[ebI].squares[ebO];
          samples[i].currentX = marginWidth + ebI * expandedBinWidth;
          samples[i].currentY = sq.y;
        }
        let pooledTarget = gaussianTargetPool[(targetPoolOffset + i) % gaussianTargetPool.length];
        samples[i].inFinalPosition = false;
        samples[i].targetX = pooledTarget.x;
        samples[i].targetY = pooledTarget.y;
      }
    }
  }

  if (secondGraphPauseComplete) {
    if (!gaussianPauseComplete) {
      if (!thirdAnimationComplete) {
        let allInFinalPosition = true;
        for (let i = 0; i < samples.length; i++) {
          if (!samples[i].inFinalPosition) {
            samples[i].currentX = lerp(samples[i].currentX, samples[i].targetX, gaussianMoveSpeed);
            samples[i].currentY = lerp(samples[i].currentY, samples[i].targetY, gaussianMoveSpeed);
            if (Math.abs(samples[i].currentX - samples[i].targetX) < 2 && Math.abs(samples[i].currentY - samples[i].targetY) < 2) {
              samples[i].inFinalPosition = true;
              samples[i].currentX = samples[i].targetX;
              samples[i].currentY = samples[i].targetY;
            } else allInFinalPosition = false;
          }
        }
        drawSamplesNativeBatched();
        if (allInFinalPosition) { thirdAnimationComplete = true; gaussianPauseStartTime = currentTimeSeconds; }
      } else {
        if (!gaussianCached) {
          if (!gaussianGraphics) gaussianGraphics = createGraphics(twoCanvasWidth, canvasHeight);
          gaussianGraphics.clear();
          const gCtx = gaussianGraphics.drawingContext;
          const gbuckets = Array.from({ length: 256 }, () => []);
          const gsz = squareSize;
          for (let i = 0; i < samples.length; i++) {
            const vi = Math.max(0, Math.min(255, Math.floor(samples[i].val)));
            gbuckets[vi].push(samples[i].currentX, samples[i].currentY + offsetHeight);
          }
          gCtx.save(); gCtx.imageSmoothingEnabled = false;
          for (let k = 0; k < 256; k++) {
            const vi = shuffledViOrder[k];
            const pts = gbuckets[vi];
            if (pts.length === 0) continue;
            gCtx.fillStyle = `rgb(${vi},${vi},${vi})`;
            for (let p = 0; p < pts.length; p += 2) gCtx.fillRect(pts[p], pts[p + 1], gsz, gsz);
          }
          gCtx.restore();
          gaussianCached = true;
        }
        image(gaussianGraphics, 0, 0);
        if (currentTimeSeconds - gaussianPauseStartTime >= gaussianPauseDuration) {
          gaussianPauseComplete = true; gaussianCached = false;
          if (gaussianGraphics) gaussianGraphics.clear();
          for (let i = 0; i < samples.length; i++) {
            samples[i].finalTargetX = twoCanvasWidth / 2 - imgWidth / 2 + (samples[i].noiseX * squareSize);
            samples[i].finalTargetY = canvasHeight / 2 + (canvasHeight / 2 - (noiseHeight * squareSize)) / 2 + thirdHeightOffset + (samples[i].noiseY * squareSize);
            samples[i].inFinalMatrixPosition = false;
          }
        }
      }
    } else if (!finalMatrixAnimationComplete) {
      let allInMatrixPosition = true;
      for (let i = 0; i < samples.length; i++) {
        if (!samples[i].inFinalMatrixPosition) {
          samples[i].currentX = lerp(samples[i].currentX, samples[i].finalTargetX, matrixMoveSpeed);
          samples[i].currentY = lerp(samples[i].currentY, samples[i].finalTargetY, matrixMoveSpeed);
          if (Math.abs(samples[i].currentX - samples[i].finalTargetX) < 1 && Math.abs(samples[i].currentY - samples[i].finalTargetY) < 1) {
            samples[i].inFinalMatrixPosition = true;
            samples[i].currentX = samples[i].finalTargetX;
            samples[i].currentY = samples[i].finalTargetY;
          } else allInMatrixPosition = false;
        }
      }
      drawSamplesNativeBatched();
      if (allInMatrixPosition) finalMatrixAnimationComplete = true;
    } else {
      if (!finalMatrixCached) {
        if (!finalMatrixGraphics) finalMatrixGraphics = createGraphics(twoCanvasWidth, canvasHeight);
        finalMatrixGraphics.clear();
        const fCtx = finalMatrixGraphics.drawingContext;
        const fbuckets = Array.from({ length: 256 }, () => []);
        const fsz = squareSize;
        for (let i = 0; i < samples.length; i++) {
          const vi = Math.max(0, Math.min(255, Math.floor(samples[i].val)));
          fbuckets[vi].push(samples[i].currentX, samples[i].currentY + offsetHeight);
        }
        fCtx.save(); fCtx.imageSmoothingEnabled = false;
        for (let k = 0; k < 256; k++) {
          const vi = shuffledViOrder[k];
          const pts = fbuckets[vi];
          if (pts.length === 0) continue;
          fCtx.fillStyle = `rgb(${vi},${vi},${vi})`;
          for (let p = 0; p < pts.length; p += 2) fCtx.fillRect(pts[p], pts[p + 1], fsz, fsz);
        }
        fCtx.restore();
        finalMatrixCached = true;
      }
      image(finalMatrixGraphics, 0, 0);

      if (!finalMatrixValuesPrinted) {
        let matrixValues = Array(noiseHeight).fill().map(() => Array(noiseWidth).fill(0));
        for (let i = 0; i < samples.length; i++) {
          if (samples[i].noiseX >= 0 && samples[i].noiseX < noiseWidth && samples[i].noiseY >= 0 && samples[i].noiseY < noiseHeight) {
            matrixValues[samples[i].noiseY][samples[i].noiseX] = samples[i].val;
          }
        }
        for (let y = 0; y < noiseHeight; y++) for (let x = 0; x < noiseWidth; x++) flattenedValues.push(matrixValues[y][x]);
        finalMatrixValuesPrinted = true;
      }
    }
  }

  pop();
}

// ========== p5.js 生命週期函數 ==========
function setup() {
  const urlParams = new URLSearchParams(window.location.search);
  const fpsParam = Number(urlParams.get('fps'));
  if (Number.isFinite(fpsParam) && fpsParam > 0) targetFrameRate = fpsParam;

  const halfRateParam = urlParams.get('halfrate');
  if (halfRateParam !== null) movingSquaresHalfRate = halfRateParam === '1';

  const _origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (type === '2d') attrs = Object.assign({}, attrs, { willReadFrequently: true });
    return _origGetContext.call(this, type, attrs);
  };

  createCanvas(canvasWidth, canvasHeight);
  HTMLCanvasElement.prototype.getContext = _origGetContext;

  pixelDensity(1);
  frameRate(targetFrameRate);
  noSmooth();

  let canvas = document.querySelector('canvas');
  if (canvas) canvas.style.border = 'none';

  // 計算 interactive 佈局
  interactiveLayout = computeInteractiveLayout();

  connectToMQTT();
  background(255);
}

function draw() {
  currentTimeSeconds = millis() / 1000.0;

  // 每幀清除 twoCanvas 面板與底部文字區
  fill(255); noStroke();
  rect(twoCanvasX, 0, twoCanvasWidth, canvasHeight);
  rect(0, canvasHeight - 90, canvasWidth, 90);

  // 初始狀態（尚未收到所有裝置 handshake）
  if (!isGeneratorOn || !isGaltonBoardOn || !isPhysiontraceOn) {
    fill(255); noStroke();
    rect(oneCanvasX, 0, oneCanvasWidth, canvasHeight);
    fill(0);
    textAlign(CENTER, CENTER); textSize(36);
    text('等待裝置開機完成', oneCanvasX + oneCanvasWidth / 2, canvasHeight / 2);
    text('等待裝置開機完成', twoCanvasX + twoCanvasWidth / 2, canvasHeight / 2);
    if (currentTimeSeconds - lastHandshakeTime >= 0.5) {
      lastHandshakeTime = currentTimeSeconds;
      sendHandshakeMessage();
    }
    return;
  }

  // ── Interactive oneCanvas ──
  drawOneInteractive();

  // ── twoCanvas 高爾頓板 ──
  if (noiseWaitingState) {
    fill(0); textAlign(CENTER, CENTER); textSize(36);
    text('Waiting for the noise ......', twoCanvasX + twoCanvasWidth / 2, canvasHeight / 2);
  } else {
    drawTwoAnimation();
  }

  // 底部文字（兩側皆顯示）
  const _bottomText = interactivePhase === 'waitingEnterAfterAll'
    ? 'Please press the key'
    : interactiveBottomText;
  if (_bottomText) {
    fill(0); textAlign(CENTER, CENTER); textSize(36);
    text(_bottomText, oneCanvasX + oneCanvasWidth / 2, canvasHeight - 45);
    text(_bottomText, twoCanvasX + twoCanvasWidth / 2, canvasHeight - 45);
  }
}

function keyPressed() {
  // ── 9 張全收後 Enter → 發送 start_draw ──
  if (interactivePhase === 'waitingEnterAfterAll' && (key === 'Enter' || keyCode === ENTER)) {
    sendStartDrawMessage();
    interactivePhase = 'sentStartDraw';
    interactiveBottomText = 'Drawing ......';
    debugLog('[Interactive] Enter 按下，已送出 start_draw，切換為 sentStartDraw');
  }
}
