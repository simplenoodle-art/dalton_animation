// 手動模式：倒數結束後等待 Enter 鍵才進入下一步（URL 參數 ?manual=1 啟用）
let manualMode = true;
// 圖2移動方塊每 2 幀渲染一次（可改善卡頓，但動畫較不流暢；URL 參數 ?halfrate=1 啟用）
let movingSquaresHalfRate = false;
let isOneCanvasLeft = false;  // true: oneCanvas(圖片溶解)在左, twoCanvas(高爾頓板)在右; false: 相反
let targetFrameRate = 50; // 可設定的禎率（亦可用 URL 參數 ?fps=30 覆蓋）
////////////////////////////////////////////////////////////
let countdownDuration = 3000; // 倒數計時長度（秒），可設定參數
let DEBUG = false;
// 預分配格子模式：true 時 oneCanvas 改為預先排好 8 個 Step 格子，
// 每次收到 generator/completed_to_main 就以溶解方式填入對應格子，
// 無需在每個新 Step 開始時重設 oneCanvas。
let preAllocatedMode = true;

function debugLog(...args) { if (DEBUG) console.log(...args); }

// ========== 預分配格子模式 (preAllocated Mode) 狀態變數 ==========
let preAllocBorderMargin = 100;   // Row 0 與畫布上下邊框的距離（px）
let preAllocGap = 20;            // 列與列、欄與欄之間的間距（px）
let preAllocLayout = null;      // 佈局計算結果（setup 時初始化）
let preAllocDissolves = {};     // { [slotIdx 0-7]: dissolveState } 溶解動畫狀態
let preAllocBlockSize = 12;     // 溶解方塊大小（px）
let preAllocGridInitialized = false; // 佔位格與標籤是否已畫到主畫布
let preAllocMoveDuration = 1.2; // 移動動畫時長（秒，可調整）
let preAllocMainGraphics = null; // 離屏背景層：灰底 + 已提交格子，移動動畫時用來清底

// 合併畫布設置
let canvasWidth = 2160;  // 合併後的寬度
let canvasHeight = 1920;
let twoCanvasWidth = 1080;   // twoCanvas（高爾頓板）動畫區域寬度
let oneCanvasWidth = 1080;  // oneCanvas（圖片溶解）動畫區域寬度
let oneCanvasX = isOneCanvasLeft ? 0 : twoCanvasWidth;
let twoCanvasX = isOneCanvasLeft ? oneCanvasWidth : 0;

// 倒數計時相關變數
let countdownStartTime = 0;
let isCountdownActive = false;

// 手動模式相關參數
let waitingForKeypress = false;
let waitingForHandshakeKeypress = false; // 所有 handshake 完成後等待 Enter 才開始（manualMode）
let countdownSquares = [];
let totalCountdownSquares = 0;
// 添加閃爍相關變數
let blinkTimes = 5; // 每個方塊在固定前的閃爍次數
let currentBlinkingIndex = 0; // 當前閃爍的方
let lastFixedSquareCount = 0; // 追蹤上次已固定的方塊數
let countdownFixedGraphics = null;
let countdownFixedRenderedCount = 0;

// ========== twoCanvas 高爾頓板動畫變數 ==========
let sampleRangeMin = -3;
let sampleRangeMax = 3;
let marginHeight = 120;
let marginWidth = twoCanvasWidth / 6;
let offsetHeight = -30;
let imgHeight = canvasHeight/2 - marginHeight*2;
let imgWidth = imgHeight*2/3;
let histogramHeight = canvasHeight/4 - marginHeight*1.2;
let scale_factor = 12;
let noiseWidth = imgWidth / scale_factor;
let noiseHeight = imgHeight / scale_factor;
let thirdHeightOffset = -10;

let originalSampleCount = 1000;
let fixedBins = [0, 2, 8, 10, 15, 19, 25, 30, 35, 40, 45, 53, 64, 77, 87, 77, 92, 64, 46, 40, 35, 30, 27, 23, 17, 13, 10, 6, 3, 2];
let binCount = fixedBins.length;
let totalSampleCount = fixedBins.reduce(getSum);

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

// twoCanvas 動畫相關變數
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

// twoCanvas 停頓相關參數
let pauseDuration = 0.5;
let pauseStartTime = 0;
let pauseComplete = false;
let secondGraphPauseDuration = 0.5;
let secondGraphPauseStartTime = 0;
let secondGraphPauseComplete = false;
let gaussianPauseDuration = 1;
let gaussianPauseStartTime = 0;
let gaussianPauseComplete = false;

// twoCanvas 橫線動畫相關變數
let line1Progress = 0;
let line1AnimationStartTime = 0;
let line1AnimationDuration = 1.0;
let line1AnimationComplete = false;

let line2Progress = 0;
let line2AnimationStartTime = 0;
let line2AnimationDuration = 1.0;
let line2AnimationComplete = false;

// twoCanvas 圓形的獨立參數
let circleFallSpeed = 0.2;
let circleMinDelay = 0.02;
let circleMaxDelay = 0.15;
let circleStartHeightMultiplier = 8;

// twoCanvas 方形的獨立參數
let squareFallSpeed = 1.5;
let squareMinDelay = 0.05;
let squareMaxDelay = 0.08;
let squareHoverTime = 0.04;
let squareMoveSpeed = 0.05;

// twoCanvas 圖3的移動速度參數
let gaussianMoveSpeed = 0.05;
let matrixMoveSpeed = 0.05;

// twoCanvas 圖3的圓角矩形參數
let cornerRadius = 150;
let gaussianSigmaX = 0.2;
let gaussianSigmaY = 0.2;
let finalMatrixAnimationComplete = false;
let finalMatrixValuesPrinted = false;

// 圖3方格隨機繪圖順序（0~255 灰階桶的繪製順序，每輪重新洗牌）
let shuffledViOrder = null;

// twoCanvas 動畫參數
let barAnimations = [];
let squareAnimations = [];

// 用 millis() 替代 frameCount/60，避免長時間執行後浮點精度問題
let currentTimeSeconds = 0;

// 靜態畫面緩存，避免最終狀態每幀重繪
let finalMatrixGraphics = null;
let finalMatrixCached = false;

// 圖1 顏色轉場完成後的靜態快取
let barChartGraphics = null;
let barChartCached = false;

// 圖2方塊完成後的靜態快取
let squaresGraphics = null;
let squaresCached = false;

// 圖2移動中方塊的渲染快取（每 2 幀更新一次，避免每幀大量 fillRect）
let movingSquaresGraphics = null;

// 圖3 Gaussian 停頓期靜態快取
let gaussianGraphics = null;
let gaussianCached = false;
let gaussianTargetPool = [];
let gaussianTargetPoolReady = false;

// twoCanvas 全局變數
let hasReceivedData = false;

// ========== oneCanvas 圖片溶解動畫變數 ==========
let oneImgPrev, oneImgNow, oneImgNext;
let oneBlended;
let oneGlobalTime = 0;
let oneLastFrameTime = 0;
let oneBlockStartTimes = [];
let oneBlockGrayDurations = [];
let oneBlockGrayValues = [];
let oneBlockDone = [];
let oneBlockInGray = [];
let oneBlockGrayEndTimes = [];
let oneBlockStartXs = [];
let oneBlockStartYs = [];
let oneBlockEndXs = [];
let oneBlockEndYs = [];
let oneBlockIndicesByStart = [];
let oneBlockIndicesByEnd = [];
let oneNextGrayBlockIdx = 0;
let oneNextFinalBlockIdx = 0;
let oneRemainingBlocks = 0;
let oneImagesLoaded = false;
let oneAnimationStarted = false;
let oneMoveUpStarted = false;
let oneBlockAnimationStarted = false;
let oneLoadCompleteTime = 0;
let oneStartDelay = 2.0;
let oneMoveUpDuration = 1.0;
let oneMoveUpStartTime = 0;
let oneBlockSize = 12;
let oneBlocksX, oneBlocksY;
// 溶解用緩衝已配置的方塊數（與 totalBlocks 相同時不重配 Array / Uint8Array）
let oneCachedTotalBlocks = 0;

// oneCanvas 動畫狀態
let oneWaitingForNextImage = true;
let oneCurrentAnimationPhase = 'idle';
let oneIsFirstTime = true;
// 延遲初始化旗標：圖片到達時不立即 loadPixels，留到 draw() 裡受控執行
let oneNeedsParamsInit = false;
let onePendingIsBottomWhite = false;

// oneIdleCached：idle/waiting 時是否已將靜態 JPEG 畫到主畫布（畫一次後不再重畫）
let oneIdleCached = false;

// oneCanvas 均勻分布參數
let oneStartTimeMin = 0.2;
let oneStartTimeMax = 3.0;
let oneGrayDurationMin = 0.3;
let oneGrayDurationMax = 1.3;

// oneCanvas 灰色值高斯分布參數
let oneGrayValueMean = 128;
let oneGrayValueStd = 60;
let oneGrayValueMin = 0;
let oneGrayValueMax = 255;

// 開機相關參數
let isGeneratorOn = false;
let isGaltonBoardOn = false;
let isPhysiontraceOn = false;

// MQTT 客戶端
let client;

// 全局等待狀態
let globalWaitingState = false; // 初始不是等待狀態
let imageWaitingState = false;
let needsOneCanvasClear = false; // 剛退出 imageWaitingState 時需要清一次左側面板
let noiseWaitingState = false;
let nowStep = 0;

// 啟動排程防重複
let hasMainSequenceStarted = false;
let scheduledStartTimeoutId = null;

// 握手計時（避免依賴 frameCount，且與禎率無關）
let lastHandshakeTime = -999;

// 箭頭幾何常數（預先計算，避免每幀重算）
const _arrowCX = 540;
const _arrowCY = 960;
const _arrowSide = 60;
const _arrowTriH = _arrowSide * Math.sqrt(3) / 2;
const _arrowRectW = 20;
const _arrowRectH = _arrowSide;
const _arrowTX1 = _arrowCX - _arrowSide / 2;
const _arrowTX2 = _arrowCX + _arrowSide / 2;
const _arrowTX3 = _arrowCX;
const _arrowTY1 = _arrowCY;
const _arrowTY2 = _arrowCY;
const _arrowTY3 = _arrowCY + _arrowTriH;
const _arrowRX  = _arrowCX - _arrowRectW / 2;
const _arrowRY  = _arrowCY - _arrowRectH;

function getSum(total, num) {
    return total + num;
}

class Sample{
  constructor(val) {
    this.reset(val);
  }

  reset(val) {
    this.val = val;
    this.sortedIdx = undefined;
    this.sortedX = undefined;
    this.sortedY = undefined;
    this.noiseIdx = undefined;
    this.noiseX = undefined;
    this.noiseY = undefined;
    this.targetNoiseX = undefined;
    this.targetNoiseY = undefined;
    this.expandedBinIndex = undefined;
    this.expandedBinOffset = undefined;
    this.inFinalPosition = false;
    this.currentX = undefined;
    this.currentY = undefined;
    this.finalTargetX = undefined;
    this.finalTargetY = undefined;
    this.inFinalMatrixPosition = false;
  }
}

function clearArrayOfArrays(arr) {
  for (let i = 0; i < arr.length; i++) {
    if (Array.isArray(arr[i])) {
      arr[i].length = 0;
    }
  }
  arr.length = 0;
}

function acquireSample(val) {
  let sample = samplePool[samplePoolUsed];
  if (!sample) {
    sample = new Sample(val);
    samplePool[samplePoolUsed] = sample;
  } else {
    sample.reset(val);
  }
  samplePoolUsed++;
  return sample;
}

function ensureGaussianTargetPool() {
  if (gaussianTargetPoolReady && gaussianTargetPool.length === noiseWidth * noiseHeight) {
    return;
  }

  gaussianTargetPool.length = 0;

  let centerX = twoCanvasWidth / 2;
  let centerY = canvasHeight/2 + canvasHeight/4;
  let rectLeft = marginHeight;
  let rectRight = twoCanvasWidth - marginHeight;
  let rectTop = centerY - imgHeight/2 - marginHeight/2;
  let rectBottom = centerY + imgHeight/2 + marginHeight/2;
  let rectWidth = rectRight - rectLeft;
  let rectHeight = rectBottom - rectTop;

  let poolSize = noiseWidth * noiseHeight;
  for (let i = 0; i < poolSize; i++) {
    let validPosition = false;
    let targetX, targetY;
    let attempts = 0;
    const maxAttempts = 100;

    while (!validPosition && attempts < maxAttempts) {
      attempts++;
      let u1 = random();
      let u2 = random();
      let z1 = sqrt(-2 * log(u1)) * cos(TWO_PI * u2);
      let z2 = sqrt(-2 * log(u1)) * sin(TWO_PI * u2);

      targetX = centerX + z1 * (rectWidth * gaussianSigmaX);
      targetY = centerY + z2 * (rectHeight * gaussianSigmaY);

      if (isPointInRoundedRect(
        targetX, targetY,
        rectLeft, rectTop,
        rectWidth, rectHeight,
        cornerRadius
      )) {
        validPosition = true;
      }
    }

    if (!validPosition) {
      do {
        targetX = random(rectLeft, rectRight);
        targetY = random(rectTop, rectBottom);
      } while (!isPointInRoundedRect(
        targetX, targetY,
        rectLeft, rectTop,
        rectWidth, rectHeight,
        cornerRadius
      ));
    }

    gaussianTargetPool.push({ x: targetX, y: targetY });
  }

  gaussianTargetPoolReady = true;
}

function setup() {
    const urlParams = new URLSearchParams(window.location.search);
    const fpsParam = Number(urlParams.get('fps'));
    if (Number.isFinite(fpsParam) && fpsParam > 0) {
        targetFrameRate = fpsParam;
    }
    const manualParam = urlParams.get('manual');
    if (manualParam !== null) {
      manualMode = manualParam === '1';
    }
    const halfRateParam = urlParams.get('halfrate');
    if (halfRateParam !== null) {
      movingSquaresHalfRate = halfRateParam === '1';
    }

    // willReadFrequently 必須在 context 建立前注入，否則設定無效。
    // 用 monkey-patch 攔截 p5.js 內部的 getContext('2d') 呼叫。
    const _origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, attrs) {
        if (type === '2d') {
            attrs = Object.assign({}, attrs, { willReadFrequently: true });
        }
        return _origGetContext.call(this, type, attrs);
    };

    createCanvas(canvasWidth, canvasHeight);

    // 還原 prototype，避免影響頁面其他 canvas 操作
    HTMLCanvasElement.prototype.getContext = _origGetContext;

    // 強制像素密度 1：在 Retina/HiDPI 螢幕上，預設 pixelDensity=2
    // 會讓 2160×1920 變成 4320×3840（4 倍像素量）。
    // 設為 1 可直接減少 75% 的 GPU 填充工作量。
    pixelDensity(1);

    frameRate(targetFrameRate);

    // 關閉畫素插值，減少渲染管線中的 smoothing 計算
    noSmooth();
    
    // 移除畫布邊框，避免影響倒數計時外框
    let canvas = document.querySelector('canvas');
    if (canvas) {
        canvas.style.border = 'none';
    }
    
    connectToMQTT();

    // 預分配模式：預先計算 8 格佈局
    if (preAllocatedMode) {
      preAllocLayout = computePreAllocLayout();
    }
    
    // 初始化左側為全白圖片（上下都是白色）
    oneImgNow = createImage(480, 720);
    oneImgNow.loadPixels();
    for (let i = 0; i < oneImgNow.pixels.length; i += 4) {
        oneImgNow.pixels[i] = 255;     // R
        oneImgNow.pixels[i + 1] = 255; // G
        oneImgNow.pixels[i + 2] = 255; // B
        oneImgNow.pixels[i + 3] = 255; // A
    }
    oneImgNow.updatePixels();
    
    oneImgPrev = createImage(480, 720);
    oneImgPrev.loadPixels();
    for (let i = 0; i < oneImgPrev.pixels.length; i += 4) {
        oneImgPrev.pixels[i] = 255;     // R
        oneImgPrev.pixels[i + 1] = 255; // G
        oneImgPrev.pixels[i + 2] = 255; // B
        oneImgPrev.pixels[i + 3] = 255; // A
    }
    oneImgPrev.updatePixels();
    
    oneImagesLoaded = true;
    oneCurrentAnimationPhase = 'idle';
    oneIsFirstTime = true;
    debugLog('左側初始化為全白畫面');
    background(255); // 一次性初始化畫布為白色
}

// ========== twoCanvas 高爾頓板動畫函數 ==========
function setupBarAnimation() {
  barAnimations.length = binCount;
  
  for (let i = 0; i < binCount; i++) {
    let anim = barAnimations[i];
    if (!anim) {
      anim = {};
      barAnimations[i] = anim;
    }
    let baseSpeed = 0.05;
    anim.progress = 0;
    anim.baseSpeed = baseSpeed;
    anim.currentSpeed = 0;
    anim.phase = random(0, TWO_PI);
    anim.frequency = random(2, 4);
    anim.speedPhase = random(0, TWO_PI);
    anim.speedFrequency = random(1, 2);
    if (!Array.isArray(anim.circles)) {
      anim.circles = [];
    } else {
      anim.circles.length = 0;
    }
    anim.nextCircleIndex = 0;
    anim.nextCircleDelay = random(circleMinDelay, circleMaxDelay);
    anim.lastCircleTime = 0;
  }

  let binsPerOriginalBin = (twoCanvasWidth - marginWidth*2) / scale_factor / binCount;
  let totalExpandedBins = binCount * binsPerOriginalBin;
  squareAnimations.length = totalExpandedBins;
  for (let i = 0; i < totalExpandedBins; i++) {
    let anim = squareAnimations[i];
    if (!anim) {
      anim = {};
      squareAnimations[i] = anim;
    }
    let baseSpeed = 0.05;
    anim.progress = 0;
    anim.baseSpeed = baseSpeed;
    anim.currentSpeed = 0;
    anim.phase = random(0, TWO_PI);
    anim.frequency = random(2, 4);
    anim.speedPhase = random(0, TWO_PI);
    anim.speedFrequency = random(1, 2);
    if (!Array.isArray(anim.squares)) {
      anim.squares = [];
    } else {
      anim.squares.length = 0;
    }
    anim.nextSquareIndex = 0;
    anim.nextSquareDelay = random(squareMinDelay, squareMaxDelay);
    anim.lastSquareTime = 0;
    anim.settledCount = 0;  // 已連續落定的前端方塊數（避免從頭掃描）
    anim.squareDone = false; // 所有方塊已生成且落定
  }
}

function initializeData() {
  try {
    if (!Array.isArray(fixedBins) || fixedBins.length < 5) {
      console.error('fixedBins 資料不足，無法初始化');
      throw new Error('資料點數量不足，至少需要 5 個數據點');
    }
    
    if (!fixedBins.every(bin => typeof bin === 'number')) {
      console.error('fixedBins 包含非數值元素');
      throw new Error('資料點必須全為數值');
    }
    
    if (fixedBins.every(bin => bin === 0)) {
      console.warn('fixedBins 全為 0，將使用預設樣本數據');
      fixedBins = [0, 2, 8, 10, 15, 19, 25, 30, 35, 40, 45, 53, 64, 77, 87, 77, 92, 64, 46, 40, 35, 30, 27, 23, 17, 13, 10, 6, 3, 2];
    }
    
    // 重置所有動畫狀態
    isAnimating = true;
    firstAnimationComplete = false;
    circlesFallingComplete = false;
    colorTransitionComplete = false;
    colorTransitionStartTime = 0;
    secondAnimationComplete = false;
    thirdAnimationStartTime = 0;
    thirdAnimationComplete = false;

    pauseStartTime = 0;
    pauseComplete = false;
    secondGraphPauseStartTime = 0;
    secondGraphPauseComplete = false;
    gaussianPauseStartTime = 0;
    gaussianPauseComplete = false;

    line1Progress = 0;
    line1AnimationStartTime = 0;
    line1AnimationComplete = false;

    line2Progress = 0;
    line2AnimationStartTime = 0;
    line2AnimationComplete = false;

    finalMatrixAnimationComplete = false;
    finalMatrixValuesPrinted = false;
    finalMatrixCached = false;
    if (finalMatrixGraphics) finalMatrixGraphics.clear(); // 清空但保留 GPU 紋理

    barChartCached = false;
    if (barChartGraphics) barChartGraphics.clear();
    squaresCached = false;
    if (squaresGraphics) squaresGraphics.clear();   // 清空但保留 GPU 紋理，避免重新分配造成卡頓
    if (movingSquaresGraphics) movingSquaresGraphics.clear();
    gaussianCached = false;
    if (gaussianGraphics) gaussianGraphics.clear();

    binCount = fixedBins.length;

    // 清空之前的數據，但保留現有陣列與物件，避免第二輪開始大量 GC
    samplePoolUsed = 0;
    samples.length = 0;
    mappedBins.length = 0;
    clearArrayOfArrays(expandedBins);
    clearArrayOfArrays(samplesByBin);
    squaresPerExpandedBin.length = 0;
    flattenedValues.length = 0;
    clearArrayOfArrays(sampledSquaresByBin);

    try {
      totalSampleCount = fixedBins.reduce(getSum);
      if (totalSampleCount <= 0) {
        throw new Error('樣本總數為零或負數');
      }
    } catch (error) {
      console.error('計算樣本總數出錯:', error);
      totalSampleCount = 1000;
      fixedBins = fixedBins.map(bin => bin > 0 ? bin : 1);
    }
    
    let binsPerOriginalBin = (twoCanvasWidth - marginWidth*2) / scale_factor / binCount;
    
    // 產生原始資料
    for (let i = 0; i < binCount; i++) {
      let count = round(noiseWidth*noiseHeight * (fixedBins[i] / totalSampleCount));
      let binLow = map(i, 0, binCount, sampleRangeMin, sampleRangeMax);
      let binHigh = map(i + 1, 0, binCount, sampleRangeMin, sampleRangeMax);
      mappedBins.push(count)
      for (let j = 0; j < count; j++) {
        if (samples.length == noiseWidth*noiseHeight) {
          mappedBins[mappedBins.length-1]--;
        } else {
          let val = random(binLow, binHigh);
          val = map(val, sampleRangeMin, sampleRangeMax, 0, 255);
          let sample = acquireSample(val);
          samples.push(sample);
        }
      }
    }

    if (samples.length < noiseWidth*noiseHeight) {
      let deficit = noiseWidth*noiseHeight - samples.length;
      for (let i = 0; i < deficit; i++) {
        let binIndex = floor(random(0, binCount));
        mappedBins[binIndex]++;
        let binLow = map(binIndex, 0, binCount, sampleRangeMin, sampleRangeMax);
        let binHigh = map(binIndex + 1, 0, binCount, sampleRangeMin, sampleRangeMax);
        let val = random(binLow, binHigh);
        val = map(val, sampleRangeMin, sampleRangeMax, 0, 255);
        let sample = acquireSample(val);
        samples.push(sample);
      }
    }

    shuffle(samples, true);
    for (let i = 0; i < samples.length; i++) {
      samples[i].noiseIdx = i;
    }
    for (let i = 0, idx = 0; i < noiseWidth; i++) {
      for (let j = 0; j < noiseHeight; j++) {
        samples[idx].noiseX = i;
        samples[idx].noiseY = j;
        idx++;
      }
    }
    
    samples.sort((a, b) => b.val - a.val);
    for (let i = 0; i < samples.length; i++) {
      samples[i].sortedIdx = i;
    }
    for (let i = 0, idx = 0; i < binCount; i++) {
      for (let j = 0; j < mappedBins[i]; j++) {
        samples[idx].sortedX = i;
        samples[idx].sortedY = j;
        idx++;
      }
    }

    // 展開 bins
    for (let i = 0; i < binCount; i++) {
      let squaresInBin = mappedBins[i];
      let squaresPerNewBin = Math.floor(squaresInBin / binsPerOriginalBin);
      let remainder = squaresInBin % binsPerOriginalBin;
      
      for (let j = 0; j < binsPerOriginalBin; j++) {
        let newBinCount = squaresPerNewBin;
        if (i < binCount/2) {
          if (j === binsPerOriginalBin - 1) {
            newBinCount += remainder;
          }
        } else {
          if (j === 0) {
            newBinCount += remainder;
          }
        }
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
        if (i < binCount/2) {
          targetBin = Math.min(Math.floor(j / squaresPerNewBin), binsPerOriginalBin - 1);
        } else {
          if (j < squaresPerNewBin + remainder) {
            targetBin = 0;
          } else {
            targetBin = Math.min(Math.floor((j - remainder) / squaresPerNewBin), binsPerOriginalBin - 1);
          }
        }
        
        let ebIdx = expandedBinStart + targetBin;
        if (!expandedBins[ebIdx]) {
          expandedBins[ebIdx] = [];
        }
        samples[sampleIndex].expandedBinIndex = ebIdx;
        samples[sampleIndex].expandedBinOffset = expandedBins[ebIdx].length;
        expandedBins[ebIdx].push(samples[sampleIndex]);
        sampleIndex++;
      }
    }

    expandedBinActiveIndices.length = 0;
    for (let eb = 0; eb < expandedBins.length; eb++) {
      if (expandedBins[eb] && expandedBins[eb].length > 0) {
        expandedBinActiveIndices.push(eb);
      }
    }

    cachedHistogramWidth = twoCanvasWidth - marginWidth * 2;
    binWidth = cachedHistogramWidth / binCount;
    circleSize = binWidth;
    
    circleSpacing = circleSize;
    maxCircleCount = floor(histogramHeight / circleSpacing) + 1;
    ensureGaussianTargetPool();

    // 預先建立 samplesByBin 索引，避免每幀都做 filter
    samplesByBin.length = binCount;
    for (let i = 0; i < binCount; i++) {
      if (!Array.isArray(samplesByBin[i])) {
        samplesByBin[i] = [];
      } else {
        samplesByBin[i].length = 0;
      }
    }
    for (let i = 0; i < samples.length; i++) {
      let binIdx = samples[i].sortedX;
      if (binIdx >= 0 && binIdx < binCount) {
        samplesByBin[binIdx].push(samples[i]);
      }
    }

    for (let i = 0; i < samples.length; i++) {
      samples[i].targetNoiseX = samples[i].noiseX;
      samples[i].targetNoiseY = samples[i].noiseY;
      samples[i].inFinalPosition = false;
    }

    // 預先建立 sampledSquaresByBin，避免 drawTwoAnimation 中每幀重建
    let cachedMaxCount = max(mappedBins);
    sampledSquaresByBin.length = binCount;
    for (let i = 0; i < binCount; i++) {
      let totalHeight = histogramHeight * (mappedBins[i] / cachedMaxCount);
      let maxCircles = floor(totalHeight / (circleSize)) + 1;
      let squaresInBin = samplesByBin[i];
      let step = squaresInBin.length / maxCircles;
      let sampled = sampledSquaresByBin[i];
      if (!Array.isArray(sampled)) {
        sampled = [];
        sampledSquaresByBin[i] = sampled;
      } else {
        sampled.length = 0;
      }
      for (let j = 0; j < squaresInBin.length; j += step) {
        sampled.push(squaresInBin[round(j)]);
        if (sampled.length >= maxCircles) break;
      }
    }
    
    cachedMaxExpandedHeight = 0;
    for (let i = 0; i < squaresPerExpandedBin.length; i++) {
      if (squaresPerExpandedBin[i] > cachedMaxExpandedHeight) {
        cachedMaxExpandedHeight = squaresPerExpandedBin[i];
      }
    }
    
    setupBarAnimation();

    // 圖3方格繪圖順序隨機化：洗牌 0~255 灰階桶的渲染順序，
    // 讓重疊方格的前後層關係隨機，而非固定暗色壓淺色
    shuffledViOrder = Array.from({length: 256}, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = shuffledViOrder[i]; shuffledViOrder[i] = shuffledViOrder[j]; shuffledViOrder[j] = tmp;
    }

    // 預先建立（或清空）離屏畫布，避免動畫進行中才分配 GPU 記憶體造成卡頓
    if (!squaresGraphics) {
      squaresGraphics = createGraphics(twoCanvasWidth, canvasHeight);
    }
    if (!gaussianGraphics) {
      gaussianGraphics = createGraphics(twoCanvasWidth, canvasHeight);
    }
    if (!finalMatrixGraphics) {
      finalMatrixGraphics = createGraphics(twoCanvasWidth, canvasHeight);
    }

    debugLog('右側動畫初始化完成，樣本總數:', totalSampleCount);
  } catch (error) {
    console.error('初始化數據時出錯:', error);
    hasReceivedData = false;
  }
}

// ========== oneCanvas 圖片溶解動畫函數 ==========
function loadNextImageAndStartAnimation(imgPath) {
  if (oneCurrentAnimationPhase !== 'idle') {
    debugLog('左側動畫正在進行中，忽略新的圖片請求');
    return;
  }
  
  debugLog('開始載入新圖片:', imgPath);
  oneCurrentAnimationPhase = 'waiting';
  
  loadImage(imgPath, img => {
    debugLog('圖片載入完成:', imgPath);
    
    oneImgNext = img;
    // resize 留在 callback（一次性，offscreen canvas 操作）
    oneImgNext.resize(480, 720);
    
    // 第一次時先確保上方圖片已初始化
    if (oneIsFirstTime && !oneImgPrev) {
      oneImgPrev = createImage(480, 720);
      oneImgPrev.loadPixels();
      for (let i = 0; i < oneImgPrev.pixels.length; i += 4) {
        oneImgPrev.pixels[i] = 255;
        oneImgPrev.pixels[i + 1] = 255;
        oneImgPrev.pixels[i + 2] = 255;
        oneImgPrev.pixels[i + 3] = 255;
      }
      oneImgPrev.updatePixels();
    }
    
    // checkIfImageIsWhite 只做一次 loadPixels（~1.4MB），其餘全部延遲到 draw()
    onePendingIsBottomWhite = checkIfImageIsWhite(oneImgNow);
    debugLog('下方圖片是否為白色:', onePendingIsBottomWhite);
    
    // initializeOneAnimationParameters() 延遲到 draw() 裡執行，避免多次 GPU→CPU 讀回
    // 擠在同一幀造成 twoCanvas 掉幀
    oneNeedsParamsInit = true;
    startOneAnimation(onePendingIsBottomWhite);
  }, () => {
    console.error('圖片載入失敗:', imgPath);
    oneCurrentAnimationPhase = 'idle';
  });
}

// 檢查圖片是否為全白
function checkIfImageIsWhite(img) {
  if (!img) return false;
  
  // 確保像素數據已載入
  img.loadPixels();
  
  if (!img.pixels || img.pixels.length === 0) return false;
  
  for (let i = 0; i < img.pixels.length; i += 4) {
    if (img.pixels[i] !== 255 || img.pixels[i + 1] !== 255 || img.pixels[i + 2] !== 255) {
      return false;
    }
  }
  return true;
}

// 初始化白色圖片
function fillImageWhite(img) {
  img.loadPixels();
  for (let i = 0; i < img.pixels.length; i += 4) {
    img.pixels[i] = 255;
    img.pixels[i + 1] = 255;
    img.pixels[i + 2] = 255;
    img.pixels[i + 3] = 255;
  }
  img.updatePixels();
}

function initializeWhiteImages() {
  if (!oneImgNow) {
    oneImgNow = createImage(480, 720);
  }
  fillImageWhite(oneImgNow);

  if (!oneImgPrev) {
    oneImgPrev = createImage(480, 720);
  }
  fillImageWhite(oneImgPrev);

  oneCurrentAnimationPhase = 'idle';
  oneIsFirstTime = true;
  oneIdleCached = false; // 重設為白底，讓快取失效
}

function initializeOneAnimationParameters() {
  if (!oneImgNow) return;
  
  if (!oneBlended || oneBlended.width !== oneImgNow.width || oneBlended.height !== oneImgNow.height) {
    oneBlended = createImage(oneImgNow.width, oneImgNow.height);
  }
  // oneImgNow.pixels 由呼叫前的 checkIfImageIsWhite() 已載入，無需重複 loadPixels
  // oneImgNext.pixels 此時才載入（延遲到 draw()，不擠在 MQTT callback）
  if (oneImgNext) oneImgNext.loadPixels();
  oneBlended.loadPixels();
  
  // 預先將 oneImgNow 像素複製到 oneBlended，避免動畫中每幀重複複製未開始區塊
  oneBlended.pixels.set(oneImgNow.pixels);
  
  oneBlocksX = Math.ceil(oneImgNow.width / oneBlockSize);
  oneBlocksY = Math.ceil(oneImgNow.height / oneBlockSize);
  let totalBlocks = oneBlocksX * oneBlocksY;

  if (oneCachedTotalBlocks !== totalBlocks) {
    oneCachedTotalBlocks = totalBlocks;
    oneBlockStartTimes = new Array(totalBlocks);
    oneBlockGrayDurations = new Array(totalBlocks);
    oneBlockGrayValues = new Array(totalBlocks);
    oneBlockGrayEndTimes = new Array(totalBlocks);
    oneBlockStartXs = new Array(totalBlocks);
    oneBlockStartYs = new Array(totalBlocks);
    oneBlockEndXs = new Array(totalBlocks);
    oneBlockEndYs = new Array(totalBlocks);
    oneBlockIndicesByStart = new Array(totalBlocks);
    oneBlockIndicesByEnd = new Array(totalBlocks);
    oneBlockDone = new Uint8Array(totalBlocks);
    oneBlockInGray = new Uint8Array(totalBlocks);
  } else {
    oneBlockDone.fill(0);
    oneBlockInGray.fill(0);
  }
  oneRemainingBlocks = totalBlocks;
  
  for (let i = 0; i < totalBlocks; i++) {
    let startTime = random(oneStartTimeMin, oneStartTimeMax);
    let grayDuration = random(oneGrayDurationMin, oneGrayDurationMax);
    let blockX = i % oneBlocksX;
    let blockY = Math.floor(i / oneBlocksX);
    let startX = blockX * oneBlockSize;
    let startY = blockY * oneBlockSize;
    oneBlockStartTimes[i] = startTime;
    oneBlockGrayDurations[i] = grayDuration;
    oneBlockGrayValues[i] = constrain(randomGaussian(oneGrayValueMean, oneGrayValueStd), oneGrayValueMin, oneGrayValueMax);
    oneBlockGrayEndTimes[i] = startTime + grayDuration;
    oneBlockStartXs[i] = startX;
    oneBlockStartYs[i] = startY;
    oneBlockEndXs[i] = Math.min(startX + oneBlockSize, oneImgNow.width);
    oneBlockEndYs[i] = Math.min(startY + oneBlockSize, oneImgNow.height);
    oneBlockIndicesByStart[i] = i;
    oneBlockIndicesByEnd[i] = i;
  }

  oneBlockIndicesByStart.sort((a, b) => oneBlockStartTimes[a] - oneBlockStartTimes[b]);
  oneBlockIndicesByEnd.sort((a, b) => oneBlockGrayEndTimes[a] - oneBlockGrayEndTimes[b]);
  oneNextGrayBlockIdx = 0;
  oneNextFinalBlockIdx = 0;
  oneBlended.updatePixels();
}

function paintOneBlockGray(blockIndex) {
  if (oneBlockInGray[blockIndex] || oneBlockDone[blockIndex]) return false;

  let grayValue = oneBlockGrayValues[blockIndex];
  let startX = oneBlockStartXs[blockIndex];
  let startY = oneBlockStartYs[blockIndex];
  let endX = oneBlockEndXs[blockIndex];
  let endY = oneBlockEndYs[blockIndex];

  oneBlockInGray[blockIndex] = 1;
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      let pa = (y * oneImgNow.width + x) * 4;
      oneBlended.pixels[pa] = grayValue;
      oneBlended.pixels[pa + 1] = grayValue;
      oneBlended.pixels[pa + 2] = grayValue;
      oneBlended.pixels[pa + 3] = oneImgNow.pixels[pa + 3];
    }
  }

  return true;
}

function paintOneBlockFinal(blockIndex) {
  if (oneBlockDone[blockIndex]) return false;

  let startX = oneBlockStartXs[blockIndex];
  let startY = oneBlockStartYs[blockIndex];
  let endX = oneBlockEndXs[blockIndex];
  let endY = oneBlockEndYs[blockIndex];

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      let pa = (y * oneImgNow.width + x) * 4;
      oneBlended.pixels[pa] = oneImgNext.pixels[pa];
      oneBlended.pixels[pa + 1] = oneImgNext.pixels[pa + 1];
      oneBlended.pixels[pa + 2] = oneImgNext.pixels[pa + 2];
      oneBlended.pixels[pa + 3] = oneImgNext.pixels[pa + 3];
    }
  }

  oneBlockDone[blockIndex] = 1;
  oneRemainingBlocks--;
  return true;
}

function advanceOneBlockTransitions() {
  let blendedDirty = false;

  while (oneNextGrayBlockIdx < oneBlockIndicesByStart.length) {
    let blockIndex = oneBlockIndicesByStart[oneNextGrayBlockIdx];
    if (oneBlockStartTimes[blockIndex] > oneGlobalTime) break;
    blendedDirty = paintOneBlockGray(blockIndex) || blendedDirty;
    oneNextGrayBlockIdx++;
  }

  while (oneNextFinalBlockIdx < oneBlockIndicesByEnd.length) {
    let blockIndex = oneBlockIndicesByEnd[oneNextFinalBlockIdx];
    if (oneBlockGrayEndTimes[blockIndex] > oneGlobalTime) break;
    blendedDirty = paintOneBlockFinal(blockIndex) || blendedDirty;
    oneNextFinalBlockIdx++;
  }

  return blendedDirty;
}

function startOneAnimation(isBottomWhite) {
  oneCurrentAnimationPhase = 'animating';
  oneAnimationStarted = false;
  oneMoveUpStarted = false;
  oneBlockAnimationStarted = false;
  oneGlobalTime = 0;
  oneLastFrameTime = 0;
  oneLoadCompleteTime = millis() / 1000.0;
  
  // 根據下方圖片狀態決定動畫邏輯
  if (isBottomWhite) {
    // 情況1：下方是白色 - 跳過移動動畫，直接溶解
    oneMoveUpStarted = true;
    oneBlockAnimationStarted = true;
    debugLog('左側動畫開始（下方是白色，跳過移動動畫，直接溶解）');
  } else {
    // 情況2：下方有圖 - 上移時會「複製一張往上飛」，下格固定仍畫原圖，再進溶解
    debugLog('左側動畫開始（向上移動：下格保留、複本上移）');
  }
}

function drawOneDownArrow() {
    fill(0, 0, 0);
    noStroke();
    triangle(_arrowTX1, _arrowTY1, _arrowTX2, _arrowTY2, _arrowTX3, _arrowTY3);
    rect(_arrowRX, _arrowRY, _arrowRectW, _arrowRectH);
}

function smoothstep(t) {
    return t * t * (3 - 2 * t);
}

function sendHandshakeMessage() {
  if (client && client.connected) {
    debugLog('發送握手訊息到 galton/handshake');
    const handshakeMessage = {
      timestamp: new Date().toISOString(),
      status: 'handshake'
    };
    const publishOptions = {
      qos: 0,
      retain: false
    };
    client.publish('galton/handshake', JSON.stringify(handshakeMessage), publishOptions, function(err) {
      if (err) {
        console.error('發送握手訊息失敗:', err);
      } else {
        debugLog(`已成功發送握手訊息到 galton/handshake (QoS: ${publishOptions.qos})`);
      }
    });
  }
}

function sendStartMessage() {
  if (client && client.connected) {
    debugLog('發送開始訊息到 galton/start');
    const message = {
      status: 'start'
    };
    const publishOptions = {
      qos: window.mqttQoS ? window.mqttQoS.publish : 2,
      retain: false
    };
    client.publish('galton/start', JSON.stringify(message), publishOptions, function(err) {
      if (err) {
        console.error('發送開始訊息失敗:', err);
      } else {
        debugLog(`已成功發送開始訊息到 galton/start (QoS: ${publishOptions.qos})`);
      }
    });
  }
}

function sendCompletionMessage() {
  if (client && client.connected) {
    debugLog('動畫完成，發送完成訊息到 galton/completed');
    
    const completionMessage = {
      timestamp: new Date().toISOString(),
      status: 'completed',
      finalValues: flattenedValues.length > 100 ? 
        flattenedValues.slice(0, 100).concat(['...']) : 
        flattenedValues
    };
    
    const publishOptions = {
      qos: window.mqttQoS ? window.mqttQoS.publish : 2,
      retain: false
    };
    
    client.publish('galton/completed', JSON.stringify(completionMessage), publishOptions, function(err) {
      if (err) {
        console.error('發送完成訊息失敗:', err);
      } else {
        debugLog(`已成功發送完成訊息到 galton/completed (QoS: ${publishOptions.qos})`);
      }
    });
  } else {
    console.warn('MQTT 客戶端未連接，無法發送完成訊息');
  }
}

function isPointInRoundedRect(x, y, rectX, rectY, rectWidth, rectHeight, radius) {
  if (x >= rectX + radius && x <= rectX + rectWidth - radius &&
      y >= rectY + radius && y <= rectY + rectHeight - radius) {
    return true;
  }
  
  if (x < rectX + radius && y < rectY + radius) {
    return dist(x, y, rectX + radius, rectY + radius) <= radius;
  }
  if (x > rectX + rectWidth - radius && y < rectY + radius) {
    return dist(x, y, rectX + rectWidth - radius, rectY + radius) <= radius;
  }
  if (x < rectX + radius && y > rectY + rectHeight - radius) {
    return dist(x, y, rectX + radius, rectY + rectHeight - radius) <= radius;
  }
  if (x > rectX + rectWidth - radius && y > rectY + rectHeight - radius) {
    return dist(x, y, rectX + rectWidth - radius, rectY + rectHeight - radius) <= radius;
  }
  
  if ((x >= rectX + radius && x <= rectX + rectWidth - radius) &&
      (y >= rectY && y <= rectY + rectHeight)) {
    return true;
  }
  if ((x >= rectX && x <= rectX + rectWidth) &&
      (y >= rectY + radius && y <= rectY + rectHeight - radius)) {
    return true;
  }
  
  return false;
}

// ========== MQTT 連接和事件處理 ==========
function connectToMQTT() {
  const clientId = 'galton_merge_client_' + Math.random().toString(16).substr(2, 8);
  
  const mqttQoS = {
    subscribe: 2,
    publish: 2
  };
  
  let hosts = ['ws://localhost:8083/mqtt'];
  
  const urlParams = new URLSearchParams(window.location.search);
  const mqttHost = urlParams.get('mqtt_host');
  const mqttPort = urlParams.get('mqtt_port');
  const mqttPath = urlParams.get('mqtt_path');
  
  if (mqttHost) {
    const port = mqttPort || '8083';
    const path = mqttPath || '/mqtt';
    hosts.unshift(`ws://${mqttHost}:${port}${path}`);
    debugLog(`使用 URL 參數指定的 MQTT 伺服器: ${hosts[0]}`);
  }
  
  let currentHostIndex = 0;
  let host = hosts[currentHostIndex];
  
  const options = {
    keepalive: 60,
    clientId: clientId,
    clean: true,
    reconnectPeriod: 3000,
    connectTimeout: 30 * 1000,
    protocolId: 'MQTT',
    protocolVersion: 4,
    rejectUnauthorized: false
  };
  
  let connectionAttempts = 0;
  const maxConnectionAttempts = 3;
  
  debugLog('嘗試連接到 MQTT broker: ' + host);
  client = mqtt.connect(host, options);
  
  client.on('connect', function() {
    debugLog('已成功連接到 MQTT broker: ' + host);
    connectionAttempts = 0;
    
    const subscribeOptions = {
      qos: mqttQoS.subscribe
    };
    
    // 訂閱右側高爾頓板動畫的主題
    client.subscribe('galton/bins', subscribeOptions, function(err) {
      if (err) {
        console.error('訂閱 galton/bins 主題失敗:', err);
      } else {
        debugLog(`已成功訂閱主題: galton/bins (QoS: ${subscribeOptions.qos})`);
      }
    });
    
    // 訂閱左側圖片溶解動畫的主題
    client.subscribe('generator/completed_to_main', subscribeOptions, function(err) {
      if (err) {
        console.error('訂閱 generator/completed_to_main 主題失敗:', err);
      } else {
        debugLog(`已成功訂閱主題: generator/completed_to_main (QoS: ${subscribeOptions.qos})`);
      }
    });

    // 訂閱開始訊號主題
    client.subscribe('galton/handshakeReply', subscribeOptions, function(err) {
      if (err) {
        console.error('訂閱 galton/handshakeReply 主題失敗:', err);
      } else {
        debugLog(`已成功訂閱主題: galton/handshakeReply (QoS: ${subscribeOptions.qos})`);
      }
    });
    
    window.mqttQoS = mqttQoS;
  });
  
  client.on('error', function(error) {
    console.error(`MQTT 連接錯誤 (${host}):`, error);
    connectionAttempts++;
    debugLog(`連接嘗試次數: ${connectionAttempts}/${maxConnectionAttempts}`);
    
    if (connectionAttempts >= maxConnectionAttempts) {
      connectionAttempts = 0;
      currentHostIndex++;
      
      if (currentHostIndex < hosts.length) {
        debugLog(`嘗試下一個連接選項: ${hosts[currentHostIndex]}`);
        client.end(true);
        
        setTimeout(() => {
          host = hosts[currentHostIndex];
          client = mqtt.connect(host, options);
          setupEventHandlers(client, host);
        }, 1000);
      } else {
        console.error('所有MQTT連接選項都失敗了');
      }
    }
  });
  
  setupEventHandlers(client, host);
}

function setupEventHandlers(clientInstance, currentHost) {
  clientInstance.on('reconnect', function() {
    debugLog(`正在重新連接到 MQTT broker (${currentHost})...`);
  });
  
  clientInstance.on('close', function() {
    debugLog(`MQTT 連接已關閉 (${currentHost})`);
  });
  
  clientInstance.on('offline', function() {
    debugLog(`MQTT 客戶端離線 (${currentHost})`);
  });
  
  // 監聽新數據
  clientInstance.on('message', function(topic, message) {
    if (topic === 'galton/handshakeReply') {
      debugLog(`從 ${currentHost} 收到開始訊號`);
      
      try {
        const messageData = JSON.parse(message.toString());
        debugLog('接收到的開始訊號:', messageData);
        if (messageData.device == "generator") {
          isGeneratorOn = true;
        } else if (messageData.device == "galtonBoard") {
          isGaltonBoardOn = true;
        } else if (messageData.device == "physionotrace") {
          isPhysiontraceOn = true;
        }
        if (isGeneratorOn && isGaltonBoardOn && isPhysiontraceOn && !hasMainSequenceStarted) {
          if (manualMode) {
            // 手動模式：等待 Enter 鍵，不立即執行
            if (!waitingForHandshakeKeypress) {
              waitingForHandshakeKeypress = true;
              debugLog('所有裝置已連線，等待 Enter 鍵開始執行');
            }
          } else {
            // 自動模式：檢查現在時間是否已到早上09:00:00
            let now = new Date();
            let targetTime = new Date();
            targetTime.setHours(11, 0, 0, 0);
            
            if (now >= targetTime) {
              debugLog('時間已到或超過早上09:00:00，立即開始執行');
              hasMainSequenceStarted = true;
              sendStartMessage();
              globalWaitingState = true;
              imageWaitingState = true;
              noiseWaitingState = true;
              startNewStep();
            } else if (scheduledStartTimeoutId === null) {
              let waitTime = targetTime - now;
              debugLog(`現在時間未到早上09:00:00，將在 ${waitTime} 毫秒後開始執行 (${targetTime.toLocaleTimeString()})`);
              
              scheduledStartTimeoutId = setTimeout(() => {
                scheduledStartTimeoutId = null;
                hasMainSequenceStarted = true;
                debugLog('已到達早上09:00:00，開始執行');
                sendStartMessage();
                globalWaitingState = true;
                imageWaitingState = true;
                noiseWaitingState = true;
                startNewStep();
              }, waitTime);
            }
          }
        }
      } catch (error) {
        console.error('解析開始訊號失敗:', error);
      }
    } else if (topic === 'galton/bins') {
      debugLog(`從 ${currentHost} 收到右側動畫數據`);
      
      try {
        const messageData = JSON.parse(message.toString());
        debugLog('接收到的右側數據:', messageData);
        
        let newFixedBins;
        if (Array.isArray(messageData)) {
          newFixedBins = messageData;
        } else if (messageData.fixedBins && Array.isArray(messageData.fixedBins)) {
          newFixedBins = messageData.fixedBins;
        } else if (typeof messageData === 'object') {
          try {
            newFixedBins = Object.values(messageData);
            if (newFixedBins.length === 0 || !newFixedBins.every(item => typeof item === 'number')) {
              throw new Error('無法從物件轉換為有效的數值陣列');
            }
          } catch (objError) {
            throw new Error('接收到的數據不是有效的陣列或可轉換為陣列的格式');
          }
        } else {
          throw new Error('接收到的數據不是有效的陣列格式');
        }
        
        if (!newFixedBins.every(item => typeof item === 'number')) {
          throw new Error('陣列中包含非數值元素');
        }
        
        debugLog('處理後的 fixedBins 陣列:', newFixedBins);
        fixedBins = newFixedBins;
        
        initializeData();
        
        hasReceivedData = true;
        
        // 退出等待狀態，開始動畫
        globalWaitingState = false;
        noiseWaitingState = false;
        debugLog('收到動畫數據，退出等待狀態');
      } catch (e) {
        console.error('解析右側 MQTT 消息出錯:', e);
      }
    } else if (topic === 'generator/completed_to_main') {
      debugLog(`從 ${currentHost} 收到左側動畫數據`);
      
      try {
        const messageData = JSON.parse(message.toString());
        debugLog('接收到的左側數據:', messageData);

        if (preAllocatedMode) {
          // ── 預分配模式：依序將圖片溶解填入對應的 Step 格子 ──
          // nowStep 已由 startNewStep() 遞增，slotIdx = nowStep - 1（0-indexed，0-7）
          if (messageData.image_path) {
            const slotIdx = nowStep - 1;
            if (slotIdx >= 0 && slotIdx < 8) {
              const imgPath = messageData.image_path;
              loadImage(imgPath, img => {
                startPreAllocDissolve(slotIdx, img);
                debugLog(`[preAlloc] Step ${nowStep} 圖片載入完成，開始溶解至格子 ${slotIdx}`);
              }, () => {
                console.error('[preAlloc] 圖片載入失敗:', imgPath);
              });
            }
            globalWaitingState = false;
            imageWaitingState = false;
            debugLog('[preAlloc] 收到圖片，退出等待狀態');
          }
        } else {
          // ── 原始模式：正常的移動 + 溶解動畫 ──
          if (messageData.image_path) {
            const wasWaitingForFirstImage = imageWaitingState;
            loadNextImageAndStartAnimation(messageData.image_path);
            // 退出等待狀態，開始動畫
            globalWaitingState = false;
            imageWaitingState = false;
            // 僅在剛離開「等待第一張圖」時整張清白底（去掉 Waiting 文字）；下一張圖進來不要清，避免下方圖被刷成空白
            if (wasWaitingForFirstImage) {
              needsOneCanvasClear = true;
            }
            debugLog('收到圖片數據，退出等待狀態');
          }
        }
      } catch (error) {
        console.error('解析左側MQTT訊息失敗:', error);
      }
    }
  });
}

function startNewStep() {
  nowStep = nowStep + 1;
  hasReceivedData = false;
  noiseWaitingState = true;
  textSize(36);
  text("Waiting for the noise ......", twoCanvasX + twoCanvasWidth/2, canvasHeight/2);
  // 重新初始化白色圖片（預分配模式下不需要重設 oneCanvas）
  if (nowStep == 1 && !preAllocatedMode) {
    initializeWhiteImages();
  }
  // 開始倒數計時
  initializeCountdown();
  debugLog('進入等待狀態，顯示 Waiting for the noise ......');
}

// ========== 主要繪製函數 ==========
function draw() {
  currentTimeSeconds = millis() / 1000.0;

  // ── 局部重畫：只清除高爾頓板面板（右側）和底部文字區域 ──
  // 左側靜態 JPEG 不清除，保留在畫布上，每幀節省 2M+ 像素工作
  fill(255);
  noStroke();
  rect(twoCanvasX, 0, twoCanvasWidth, canvasHeight);       // 高爾頓板面板
  rect(0, canvasHeight - 90, canvasWidth, 90);              // 底部文字區

  // 檢查是否還沒收到開始訊號（初始狀態）
  if (!isGeneratorOn || !isGaltonBoardOn || !isPhysiontraceOn) {
    // 初始等待需要清除左側面板
    rect(oneCanvasX, 0, oneCanvasWidth, canvasHeight);
    oneIdleCached = false;
    preAllocGridInitialized = false;

    fill(0);
    textAlign(CENTER, CENTER);
    textSize(36);
    text("等待裝置開機完成", oneCanvasX + oneCanvasWidth/2, canvasHeight/2);
    text("等待裝置開機完成", twoCanvasX + twoCanvasWidth/2, canvasHeight/2);

    if (currentTimeSeconds - lastHandshakeTime >= 0.5) {
      lastHandshakeTime = currentTimeSeconds;
      sendHandshakeMessage();
    }
    return;
  }

  // 手動模式：所有 handshake 完成後等待 Enter 鍵
  if (waitingForHandshakeKeypress) {
    rect(oneCanvasX, 0, oneCanvasWidth, canvasHeight);
    oneIdleCached = false;
    preAllocGridInitialized = false;

    fill(0);
    textAlign(CENTER, CENTER);
    textSize(36);
    text("按下按鈕開始第一張", oneCanvasX + oneCanvasWidth/2, canvasHeight/2);
    text("按下按鈕開始第一張", twoCanvasX + twoCanvasWidth/2, canvasHeight/2);
    return;
  }

  // ── 預分配格子模式（preAllocatedMode）──
  // oneCanvas 顯示預先排好的 8 格佈局，每次收到圖片就溶解填入對應格子。
  // 不受 globalWaitingState / imageWaitingState 影響，也不在新 Step 時清除。
  if (preAllocatedMode) {
    drawOnePreAllocated();

    // twoCanvas：等待 noise 或播放動畫
    if (globalWaitingState || noiseWaitingState) {
      fill(0);
      textAlign(CENTER, CENTER);
      textSize(36);
      text("Waiting for the noise ......", twoCanvasX + twoCanvasWidth/2, canvasHeight/2);
    } else {
      drawTwoAnimation();
    }

    drawCountdownBorder();
    return;
  }
  
  // 檢查全局等待狀態
  if (globalWaitingState) {
    rect(oneCanvasX, 0, oneCanvasWidth, canvasHeight);
    oneIdleCached = false;

    fill(0);
    textAlign(CENTER, CENTER);
    textSize(36);
    text("Waiting for the first image ......", oneCanvasX + oneCanvasWidth/2, canvasHeight/2);
    text("Waiting for the noise ......", twoCanvasX + twoCanvasWidth/2, canvasHeight/2);
    drawCountdownBorder();
    return;
  }

  if (imageWaitingState) {
    // 左側需要清除並顯示等待文字
    fill(255); noStroke();
    rect(oneCanvasX, 0, oneCanvasWidth, canvasHeight);
    oneIdleCached = false;
    fill(0);
    textAlign(CENTER, CENTER);
    textSize(36);
    text("Waiting for the first image ......", oneCanvasX + oneCanvasWidth/2, canvasHeight/2);
  } else {
    if (needsOneCanvasClear) {
      // 僅剛離開「等待第一張圖」時清一次，去掉 Waiting 文字殘留（下一張圖不會設此旗標）
      fill(255); noStroke();
      rect(oneCanvasX, 0, oneCanvasWidth, canvasHeight);
      oneIdleCached = false;
      needsOneCanvasClear = false;
    }
    // idle+cached：畫面已固定在 canvas 上，完全跳過函式呼叫（含 push/translate/pop）
    if (!(oneCurrentAnimationPhase === 'idle' && oneIdleCached)) {
      drawOneAnimation();
    }
  }
  
  if (noiseWaitingState) {
    fill(0);
    textAlign(CENTER, CENTER);
    textSize(36);
    text("Waiting for the noise ......", twoCanvasX + twoCanvasWidth/2, canvasHeight/2);
  } else {
    drawTwoAnimation();
  }
  
  // ========== 倒數計時外框方塊 ==========
  drawCountdownBorder();
}

// 圖2：移動中方塊用原生 Canvas2D fillRect + 灰階分桶，避免每顆 p5 fill/square 的狀態開銷
// ctx 可傳入離屏 Graphics 的 drawingContext，預設使用主畫布
function drawChart2MovingSquaresNativeBatched(ctx) {
  if (!ctx) ctx = drawingContext;
  const sz = squareSize;
  const buckets = movingSquareFillBuckets;
  for (let b = 0; b < 256; b++) buckets[b].length = 0;
  for (let k = 0; k < expandedBinActiveIndices.length; k++) {
    const i = expandedBinActiveIndices[k];
    const anim = squareAnimations[i];
    if (anim.squareDone) continue; // 全部落定的 bin 跳過
    const x = marginWidth + i * sz;
    const arr = anim.squares;
    const startJ = anim.settledCount || 0; // 從第一個未落定方塊開始
    for (let j = startJ; j < arr.length; j++) {
      const sq = arr[j];
      if (sq.settled) continue;
      const vi = Math.max(0, Math.min(255, Math.floor(sq.val)));
      buckets[vi].push(x, sq.y + offsetHeight);
    }
  }
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (let vi = 0; vi < 256; vi++) {
    const pts = buckets[vi];
    if (pts.length === 0) continue;
    ctx.fillStyle = `rgb(${vi},${vi},${vi})`;
    for (let p = 0; p < pts.length; p += 2) {
      ctx.fillRect(pts[p], pts[p + 1], sz, sz);
    }
  }
  ctx.restore();
}

// 圖3：1000 個樣本用 native Canvas2D fillRect + 灰階分桶批次渲染，取代逐個 p5 fill/square
function drawSamplesNativeBatched() {
  const ctx = drawingContext;
  const sz = squareSize;
  const buckets = movingSquareFillBuckets;
  for (let b = 0; b < 256; b++) buckets[b].length = 0;
  for (let i = 0; i < samples.length; i++) {
    const vi = Math.max(0, Math.min(255, Math.floor(samples[i].val)));
    buckets[vi].push(samples[i].currentX, samples[i].currentY + offsetHeight);
  }
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  // 使用隨機洗牌後的灰階桶順序繪製，讓重疊方格的前後層關係隨機
  const viSeq = shuffledViOrder;
  for (let k = 0; k < 256; k++) {
    const vi = viSeq[k];
    const pts = buckets[vi];
    if (pts.length === 0) continue;
    ctx.fillStyle = `rgb(${vi},${vi},${vi})`;
    for (let p = 0; p < pts.length; p += 2) {
      ctx.fillRect(pts[p], pts[p + 1], sz, sz);
    }
  }
  ctx.restore();
}

function drawTwoAnimation() {
  // 設置 twoCanvas（高爾頓板）繪製區域的偏移
  push();
  translate(twoCanvasX, 0);
  
  if (!hasReceivedData) {
    pop();
    return;
  }

  // 圖1---- 固定分箱直條圖與平滑曲線 ----
  
  let allCirclesInPlace = true;
  let allCirclesGenerated = true;
  
  // 在第一幀就開始橫線動畫
  if (line1AnimationStartTime === 0) {
    line1AnimationStartTime = currentTimeSeconds;
  }
  
  // 更新橫線動畫進度
  if (!line1AnimationComplete) {
    let elapsedTime = currentTimeSeconds - line1AnimationStartTime;
    line1Progress = Math.min(1, elapsedTime / line1AnimationDuration);
    
    if (line1Progress >= 1) {
      line1AnimationComplete = true;
    }
  }
  
  // 只有在橫線動畫完成後才開始圓形動畫
  if (line1AnimationComplete) {
    // colorTransitionComplete 後圓形完全靜止，直接 blit 快取省去整個 binCount 迴圈
    if (colorTransitionComplete && barChartCached) {
      image(barChartGraphics, 0, 0);
    } else {
    // 更新每個直條圖的動畫
    for (let i = 0; i < binCount; i++) {
      if (mappedBins[i] != 0) {
        let anim = barAnimations[i];
        
        // 更新進度
        if (isAnimating) {
          let speedMultiplier = sin(currentTimeSeconds * anim.speedFrequency + anim.speedPhase) * 0.5 + 0.5;
          anim.currentSpeed = anim.baseSpeed * speedMultiplier;
          
          // 更新進度
          anim.progress += anim.currentSpeed;
          
          let sampledSquares = sampledSquaresByBin[i];
          let targetCount = sampledSquares.length;
          
          // 檢查是否可以添加新的圓形
          if (anim.nextCircleIndex < targetCount) {
            if (currentTimeSeconds - anim.lastCircleTime >= anim.nextCircleDelay) {
              let targetY = canvasHeight/4 - (anim.circles.length * circleSpacing);
              anim.circles.push({
                y: targetY - circleSize * circleStartHeightMultiplier,
                targetY: targetY,
                val: sampledSquares[anim.nextCircleIndex].val
              });
              anim.nextCircleIndex++;
              anim.nextCircleDelay = random(circleMinDelay, circleMaxDelay);
              anim.lastCircleTime = currentTimeSeconds;
            }
          }
          
          // 圓形全部到定位後不再需要更新位置
          if (!circlesFallingComplete) {
            for (let j = 0; j < anim.circles.length; j++) {
              let cir = anim.circles[j];
              if (Math.abs(cir.y - cir.targetY) < 0.5) {
                cir.y = cir.targetY;
              } else {
                cir.y = lerp(cir.y, cir.targetY, circleFallSpeed);
              }
            }
            
            for (let j = 0; j < anim.circles.length; j++) {
              let cir = anim.circles[j];
              if (Math.abs(cir.y - cir.targetY) > 0.1) {
                allCirclesInPlace = false;
              }
            }
            
            if (anim.nextCircleIndex < targetCount) {
              allCirclesInPlace = false;
              allCirclesGenerated = false;
            }
          }
        }
        
        // 繪製圓形
        let x = marginWidth + i * binWidth + binWidth/2;
        strokeWeight(1);
        
        if (colorTransitionComplete) {
          for (let j = 0; j < anim.circles.length; j++) {
            let cir = anim.circles[j];
            fill(cir.val);
            stroke(cir.val);
            circle(x, cir.y + offsetHeight, circleSize);
          }
        } else if (circlesFallingComplete) {
          let elapsedTime = currentTimeSeconds - colorTransitionStartTime;
          let progress = elapsedTime / colorTransitionDuration;
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
            fill(circleColor);
            stroke(circleColor);
            circle(x, cir.y + offsetHeight, circleSize);
          }
        } else {
          fill(175);
          stroke(175);
          for (let j = 0; j < anim.circles.length; j++) {
            let cir = anim.circles[j];
            circle(x, cir.y + offsetHeight, circleSize);
          }
        }
        } else {
          barAnimations[i].progress = 2;
        }
    }

    // colorTransitionComplete 後第一次進入：建立圓形靜態快取
    if (colorTransitionComplete && !barChartCached) {
      if (!barChartGraphics) {
        barChartGraphics = createGraphics(twoCanvasWidth, canvasHeight);
      }
      barChartGraphics.clear();
      for (let i = 0; i < binCount; i++) {
        if (mappedBins[i] != 0) {
          let anim = barAnimations[i];
          let x = marginWidth + i * binWidth + binWidth/2;
          barChartGraphics.strokeWeight(1);
          for (let j = 0; j < anim.circles.length; j++) {
            let cir = anim.circles[j];
            barChartGraphics.fill(cir.val);
            barChartGraphics.stroke(cir.val);
            barChartGraphics.circle(x, cir.y + offsetHeight, circleSize);
          }
        }
      }
      barChartCached = true;
    }
    } // end of non-cached branch
  }
  
  fill(175);
  stroke(0);
  
  // 繪製第一條橫線（帶動畫）
  strokeWeight(1);
  stroke(0);
  
  if (!line1AnimationComplete) {
    line1Progress = Math.min(1, (currentTimeSeconds - line1AnimationStartTime) / line1AnimationDuration);
    
    let easedProgress = 1 - Math.pow(1 - line1Progress, 3);
    
    let lineEndX = marginWidth + (twoCanvasWidth - marginWidth * 2) * easedProgress;
    line(marginWidth, canvasHeight/4 + circleSize/2 + offsetHeight, lineEndX, canvasHeight/4 + circleSize/2 + offsetHeight);
    
    if (line1Progress >= 1) {
      line1AnimationComplete = true;
    }
  } else {
    line(marginWidth, canvasHeight/4 + circleSize/2 + offsetHeight, twoCanvasWidth - marginWidth, canvasHeight/4 + circleSize/2 + offsetHeight);
  }
  
  // 更新第一個動畫的完成狀態
  if (!circlesFallingComplete && allCirclesInPlace && allCirclesGenerated) {
    let reallyAllInPlace = true;
    for (let i = 0; i < binCount; i++) {
      if (mappedBins[i] != 0) {
        let anim = barAnimations[i];
        let targetCount = sampledSquaresByBin[i].length;
        
        if (anim.circles.length < targetCount || anim.nextCircleIndex < targetCount) {
          reallyAllInPlace = false;
          break;
        }
        
        for (let j = 0; j < anim.circles.length; j++) {
          let cir = anim.circles[j];
          if (Math.abs(cir.y - cir.targetY) > 0.05) {
            reallyAllInPlace = false;
            break;
          }
        }
        
        if (!reallyAllInPlace) break;
      }
    }
    
    if (reallyAllInPlace) {
      circlesFallingComplete = true;
      colorTransitionStartTime = currentTimeSeconds;
    }
  }
  
  // 檢查顏色轉換是否完成
  if (circlesFallingComplete && !colorTransitionComplete) {
    if (currentTimeSeconds - colorTransitionStartTime >= colorTransitionDuration) {
      colorTransitionComplete = true;
      firstAnimationComplete = true;
      pauseStartTime = currentTimeSeconds;
    }
  }
  
  // 檢查停頓是否完成
  if (colorTransitionComplete && !pauseComplete) {
    if (currentTimeSeconds - pauseStartTime >= pauseDuration) {
      pauseComplete = true;
    }
  }
  
  // 圖2
  if (pauseComplete) {
    // 更新第二條橫線動畫進度
    if (!line2AnimationComplete) {
      if (line2AnimationStartTime === 0) {
        line2AnimationStartTime = currentTimeSeconds;
      }
      
      let elapsedTime = currentTimeSeconds - line2AnimationStartTime;
      line2Progress = Math.min(1, elapsedTime / line2AnimationDuration);
      
      if (line2Progress >= 1) {
        line2AnimationComplete = true;
      }
    }
    
    // 只有在橫線動畫完成後才更新和繪製方塊
    if (line2AnimationComplete) {
      let expandedBinWidth = squareSize;

      if (!secondAnimationComplete) {
        // 動畫進行中：落定方塊立刻畫進 squaresGraphics；每幀先 image 快取再只畫移動中的方塊
        if (!squaresGraphics) {
          squaresGraphics = createGraphics(twoCanvasWidth, canvasHeight);
        }
        squaresGraphics.noStroke();
        let squareSpacing = maxCircleCount * circleSize / (cachedMaxExpandedHeight - 1);
        let allSquaresInPlace = true;

        for (let k = 0; k < expandedBinActiveIndices.length; k++) {
          let i = expandedBinActiveIndices[k];
          let anim = squareAnimations[i];
          let x = marginWidth + i * expandedBinWidth;

          // 已全部落定的 bin 直接跳過，不再進入任何迴圈
          if (anim.squareDone) continue;

            if (isAnimating) {
              let targetLength = expandedBins[i].length;
              if (anim.squares.length < targetLength) {
                if (currentTimeSeconds - anim.lastSquareTime >= anim.nextSquareDelay) {
                  let squareIndex = anim.squares.length;
                  let targetY = canvasHeight/2 - squareSize - (squareIndex * squareSpacing);
                  anim.squares.push({
                    y: canvasHeight/4 + circleSize/2,
                    targetY: targetY,
                    val: expandedBins[i][squareIndex].val,
                    startTime: currentTimeSeconds,
                    settled: false
                  });
                  anim.nextSquareDelay = random(squareMinDelay, squareMaxDelay);
                  anim.lastSquareTime = currentTimeSeconds;
                }
              }

              // 推進 settledCount：跳過已連續落定的前端方塊
              while (anim.settledCount < anim.squares.length && anim.squares[anim.settledCount].settled) {
                anim.settledCount++;
              }

              // 只從第一個未落定的方塊開始迭代
              // 方塊依序 push，若第 j 個還未到 hoverTime，第 j+1 以後更晚生成，可直接 break
              for (let j = anim.settledCount; j < anim.squares.length; j++) {
                let sq = anim.squares[j];
                if (currentTimeSeconds - sq.startTime < squareHoverTime) break;
                if (!sq.settled) {
                  let direction = sq.targetY < sq.y ? -1 : 1;
                  sq.y += direction * squareFallSpeed * 0.6 * deltaTime;
                  if (direction === -1 && sq.y <= sq.targetY) {
                    sq.y = sq.targetY;
                  } else if (direction === 1 && sq.y >= sq.targetY) {
                    sq.y = sq.targetY;
                  }
                }
                if (!sq.settled && Math.abs(sq.y - sq.targetY) <= 0.1) {
                  sq.y = sq.targetY;
                  sq.settled = true;
                  let gv = Math.max(0, Math.min(255, Math.floor(sq.val)));
                  let gctx = squaresGraphics.drawingContext;
                  gctx.fillStyle = `rgb(${gv},${gv},${gv})`;
                  gctx.fillRect(x, sq.y + offsetHeight, squareSize, squareSize);
                }
                if (!sq.settled && Math.abs(sq.y - sq.targetY) > 0.1) {
                  allSquaresInPlace = false;
                }
              }
              if (anim.squares.length < targetLength) {
                allSquaresInPlace = false;
              } else if (anim.settledCount >= anim.squares.length) {
                // 所有方塊都已生成且落定，標記此 bin 完成
                anim.squareDone = true;
              }
            }
        }

        image(squaresGraphics, 0, 0);

        // 移動中方塊渲染：halfRate 模式每 2 幀更新快取（省 fillRect），否則每幀直接繪製
        if (!movingSquaresGraphics) {
          movingSquaresGraphics = createGraphics(twoCanvasWidth, canvasHeight);
        }
        if (!movingSquaresHalfRate || frameCount % 2 === 0) {
          movingSquaresGraphics.clear();
          drawChart2MovingSquaresNativeBatched(movingSquaresGraphics.drawingContext);
        }
        image(movingSquaresGraphics, 0, 0);

        if (allSquaresInPlace) {
          secondAnimationComplete = true;
          secondGraphPauseStartTime = currentTimeSeconds;
          squaresCached = true;
        }

      } else {
        // 方塊全部靜止：下落階段已增量寫入 squaresGraphics，此處僅輸出快取
        if (!squaresCached) {
          if (!squaresGraphics) {
            squaresGraphics = createGraphics(twoCanvasWidth, canvasHeight);
          }
          squaresGraphics.clear();
          squaresGraphics.noStroke();
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
    
    // 繪製第二條橫線
    strokeWeight(1);
    stroke(0);
    
    if (!line2AnimationComplete) {
      let easedProgress = 1 - Math.pow(1 - line2Progress, 3);
      
      let lineEndX = marginWidth + (twoCanvasWidth - marginWidth * 2) * easedProgress;
      line(marginWidth, canvasHeight/2 + offsetHeight, lineEndX, canvasHeight/2 + offsetHeight);
    } else {
      line(marginWidth, canvasHeight/2 + offsetHeight, twoCanvasWidth - marginWidth, canvasHeight/2 + offsetHeight);
    }
  }
  
  // 圖2完成後的停頓和圖3
  if (secondAnimationComplete && !secondGraphPauseComplete) {
    // 注意：squaresGraphics 已在上方 if(line2AnimationComplete) else 分支輸出，此處不重複
    let expandedBinWidth = squareSize;

    strokeWeight(1);
    stroke(0);
    line(marginWidth, canvasHeight/2 + offsetHeight, twoCanvasWidth - marginWidth, canvasHeight/2 + offsetHeight);
    
    // 檢查停頓是否完成
    if (currentTimeSeconds - secondGraphPauseStartTime >= secondGraphPauseDuration) {
      secondGraphPauseComplete = true;
      thirdAnimationStartTime = currentTimeSeconds;
      
      // 為每個樣本分配預先生成的高斯目標位置，避免每輪都做大量隨機與 while 驗證
      let targetPoolOffset = floor(random(gaussianTargetPool.length));
      for (let i = 0; i < samples.length; i++) {
        samples[i].currentX = marginWidth + i % noiseWidth * squareSize;
        samples[i].currentY = canvasHeight/2 - marginHeight - squareSize;
        
        let ebI = samples[i].expandedBinIndex;
        let ebO = samples[i].expandedBinOffset;
        if (ebI !== undefined && squareAnimations[ebI] && squareAnimations[ebI].squares &&
            ebO < squareAnimations[ebI].squares.length) {
          let sq = squareAnimations[ebI].squares[ebO];
          samples[i].currentX = marginWidth + ebI * expandedBinWidth;
          samples[i].currentY = sq.y;
        } else {
          debugLog("未找到樣本 " + i + " 在圖2中的位置");
        }
        let pooledTarget = gaussianTargetPool[(targetPoolOffset + i) % gaussianTargetPool.length];
        samples[i].inFinalPosition = false;
        samples[i].targetX = pooledTarget.x;
        samples[i].targetY = pooledTarget.y;
      }
    }
  }
  
  // 圖3
  if (secondGraphPauseComplete) {
    // 第一階段：移動到高斯分布位置
    if (!gaussianPauseComplete) {
      if (!thirdAnimationComplete) {
        // 物理更新：只迭代未到位的樣本
        let allInFinalPosition = true;
        for (let i = 0; i < samples.length; i++) {
          if (!samples[i].inFinalPosition) {
            samples[i].currentX = lerp(samples[i].currentX, samples[i].targetX, gaussianMoveSpeed);
            samples[i].currentY = lerp(samples[i].currentY, samples[i].targetY, gaussianMoveSpeed);
            if (Math.abs(samples[i].currentX - samples[i].targetX) < 2 &&
                Math.abs(samples[i].currentY - samples[i].targetY) < 2) {
              samples[i].inFinalPosition = true;
              samples[i].currentX = samples[i].targetX;
              samples[i].currentY = samples[i].targetY;
            } else {
              allInFinalPosition = false;
            }
          }
        }
        // 渲染：native Canvas2D 分桶批次，取代逐個 p5 fill/square（快 ~10x）
        drawSamplesNativeBatched();
        if (allInFinalPosition) {
          thirdAnimationComplete = true;
          gaussianPauseStartTime = currentTimeSeconds;
        }
      } else {
        // 所有點已到定位，停頓中：建立快取後直接 image()
        if (!gaussianCached) {
          if (!gaussianGraphics) {
            gaussianGraphics = createGraphics(twoCanvasWidth, canvasHeight);
          }
          gaussianGraphics.clear();
          // 使用隨機順序繪製快取，與動畫中的亂序一致，避免靜止瞬間出現層序跳變
          const gCtx = gaussianGraphics.drawingContext;
          const gbuckets = Array.from({length: 256}, () => []);
          const gsz = squareSize;
          for (let i = 0; i < samples.length; i++) {
            const vi = Math.max(0, Math.min(255, Math.floor(samples[i].val)));
            gbuckets[vi].push(samples[i].currentX, samples[i].currentY + offsetHeight);
          }
          gCtx.save();
          gCtx.imageSmoothingEnabled = false;
          for (let k = 0; k < 256; k++) {
            const vi = shuffledViOrder[k];
            const pts = gbuckets[vi];
            if (pts.length === 0) continue;
            gCtx.fillStyle = `rgb(${vi},${vi},${vi})`;
            for (let p = 0; p < pts.length; p += 2) {
              gCtx.fillRect(pts[p], pts[p + 1], gsz, gsz);
            }
          }
          gCtx.restore();
          gaussianCached = true;
        }
        image(gaussianGraphics, 0, 0);

        if (currentTimeSeconds - gaussianPauseStartTime >= gaussianPauseDuration) {
          gaussianPauseComplete = true;
          gaussianCached = false;
          if (gaussianGraphics) gaussianGraphics.clear(); // 保留紋理供下次重用

          // 設置最終矩陣位置
          for (let i = 0; i < samples.length; i++) {
            let finalX = twoCanvasWidth/2 - imgWidth/2 + (samples[i].noiseX * squareSize);
            let finalY = canvasHeight/2 + (canvasHeight/2 - (noiseHeight*squareSize))/2 + thirdHeightOffset + (samples[i].noiseY * squareSize);
            samples[i].finalTargetX = finalX;
            samples[i].finalTargetY = finalY;
            samples[i].inFinalMatrixPosition = false;
          }
        }
      }
    }
    // 第二階段：移動到矩陣排列位置
    else if (!finalMatrixAnimationComplete) {
      let allInMatrixPosition = true;
      // 物理更新：只迭代未到位的樣本
      for (let i = 0; i < samples.length; i++) {
        if (!samples[i].inFinalMatrixPosition) {
          samples[i].currentX = lerp(samples[i].currentX, samples[i].finalTargetX, matrixMoveSpeed);
          samples[i].currentY = lerp(samples[i].currentY, samples[i].finalTargetY, matrixMoveSpeed);
          if (Math.abs(samples[i].currentX - samples[i].finalTargetX) < 1 &&
              Math.abs(samples[i].currentY - samples[i].finalTargetY) < 1) {
            samples[i].inFinalMatrixPosition = true;
            samples[i].currentX = samples[i].finalTargetX;
            samples[i].currentY = samples[i].finalTargetY;
          } else {
            allInMatrixPosition = false;
          }
        }
      }
      // 渲染：native Canvas2D 分桶批次
      drawSamplesNativeBatched();
      if (allInMatrixPosition) {
        finalMatrixAnimationComplete = true;
      }
    }
    // 最終階段：保持矩陣排列（使用緩存避免每幀重繪）
    else {
      if (!finalMatrixCached) {
        if (!finalMatrixGraphics) {
          finalMatrixGraphics = createGraphics(twoCanvasWidth, canvasHeight);
        }
        finalMatrixGraphics.clear();
        // 最終矩陣每格位置唯一不重疊，但仍用隨機順序與動畫階段保持一致
        const fCtx = finalMatrixGraphics.drawingContext;
        const fbuckets = Array.from({length: 256}, () => []);
        const fsz = squareSize;
        for (let i = 0; i < samples.length; i++) {
          const vi = Math.max(0, Math.min(255, Math.floor(samples[i].val)));
          fbuckets[vi].push(samples[i].currentX, samples[i].currentY + offsetHeight);
        }
        fCtx.save();
        fCtx.imageSmoothingEnabled = false;
        for (let k = 0; k < 256; k++) {
          const vi = shuffledViOrder[k];
          const pts = fbuckets[vi];
          if (pts.length === 0) continue;
          fCtx.fillStyle = `rgb(${vi},${vi},${vi})`;
          for (let p = 0; p < pts.length; p += 2) {
            fCtx.fillRect(pts[p], pts[p + 1], fsz, fsz);
          }
        }
        fCtx.restore();
        finalMatrixCached = true;
      }
      image(finalMatrixGraphics, 0, 0);
      
      if (!finalMatrixValuesPrinted) {
        let matrixValues = Array(noiseHeight).fill().map(() => Array(noiseWidth).fill(0));
        
        for (let i = 0; i < samples.length; i++) {
          let sample = samples[i];
          if (sample.noiseX >= 0 && sample.noiseX < noiseWidth && 
              sample.noiseY >= 0 && sample.noiseY < noiseHeight) {
            matrixValues[sample.noiseY][sample.noiseX] = sample.val;
          }
        }
        
        for (let y = 0; y < noiseHeight; y++) {
          for (let x = 0; x < noiseWidth; x++) {
            flattenedValues.push(matrixValues[y][x]);
          }
        }
        
        finalMatrixValuesPrinted = true;
        sendCompletionMessage();
      }
    }
  }
  
  pop();
}

// ========== 預分配格子模式 (preAllocated Mode) oneCanvas 函數 ==========

// 計算 4 列 × 2 欄的格子佈局（移除互動版的 Row 0 init_image 與 Row 5 QR code）
// 左欄：Step 1-4（order 0-3），右欄：Step 5-8（order 4-7）
function computePreAllocLayout() {
  let availH = canvasHeight - 90; // 保留底部 90px 給狀態文字
  // 高度計算：上邊距 + 下邊距（各 preAllocBorderMargin）+ 3 個列間距（preAllocGap）+ 4 列圖片
  let h = (availH - 2 * preAllocBorderMargin - 3 * preAllocGap) / 4;
  let w = h * 2 / 3; // 圖片寬高比 2:3

  let twoColW = 2 * w + preAllocGap; // 兩欄圖片 + 欄間距
  let twoColX = (oneCanvasWidth - twoColW) / 2; // 水平置中

  let slots = {};
  for (let row = 0; row < 4; row++) {
    let y = preAllocBorderMargin + row * (h + preAllocGap);
    slots[row]     = { x: twoColX,                    y, w, h }; // 左欄 order 0-3
    slots[row + 4] = { x: twoColX + w + preAllocGap,  y, w, h }; // 右欄 order 4-7
  }
  return { h, w, slots };
}

// 啟動指定格子（slotIdx 0-7）的溶解動畫（從灰底 → 目標圖片）
function startPreAllocDissolve(slotIdx, img) {
  if (!preAllocLayout) return;
  let slot = preAllocLayout.slots[slotIdx];
  if (!slot) return;

  let sw = Math.round(slot.w);
  let sh = Math.round(slot.h);

  // 縮放目標圖片至格子尺寸
  let targetImg = createImage(img.width, img.height);
  targetImg.copy(img, 0, 0, img.width, img.height, 0, 0, img.width, img.height);
  targetImg.resize(sw, sh);
  targetImg.loadPixels();

  // 取得前一格狀態（用於移動動畫起點 & 溶解初始畫面）
  const prevState = slotIdx > 0 ? preAllocDissolves[slotIdx - 1] : null;
  const prevSlot  = slotIdx > 0 ? preAllocLayout.slots[slotIdx - 1] : null;

  // 初始化 blended：
  //   slotIdx > 0 → 從前一步的最終圖片開始溶解（移動動畫結束後）
  //   slotIdx = 0 → 從灰色佔位格開始
  let blended = createImage(sw, sh);
  blended.loadPixels();
  if (prevState && prevState.targetImg && prevState.targetImg.pixels && prevState.targetImg.pixels.length > 0) {
    blended.pixels.set(prevState.targetImg.pixels);
  } else {
    for (let i = 0; i < blended.pixels.length; i += 4) {
      blended.pixels[i] = blended.pixels[i + 1] = blended.pixels[i + 2] = 230;
      blended.pixels[i + 3] = 255;
    }
  }
  blended.updatePixels();

  let bs = preAllocBlockSize;
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
    let u = Math.max(Math.random(), 1e-10);
    let v = Math.random();
    let z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    grayValues[i] = Math.max(0, Math.min(255, Math.round(128 + z * 60)));
  }

  let sortedByStart = Array.from({ length: total }, (_, i) => i).sort((a, b) => startTimes[a] - startTimes[b]);
  let sortedByEnd   = Array.from({ length: total }, (_, i) => i).sort((a, b) => grayEndTimes[a] - grayEndTimes[b]);

  preAllocDissolves[slotIdx] = {
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
    committed: false,
    initialDrawn: false,
    // ── 移動動畫狀態 ──
    // slotIdx > 0 時先執行 'moving'，完成後切換為 'dissolving'
    phase: prevState ? 'moving' : 'dissolving',
    moveStartTime: millis() / 1000.0,
    moveFromX: prevSlot ? prevSlot.x : slot.x,
    moveFromY: prevSlot ? prevSlot.y : slot.y,
    prevTargetImg: prevState ? prevState.targetImg : null
  };
}

function paintPreAllocBlockGray(state, bi) {
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

function paintPreAllocBlockFinal(state, bi) {
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

function advancePreAllocDissolve(state) {
  let t = state.globalTime;
  let dirty = false;
  while (state.nextGrayIdx < state.totalBlocks) {
    let bi = state.sortedByStart[state.nextGrayIdx];
    if (state.startTimes[bi] > t) break;
    dirty = paintPreAllocBlockGray(state, bi) || dirty;
    state.nextGrayIdx++;
  }
  while (state.nextFinalIdx < state.totalBlocks) {
    let bi = state.sortedByEnd[state.nextFinalIdx];
    if (state.grayEndTimes[bi] > t) break;
    dirty = paintPreAllocBlockFinal(state, bi) || dirty;
    state.nextFinalIdx++;
  }
  if (dirty) state.blended.updatePixels();
  if (state.remainingBlocks <= 0) state.done = true;
  return dirty;
}

// 繪製預分配格子模式的 oneCanvas
function drawOnePreAllocated() {
  push();
  translate(oneCanvasX, 0);

  if (!preAllocLayout) { pop(); return; }

  // 懶初始化離屏背景層
  if (!preAllocMainGraphics) {
    preAllocMainGraphics = createGraphics(oneCanvasWidth, canvasHeight);
    preAllocMainGraphics.noSmooth();
  }

  // 第一次（或畫布被清除後）：畫灰色佔位格與 Step 標籤
  // 同步寫入主畫布與離屏背景層，供移動動畫清底使用
  if (!preAllocGridInitialized) {
    const stepLabels = ['Step 1', 'Step 2', 'Step 3', 'Step 4',
                        'Step 5', 'Step 6', 'Step 7', 'Step 8'];
    const slots = preAllocLayout.slots;

    // ── 主畫布 ──
    fill(255); noStroke();
    rect(0, 0, oneCanvasWidth, canvasHeight);
    fill(230); noStroke();
    for (let order = 0; order <= 7; order++) {
      let sl = slots[order];
      rect(sl.x, sl.y, sl.w, sl.h);
    }
    fill(0); noStroke(); textSize(28);
    for (let order = 0; order <= 7; order++) {
      let sl = slots[order];
      let cy = sl.y + sl.h / 2;
      if (order <= 3) { textAlign(RIGHT, CENTER); text(stepLabels[order], sl.x - 50, cy); }
      else            { textAlign(LEFT,  CENTER); text(stepLabels[order], sl.x + sl.w + 50, cy); }
    }

    // ── 離屏背景層（同樣內容）──
    preAllocMainGraphics.background(255);
    preAllocMainGraphics.fill(230); preAllocMainGraphics.noStroke();
    for (let order = 0; order <= 7; order++) {
      let sl = slots[order];
      preAllocMainGraphics.rect(sl.x, sl.y, sl.w, sl.h);
    }
    preAllocMainGraphics.fill(0); preAllocMainGraphics.noStroke();
    preAllocMainGraphics.textSize(28);
    for (let order = 0; order <= 7; order++) {
      let sl = slots[order];
      let cy = sl.y + sl.h / 2;
      if (order <= 3) { preAllocMainGraphics.textAlign(RIGHT, CENTER); preAllocMainGraphics.text(stepLabels[order], sl.x - 50, cy); }
      else            { preAllocMainGraphics.textAlign(LEFT,  CENTER); preAllocMainGraphics.text(stepLabels[order], sl.x + sl.w + 50, cy); }
    }

    preAllocGridInitialized = true;
  }

  // ── 偵測是否有進行中的移動動畫 ──
  let hasMoving = false;
  for (let si in preAllocDissolves) {
    if (preAllocDissolves[si].phase === 'moving') { hasMoving = true; break; }
  }

  // 移動動畫期間：每幀先 blit 乾淨的背景層（清除上幀殘影），再疊上其他元素
  if (hasMoving) {
    image(preAllocMainGraphics, 0, 0);
  }

  let nowSec = millis() / 1000.0;

  // 記錄本幀需要在最後疊繪的移動中圖片（確保它在所有元素最上層）
  let movingImg = null, movingX = 0, movingY = 0, movingW = 0, movingH = 0;

  for (let slotIdx in preAllocDissolves) {
    let state = preAllocDissolves[slotIdx];
    let sl = state.slot;

    // ── 溶解完成 ──
    if (state.done) {
      if (!state.committed) {
        image(state.blended, sl.x, sl.y, sl.w, sl.h);
        // 同步更新離屏背景層，下次移動動畫清底時能顯示已完成的圖
        if (preAllocMainGraphics) {
          preAllocMainGraphics.image(state.blended, sl.x, sl.y, sl.w, sl.h);
        }
        state.committed = true;
      }
      continue;
    }

    // ── 移動動畫階段 ──
    if (state.phase === 'moving') {
      let elapsed = nowSec - state.moveStartTime;
      let t = Math.min(1.0, elapsed / preAllocMoveDuration);
      let easedT = smoothstep(t);
      let drawX = lerp(state.moveFromX, sl.x, easedT);
      let drawY = lerp(state.moveFromY, sl.y, easedT);

      if (state.prevTargetImg) {
        // 延後到迴圈結束後再繪，確保在最上層
        movingImg = state.prevTargetImg;
        movingX = drawX; movingY = drawY;
        movingW = sl.w;  movingH = sl.h;
      }

      if (t >= 1.0) {
        // 移動完成 → 切換為溶解階段
        state.phase = 'dissolving';
        state.globalTime = 0;
        state.lastFrameTime = nowSec;
      }
      continue;
    }

    // ── 溶解動畫階段 ──
    // 首幀立即顯示初始畫面（前一步圖片或灰底），不等第一個方塊觸發
    if (!state.initialDrawn) {
      image(state.blended, sl.x, sl.y, sl.w, sl.h);
      state.initialDrawn = true;
    }

    let dt = nowSec - state.lastFrameTime;
    state.lastFrameTime = nowSec;
    state.globalTime += dt;

    let dirty = advancePreAllocDissolve(state);
    if (dirty) {
      image(state.blended, sl.x, sl.y, sl.w, sl.h);
    }
  }

  // 移動中的圖片畫在最上層（避免被其他格子蓋住）
  if (movingImg) {
    image(movingImg, movingX, movingY, movingW, movingH);
  }

  pop();
}

function drawOneAnimation() {
  // 設置 oneCanvas（圖片溶解）繪製區域的偏移
  push();
  translate(oneCanvasX, 0);
  
  if (!oneImagesLoaded) {
    fill(0);
    textAlign(CENTER, CENTER);
    textSize(36);
    text("載入中...", oneCanvasWidth/2, canvasHeight/2);
    pop();
    return;
  }
  
  if (oneCurrentAnimationPhase === 'idle' || oneCurrentAnimationPhase === 'waiting') {
    if (!oneIdleCached) {
      // 僅第一次進入 idle：清除左側面板並直接繪製靜態內容到主畫布
      // 之後畫面保持不動，完全不清除、不重畫，節省每幀 2M+ 像素工作
      fill(255);
      noStroke();
      rect(0, 0, oneCanvasWidth, canvasHeight);
      if (!oneIsFirstTime && oneImgPrev) {
        image(oneImgPrev, 300, 145);
      }
      if (oneImgNow) {
        image(oneImgNow, 300, 1055);
      }
      drawOneDownArrow();
      oneIdleCached = true;
    }
    // 快取有效：什麼都不做，畫面內容自動保留在畫布上
    pop();
    return;
  }
  
  if (oneCurrentAnimationPhase !== 'animating') {
    pop();
    return;
  }
  
  // 動畫邏輯
  let current_time = currentTimeSeconds;
  let elapsedSinceLoad = current_time - oneLoadCompleteTime;
  
  if (!oneAnimationStarted) {
    if (elapsedSinceLoad >= oneStartDelay) {
      // 在動畫真正開始前的同一幀執行延遲初始化（loadPixels × 3 + 陣列配置）
      // 此時距圖片到達已過 oneStartDelay 秒，twoCanvas 有足夠時間先執行完當前幀
      if (oneNeedsParamsInit) {
        initializeOneAnimationParameters();
        oneNeedsParamsInit = false;
      }
      oneAnimationStarted = true;
      oneMoveUpStartTime = current_time;
    } else {
      // 第一張圖進來後常直接進 animating，此時尚無 idle 快取；延遲期間也要畫出圖片與箭頭
      if (!oneIdleCached) {
        fill(255);
        noStroke();
        rect(0, 0, oneCanvasWidth, canvasHeight);
        if (!oneIsFirstTime && oneImgPrev) {
          image(oneImgPrev, 300, 145);
        }
        if (oneImgNow) {
          image(oneImgNow, 300, 1055);
        }
        drawOneDownArrow();
        oneIdleCached = true;
      }
      pop();
      return;
    }
  }
  
  if (!oneMoveUpStarted) {
    // 向上移動階段：白底後先固定畫一張在下格 (1055)，再畫「複本」沿 y 上移，
    // 視覺上像疊一張往上飛，下圖始終保留，接著才進溶解
    let moveElapsed = current_time - oneMoveUpStartTime;
    let moveProgress = constrain(moveElapsed / oneMoveUpDuration, 0, 1);
    
    if (moveProgress >= 1) {
      oneMoveUpStarted = true;
      oneBlockAnimationStarted = true;
      // 移動動畫完成後，將下方圖片複製到上方：oneImgPrev = oneImgNow
      if (oneImgNow && oneImgPrev) {
        oneImgPrev.copy(oneImgNow, 0, 0, oneImgNow.width, oneImgNow.height, 0, 0, oneImgNow.width, oneImgNow.height);
        oneImgPrev.loadPixels();
        // 將更新後的 oneImgPrev 畫到上方位置（只做一次）
        image(oneImgPrev, 300, 145);
        debugLog('移動動畫完成，下方圖片已複製到上方');
      }
    } else {
      // 清除圖片欄位（x=300，y=145 到 y=1775，共 480×1630 px）
      fill(255);
      noStroke();
      rect(300, 145, 480, 1630);
      // 下格固定：始終顯示目前下方圖（上一張成品），不隨上移被清掉
      if (oneImgNow) {
        image(oneImgNow, 300, 1055);
      }
      if (!oneIsFirstTime && oneImgPrev) {
        image(oneImgPrev, 300, 145);
      }
      drawOneDownArrow();
      // 複本：同一張圖往上飛（疊在下圖之上）
      if (oneImgNow) {
        let yPos = lerp(1055, 145, smoothstep(moveProgress));
        image(oneImgNow, 300, yPos);
      }
    }
    
    pop();
    return;
  }
  
  if (!oneBlockAnimationStarted) {
    pop();
    return;
  }
  
  // 方塊溶解階段：
  // - oneImgPrev（上方）和箭頭已持久保留在畫布上，不重畫
  // - oneBlended（下方）只在畫素有變動時才上傳並繪製，減少 GPU 紋理上傳次數
  if (oneImgNow && oneImgNext) {
    let blendedDirty = advanceOneBlockTransitions();
    if (blendedDirty) {
      oneBlended.updatePixels();
      image(oneBlended, 300, 1055); // 只在內容改變時重畫
    }
  }
  
  // 檢查動畫是否完成
  if (oneRemainingBlocks <= 0) {
    // 溶解動畫完成後，將新圖片設置為當前下方圖片：oneImgNow = oneImgNext
    if (oneImgNow && oneImgNext) {
      oneImgNow.copy(oneImgNext, 0, 0, oneImgNext.width, oneImgNext.height, 0, 0, oneImgNext.width, oneImgNext.height);
    }
    oneImgNext = null;
    // 釋放 oneBlended（idle 期間不需要），允許 GC 回收 ~1.4MB pixel buffer
    // 下次動畫開始時 initializeOneAnimationParameters() 會重新建立
    oneBlended = null;
    oneCurrentAnimationPhase = 'idle';
    oneIsFirstTime = false;
    oneIdleCached = false; // 圖片已更新，讓快取失效
    debugLog("左側動畫完成！");
    pop();
    return;
  }
  
  if (oneBlockAnimationStarted) {
    if (oneLastFrameTime === 0) {
      oneLastFrameTime = currentTimeSeconds;
    }
    let dt = currentTimeSeconds - oneLastFrameTime;
    oneLastFrameTime = currentTimeSeconds;
    oneGlobalTime += dt;
  }
  
  pop();
} 

// 初始化倒數計時
function initializeCountdown() {
  debugLog('開始倒數計時:', countdownDuration, '秒');
  
  isCountdownActive = true;
  countdownStartTime = currentTimeSeconds;
  
  // 清空舊的倒數計時方塊陣列
  countdownSquares = [];
  currentBlinkingIndex = 0;
  lastFixedSquareCount = 0;
  countdownFixedRenderedCount = 0;
  if (!countdownFixedGraphics) {
    countdownFixedGraphics = createGraphics(canvasWidth, canvasHeight);
  }
  countdownFixedGraphics.clear();
  countdownFixedGraphics.noStroke();
  
  // 計算畫布外框能放多少個方塊
  let topSquares = Math.floor(canvasWidth / scale_factor);
  let rightSquares = Math.floor(canvasHeight / scale_factor);
  let bottomSquares = Math.floor(canvasWidth / scale_factor);
  let leftSquares = Math.floor(canvasHeight / scale_factor);
  
  // 每個方向都減1，避免轉角重疊
  totalCountdownSquares = (topSquares - 1) + (rightSquares - 1) + (bottomSquares - 1) + (leftSquares - 1);
  
  // 預先生成所有方塊的顏色和位置
  for (let i = 0; i < totalCountdownSquares; i++) {
    // let grayValue = constrain(randomGaussian(128, 60), 0, 255);
    let grayValue = constrain(128, 0, 255);
    let pos = calculateSquarePosition(i, topSquares, rightSquares, bottomSquares, leftSquares);
    
    countdownSquares.push({
      x: pos.x,
      y: pos.y,
      color: grayValue,
      visible: false,
      isFixed: false // 添加固定狀態屬性
    });
  }
  
  debugLog('倒數計時初始化完成，總方塊數:', totalCountdownSquares);
}

// 計算方塊在外框的位置（順時針）
function calculateSquarePosition(index, topSquares, rightSquares, bottomSquares, leftSquares) {
  let x, y;
  
  if (index < topSquares - 1) {
    // 上邊（不包含右上角）
    x = index * scale_factor;
    y = 0;
  } else if (index < topSquares - 1 + rightSquares - 1) {
    // 右邊（從右上角到右下角前一個）
    x = canvasWidth - scale_factor;
    y = (index - (topSquares - 1)) * scale_factor;
  } else if (index < topSquares - 1 + rightSquares - 1 + bottomSquares - 1) {
    // 下邊（從右下角到左下角前一個）
    x = canvasWidth - (index - (topSquares - 1) - (rightSquares - 1) + 1) * scale_factor;
    y = canvasHeight - scale_factor;
  } else {
    // 左邊（從左下角到左上角前一個）
    x = 0;
    y = canvasHeight - (index - (topSquares - 1) - (rightSquares - 1) - (bottomSquares - 1) + 1) * scale_factor;
  }
  
  return { x: x, y: y };
}

// 繪製倒數計時邊框
function drawCountdownBorder() {
  if (countdownSquares.length === 0) {
    return;
  }
  
  let elapsedTime = currentTimeSeconds - countdownStartTime;
  let progress = elapsedTime / countdownDuration;
  
  if (!isCountdownActive) {
    // 如果是手動模式且正在等待按鍵，顯示提示文字
    if (manualMode && waitingForKeypress) {
      fill(0);
      textAlign(CENTER, CENTER);
      textSize(36);
      let textY = canvasHeight - 60;
      text(`Step ${nowStep} / 8 is finish`, canvasWidth/4, textY);
      text(`Please change the paper`, canvasWidth*3/4, textY);
    }
    return;
  }
  
  // 計算應該已經固定顯示的方塊數量
  let fixedSquareCount;
  if (progress >= 1.0) {
    // 倒數計時完成，所有方塊都應該固定顯示
    fixedSquareCount = totalCountdownSquares;
    
    // 檢查是否需要執行完成動作（避免重複執行）
    if (isCountdownActive) {
      debugLog('倒數計時完成，準備清除方塊並開始下一步');
      // 立即清除所有方塊的顯示
      for (let i = 0; i < countdownSquares.length; i++) {
        countdownSquares[i].isFixed = false;
        countdownSquares[i].visible = false;
      }
      if (countdownFixedGraphics) {
        countdownFixedGraphics.clear();
      }
      countdownFixedRenderedCount = 0;
      // 手動將所有方塊位置塗白，避免左側面板（不被每幀清除）殘留像素
      fill(255);
      noStroke();
      for (let i = 0; i < countdownSquares.length; i++) {
        rect(countdownSquares[i].x, countdownSquares[i].y, scale_factor, scale_factor);
      }
      if (nowStep < 8) {
        isCountdownActive = false; // 標記倒數計時已完成
        let textY = canvasHeight - 60;
        if (manualMode) {
          // 手動模式：等待 Enter 鍵，不立即啟動下一步
          waitingForKeypress = true;
          fill(0);
          textAlign(CENTER, CENTER);
          textSize(36);
          text(`Step ${nowStep} / 8 is finish`, canvasWidth/4, textY);
          text(`Please change the paper`, canvasWidth*3/4, textY);
        } else {
          text(`Step ${nowStep} / 8 in progress ...`, canvasWidth/4, textY);
          text(`The next step will begin after 00:00`, canvasWidth*3/4, textY);
          debugLog("Start next step");
          sendStartMessage();
          startNewStep();
          drawCountdownBorder(); // 同幀補畫新一輪倒數，避免 clear() 後空白閃一下
        }
        return;
      } else {
        fill(0);
        textAlign(CENTER, CENTER);
        textSize(36);
        
        let textY = canvasHeight - 60;
        text(`All steps completed.`, canvasWidth/4, textY);
        text(`See you tomorrow!`, canvasWidth*3/4, textY);
      }
    }
  } else {
    // 根據進度計算應該固定的方塊數量
    fixedSquareCount = Math.floor(progress * totalCountdownSquares);
  }
  
  // 只更新新增固定的方塊（避免每幀從頭遍歷）
  for (let i = lastFixedSquareCount; i < fixedSquareCount && i < countdownSquares.length; i++) {
    countdownSquares[i].isFixed = true;
    countdownSquares[i].visible = true;
  }
  lastFixedSquareCount = fixedSquareCount;

  if (countdownFixedGraphics) {
    for (let i = countdownFixedRenderedCount; i < fixedSquareCount && i < countdownSquares.length; i++) {
      let square = countdownSquares[i];
      countdownFixedGraphics.fill(square.color, 255);
      countdownFixedGraphics.rect(square.x, square.y, scale_factor, scale_factor);
    }
    countdownFixedRenderedCount = fixedSquareCount;
    image(countdownFixedGraphics, 0, 0);
  }
  
  // 更新當前閃爍的方塊索引
  currentBlinkingIndex = fixedSquareCount;
  
  // 計算當前閃爍方塊的呼吸燈效果
  let breathingAlpha = 1.0; // 默認完全不透明
  if (currentBlinkingIndex < totalCountdownSquares && progress < 1.0) {
    // 計算當前方塊應該在什麼時間點固定
    let nextFixTime = countdownStartTime + ((currentBlinkingIndex + 1) / totalCountdownSquares) * countdownDuration;
    let timeUntilFix = nextFixTime - currentTimeSeconds;
    let totalTimeForThisSquare = countdownDuration / totalCountdownSquares;
    
    // 計算在分配給這個方塊的時間內的閃爍進度
    let blinkProgress = 1.0 - (timeUntilFix / totalTimeForThisSquare);
    
    // 在分配的時間內進行指定次數的閃爍
    let blinkCycle = (blinkProgress * blinkTimes) % 1.0;
    
    // 使用cosine波創建從不透明→透明→不透明的閃爍效果
    // cos(0) = 1 (不透明), cos(π) = -1 (透明), cos(2π) = 1 (不透明)
    let cosineWave = cos(blinkCycle * TWO_PI);
    breathingAlpha = map(cosineWave, -1, 1, 0.1, 1.0);
  }
  
  // 固定方塊改用緩存 graphics，只保留當前閃爍方塊即時繪製
  // 先畫白色清除前一幀殘影，再畫帶透明度的方塊（避免不清除畫布時的累積效果）
  noStroke();
  if (currentBlinkingIndex < countdownSquares.length && progress < 1.0) {
    let square = countdownSquares[currentBlinkingIndex];
    fill(255);
    rect(square.x, square.y, scale_factor, scale_factor); // 清除殘影
    fill(square.color, breathingAlpha * 255);
    rect(square.x, square.y, scale_factor, scale_factor); // 繪製當前透明度
  }
  
  // 在螢幕下方顯示倒數時間提示
  if (progress < 1.0) {
    let remainingTime = countdownDuration - elapsedTime;
    if (remainingTime > 0) {
      let minutes = Math.floor(remainingTime / 60);
      let seconds = Math.floor(remainingTime % 60);
      
      // 格式化為兩位數字符串
      let minutesStr = minutes.toString().padStart(2, '0');
      let secondsStr = seconds.toString().padStart(2, '0');
      
      fill(0);
      textAlign(CENTER, CENTER);
      textSize(36);
      
      let textY = canvasHeight - 60;
      text(`Step ${nowStep} / 8 in progress ...`, canvasWidth/4, textY);
      text(`The next step will begin after ${minutesStr}:${secondsStr}`, canvasWidth*3/4, textY);
    }
  }
}

function keyPressed() {
  if (manualMode && waitingForHandshakeKeypress && (key === 'Enter' || keyCode === ENTER)) {
    waitingForHandshakeKeypress = false;
    hasMainSequenceStarted = true;
    debugLog('Enter 鍵按下，開始執行主序列');
    sendStartMessage();
    globalWaitingState = true;
    imageWaitingState = true;
    noiseWaitingState = true;
    startNewStep();
  } else if (manualMode && waitingForKeypress && (key === 'Enter' || keyCode === ENTER)) {
    waitingForKeypress = false;
    debugLog('Enter 鍵按下，開始下一步');
    sendStartMessage();
    startNewStep();
  }
}

// function mousePressed() {
//   window.resizeTo(2160, 1920);
//   let fs = fullscreen();
//   if (!fs) {
//       fullscreen(true);
//   } else {
//       fullscreen(false);
//   }
// }