let sampleRangeMin = -3;     // 資料下界
let sampleRangeMax = 3;      // 資料上界

let canvasHeight = 1920;
let canvasWidth = 1080;
let marginHeight = 96;
// let marginHeight = 80;
let marginWidth = canvasWidth / 6;
let offsetHeight = -30;
let imgHeight = canvasHeight/2 - marginHeight*2;       // 右側影像高度
let imgWidth = imgHeight*9/16;        // 右側影像寬度
let histogramHeight = canvasHeight/4 - marginHeight*1.5;  // 新增：直方圖的高度
let scale_factor = 24; // 2, 3, 4, 6, 8, 12, 24
// let scale_factor = 10;
let noiseWidth = imgWidth / scale_factor;        // 右側影像寬度
let noiseHeight = imgHeight / scale_factor;       // 右側影像高度

let originalSampleCount = 1000;  // 移除，未使用
// fixedBins數量24, '30'
let fixedBins = [0, 2, 8, 10, 15, 19, 25, 30, 35, 40, 45, 53, 64, 77, 87, 77, 92, 64, 46, 40, 35, 30, 27, 23, 17, 13, 10, 6, 3, 2];
let binCount = fixedBins.length;
let totalSampleCount = fixedBins.reduce(getSum);

let samples = [];
let mappedBins = [];
let expandedBins = [];
let squaresPerExpandedBin = [];
let squareSize = scale_factor;;

let flattenedValues = [];

// 動畫相關變數
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

// 所有停頓相關參數
let pauseDuration = 0.5;
let pauseStartTime = 0;
let pauseComplete = false;
let secondGraphPauseDuration = 0.5;
let secondGraphPauseStartTime = 0;
let secondGraphPauseComplete = false;
let gaussianPauseDuration = 1;
let gaussianPauseStartTime = 0;
let gaussianPauseComplete = false;

// 橫線動畫相關變數
let line1Progress = 0;
let line1AnimationStartTime = 0;
let line1AnimationDuration = 1.0;
let line1AnimationComplete = false;

let line2Progress = 0;
let line2AnimationStartTime = 0;
let line2AnimationDuration = 1.0;
let line2AnimationComplete = false;

// 圓形的獨立參數
let circleFallSpeed = 0.2;
let circleMinDelay = 0.02;
let circleMaxDelay = 0.15;
let circleStartHeightMultiplier = 8;

// 方形的獨立參數
let squareFallSpeed = 1.5;
let squareMinDelay = 0.05;
let squareMaxDelay = 0.08;
let squareHoverTime = 0.04;
let squareMoveSpeed = 0.05;  // 移除，未使用

// 圖3的移動速度參數
let gaussianMoveSpeed = 0.05;
let matrixMoveSpeed = 0.05;

// 圖3的圓角矩形參數
let cornerRadius = 150;
let gaussianSigmaX = 0.2;
let gaussianSigmaY = 0.2;
let finalMatrixAnimationComplete = false;
let finalMatrixValuesPrinted = false;

// 為每個直條圖創建獨立的動畫參數
let barAnimations = [];
let squareAnimations = [];  // 為第二張圖添加動畫參數

// 全局變數
let socket;
let hasReceivedData = false;
let resetCanvas = false;

function setupBarAnimation() {
  if (barAnimations) {
    // 清理 Sample 物件的引用
    barAnimations.forEach(sample => {
      for (let prop in sample) {
        barAnimations[prop] = null;
      }
    });
    barAnimations.length = 0;
  }
  barAnimations = [];

  if (squareAnimations) {
    // 清理 Sample 物件的引用
    squareAnimations.forEach(sample => {
      for (let prop in sample) {
        squareAnimations[prop] = null;
      }
    });
    squareAnimations.length = 0;
  }
  squareAnimations = [];  // 初始化第二張圖的動畫參數
  
  // 初始化第一張圖的動畫參數
  for (let i = 0; i < binCount; i++) {
    let baseSpeed = 0.05;
    let phase = random(0, TWO_PI);
    let frequency = random(2, 4);
    let speedPhase = random(0, TWO_PI);
    let speedFrequency = random(1, 2);
    
    barAnimations.push({
      progress: 0,
      baseSpeed: baseSpeed,
      currentSpeed: 0,
      phase: phase,
      frequency: frequency,
      speedPhase: speedPhase,
      speedFrequency: speedFrequency,
      circles: [],
      nextCircleIndex: 0,
      nextCircleDelay: random(circleMinDelay, circleMaxDelay),
      lastCircleTime: 0
    });
  }

  // 初始化第二張圖的動畫參數 - 使用相同的參數以保持同步
  let binsPerOriginalBin = (canvasWidth - marginWidth*2) / scale_factor / binCount;
  let totalExpandedBins = binCount * binsPerOriginalBin;
  for (let i = 0; i < totalExpandedBins; i++) {
    let baseSpeed = 0.05;
    let phase = random(0, TWO_PI);
    let frequency = random(2, 4);
    let speedPhase = random(0, TWO_PI);
    let speedFrequency = random(1, 2);
    
    squareAnimations.push({
      progress: 0,
      baseSpeed: baseSpeed,
      currentSpeed: 0,
      phase: phase,
      frequency: frequency,
      speedPhase: speedPhase,
      speedFrequency: speedFrequency,
      squares: [],
      nextSquareIndex: 0,
      nextSquareDelay: random(squareMinDelay, squareMaxDelay),
      lastSquareTime: 0
    });
  }
}

function getSum(total, num) {
    return total + num;
}

class Sample{
  constructor(val) {
    this.val = val;
    this.sortedIdx = undefined;
    this.sortedX= undefined;
    this.sortedY= undefined;
    this.noiseIdx= undefined;
    this.noiseX= undefined;
    this.noiseY= undefined;
    this.targetNoiseX = undefined;
    this.targetNoiseY = undefined;
    this.inFinalPosition = false;
    this.currentX = undefined;
    this.currentY = undefined;
    this.finalTargetX = undefined;  // 最終矩陣位置X
    this.finalTargetY = undefined;  // 最終矩陣位置Y
    this.inFinalMatrixPosition = false;  // 是否到達最終矩陣位置
  }
}

function initializeData() {
  // 動畫相關變數
  isAnimating = true;
  firstAnimationComplete = false;
  circlesFallingComplete = false;
  colorTransitionComplete = false;
  colorTransitionStartTime = 0;
  secondAnimationComplete = false;
  thirdAnimationStartTime = 0;
  thirdAnimationComplete = false;

  // 所有停頓相關參數
  pauseStartTime = 0;
  pauseComplete = false;
  secondGraphPauseStartTime = 0;
  secondGraphPauseComplete = false;
  gaussianPauseStartTime = 0;
  gaussianPauseComplete = false;

  // 橫線動畫相關變數
  line1Progress = 0;
  line1AnimationStartTime = 0;
  line1AnimationComplete = false;

  line2Progress = 0;
  line2AnimationStartTime = 0;
  line2AnimationComplete = false;

  finalMatrixAnimationComplete = false;
  finalMatrixValuesPrinted = false;

  // 清空之前的數據
  if (samples) {
    // 清理 Sample 物件的引用
    samples.forEach(sample => {
      for (let prop in sample) {
        sample[prop] = null;
      }
    });
    samples.length = 0;
  }
  samples = [];

  if (mappedBins) {
    mappedBins.forEach((_, index) => mappedBins[index] = null);
    mappedBins.length = 0;
  }
  mappedBins = [];

  if (expandedBins) {
    expandedBins.forEach(bin => {
      if (bin) {
        bin.forEach((_, index) => bin[index] = null);
        bin.length = 0;
      }
    });
    expandedBins.length = 0;
  }
  expandedBins = [];

  if (squaresPerExpandedBin) {
    squaresPerExpandedBin.forEach((_, index) => squaresPerExpandedBin[index] = null);
    squaresPerExpandedBin.length = 0;
  }
  squaresPerExpandedBin = [];

  if (flattenedValues) {
    flattenedValues.forEach((_, index) => flattenedValues[index] = null);
    flattenedValues.length = 0;
  }
  flattenedValues = [];

  // 清理動畫相關的數組
  if (barAnimations) {
    barAnimations.forEach(anim => {
      if (anim.circles) {
        anim.circles.forEach((_, index) => anim.circles[index] = null);
        anim.circles.length = 0;
      }
    });
    barAnimations.length = 0;
  }

  if (squareAnimations) {
    squareAnimations.forEach(anim => {
      if (anim.squares) {
        anim.squares.forEach((_, index) => anim.squares[index] = null);
        anim.squares.length = 0;
      }
    });
    squareAnimations.length = 0;
  }

  // 重置其他相關變數
  totalSampleCount = fixedBins.reduce(getSum);
  
  // 計算 binsPerOriginalBin
  let binsPerOriginalBin = (canvasWidth - marginWidth*2) / scale_factor / binCount;
  
  // 產生原始資料
  for (let i = 0; i < binCount; i++) {
    let count = round(noiseWidth*noiseHeight * (fixedBins[i] / totalSampleCount));
    // 計算該 bin 的數值範圍
    let binLow = map(i, 0, binCount, sampleRangeMin, sampleRangeMax);
    let binHigh = map(i + 1, 0, binCount, sampleRangeMin, sampleRangeMax);
    mappedBins.push(count)
    for (let j = 0; j < count; j++) {
      if (samples.length == noiseWidth*noiseHeight) {
        mappedBins[mappedBins.length-1]--;
      } else {
        let val = random(binLow, binHigh); // 均勻抽樣
        val = map(val, sampleRangeMin, sampleRangeMax, 0, 255);
        let sample = new Sample(val);
        samples.push(sample);
      }
    }
  }

  // 若重建的 sample 數量超過或不足，做補足或截斷
  if (samples.length < noiseWidth*noiseHeight) {
    let deficit = noiseWidth*noiseHeight - samples.length;
    // 補足不足的部分（隨機選一個 bin產生均勬的值）
    for (let i = 0; i < deficit; i++) {
      let binIndex = floor(random(0, binCount));
      mappedBins[binIndex]++;
      let binLow = map(binIndex, 0, binCount, sampleRangeMin, sampleRangeMax);
      let binHigh = map(binIndex + 1, 0, binCount, sampleRangeMin, sampleRangeMax);
      let val = random(binLow, binHigh); // 均勻抽樣
      val = map(val, sampleRangeMin, sampleRangeMax, 0, 255);
      let sample = new Sample(val);
      samples.push(sample);
    }
  }

  samples = shuffle(samples);
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
    
    // 為每個原始 bin 創建 binsPerOriginalBin 個新的 bin
    for (let j = 0; j < binsPerOriginalBin; j++) {
      let newBinCount = squaresPerNewBin;
      // 根據 bin 的位置決定餘數的分配
      if (i < binCount/2) {  // 前半段的 bin
        if (j === binsPerOriginalBin - 1) {
          newBinCount += remainder;  // 將餘數加到最後一個新 bin
        }
      } else {  // 後半段的 bin
        if (j === 0) {
          newBinCount += remainder;  // 將餘數加到第一個新 bin
        }
      }
      squaresPerExpandedBin.push(newBinCount);
    }
  }
  
  // 重新組織 samples 到展開後的 bins
  let sampleIndex = 0;
  for (let i = 0; i < binCount; i++) {
    let squaresInOriginalBin = mappedBins[i];
    let squaresPerNewBin = Math.floor(squaresInOriginalBin / binsPerOriginalBin);
    let remainder = squaresInOriginalBin % binsPerOriginalBin;
    
    let expandedBinStart = i * binsPerOriginalBin;
    
    // 分配樣本到新的 bins
    for (let j = 0; j < squaresInOriginalBin; j++) {
      let targetBin;
      if (i < binCount/2) {  // 前半段的 bin
        // 計算目標 bin：如果超過了基本配額的總和，就放到最後一個 bin
        targetBin = Math.min(Math.floor(j / squaresPerNewBin), binsPerOriginalBin - 1);
      } else {  // 後半段的 bin
        // 先填滿第一個 bin（包含餘數），然後再平均分配到其他 bin
        if (j < squaresPerNewBin + remainder) {
          targetBin = 0;
        } else {
          targetBin = Math.min(Math.floor((j - remainder) / squaresPerNewBin), binsPerOriginalBin - 1);
        }
      }
      
      if (!expandedBins[expandedBinStart + targetBin]) {
        expandedBins[expandedBinStart + targetBin] = [];
      }
      expandedBins[expandedBinStart + targetBin].push(samples[sampleIndex]);
      sampleIndex++;
    }
  }

  // 計算最大高度
  let histogramWidth = canvasWidth - marginWidth * 2;
  let binWidth = histogramWidth / binCount;
  
  // 計算binWidth和circleSize
  binWidth = (canvasWidth - marginWidth * 2) / binCount;
  circleSize = binWidth;
  
  // 計算固定的圓形間距
  circleSpacing = circleSize;  // 設定圓形間距等於圓形大小，使圓形上下切齊
  maxCircleCount = floor(histogramHeight / circleSpacing) + 1;

  // 為每個樣本添加目標位置屬性（用於圖3的動畫）
  for (let i = 0; i < samples.length; i++) {
    samples[i].targetNoiseX = samples[i].noiseX;
    samples[i].targetNoiseY = samples[i].noiseY;
    samples[i].inFinalPosition = false;
  }
  
  setupBarAnimation();
}

function mousePressed() {
  window.resizeTo(1080, 1920);
  let fs = fullscreen();
  if (!fs) {
    fullscreen(true);
  } else {
    fullscreen(false);
  }
}

function setup() {
  createCanvas(canvasWidth, canvasHeight);
  frameRate(60);
  
  // 初始化 Socket.IO
  socket = io();
  
  // 監聽新數據
  socket.on('updateBins', (newFixedBins) => {
    console.log('Received new data');
    
    // // 更新數據
    fixedBins = newFixedBins;

    // 呼叫初始化函數
    initializeData();
    
    // 標記已收到數據
    hasReceivedData = true;
    resetCanvas = true;
  });
}

function draw() {
  if (!hasReceivedData) {
    // 如果還沒有收到數據，顯示等待訊息
    background(255);
    textSize(48);
    textAlign(CENTER, CENTER);
    fill(100);
    noStroke();
    // text('Waiting ...', width/2, height/2);
    text(windowWidth.toString()+' x '+windowHeight.toString(), width/2, height/2);
  } else if (resetCanvas) {
    background(255);
    resetCanvas = false;
  } else {
    background(255);
    
    // 圖1---- 固定分箱直條圖與平滑曲線 ----
    let histogramWidth = canvasWidth - marginWidth * 2;
    
    // 修改：使用新的 histogramHeight
    let maxCount = max(mappedBins);
    let binWidth = histogramWidth / binCount;
    
    // 先初始化檢查變數
    let allCirclesInPlace = true;  // 檢查所有圓形是否都到達目標位置
    let allCirclesGenerated = true;  // 檢查所有圓形是否都已生成
    
    // 在第一幀就開始橫線動畫
    if (line1AnimationStartTime === 0) {
      line1AnimationStartTime = frameCount / 60;
    }
    
    // 更新橫線動畫進度（但不繪製）
    if (!line1AnimationComplete) {
      let curTime = frameCount / 60;
      let elapsedTime = curTime - line1AnimationStartTime;
      line1Progress = Math.min(1, elapsedTime / line1AnimationDuration);
      
      if (line1Progress >= 1) {
        line1AnimationComplete = true;
      }
    }
    
    // 只有在橫線動畫完成後才開始圓形動畫
    if (line1AnimationComplete) {
      // 更新每個直條圖的動畫
      for (let i = 0; i < binCount; i++) {
        if (mappedBins[i] != 0) {
          let anim = barAnimations[i];
          
          // 更新進度
          if (isAnimating) {
            // 更新當前速度
            let speedMultiplier = sin(frameCount * anim.speedFrequency + anim.speedPhase) * 0.5 + 0.5;
            anim.currentSpeed = anim.baseSpeed * speedMultiplier;
            
            // 更新進度
            anim.progress += anim.currentSpeed;
            
            // 計算這個bin的總高度
            let totalHeight = histogramHeight * (mappedBins[i] / maxCount);
            
            // 計算在不重疊的情況下可以放置的圓形數量
            let maxCircles = floor(totalHeight / circleSpacing) + 1;
            
            // 找出這個bin中的所有方塊，並根據最大圓形數量進行採樣
            let squaresInBin = samples.filter(s => s.sortedX === i);
            let step = squaresInBin.length / maxCircles;
            let sampledSquares = [];
            for (let j = 0; j < squaresInBin.length; j += step) {
              let idx = round(j);
              sampledSquares.push(squaresInBin[idx]);
              if (sampledSquares.length >= maxCircles)break;
            }
            let targetCount = sampledSquares.length;
            
            // 檢查是否可以添加新的圓形
            if (anim.nextCircleIndex < targetCount) {
              // 檢查是否已經過了足夠的延遲時間
              let currentTime = frameCount / 60;  // 將幀數轉換為秒數
              if (currentTime - anim.lastCircleTime >= anim.nextCircleDelay) {
                let targetY = canvasHeight/4 - (anim.circles.length * circleSpacing);  // 修改這裡
                anim.circles.push({
                  y: targetY - circleSize * circleStartHeightMultiplier,
                  targetY: targetY,
                  val: sampledSquares[anim.nextCircleIndex].val
                });
                anim.nextCircleIndex++;
                anim.nextCircleDelay = random(circleMinDelay, circleMaxDelay);  // 使用圓形的延遲時間範圍
                anim.lastCircleTime = currentTime;  // 更新最後一個圓形出現的時間
              }
            }
            
            // 更新每個圓形的位置
            for (let j = 0; j < anim.circles.length; j++) {
              let cir = anim.circles[j];
              cir.y = lerp(cir.y, cir.targetY, circleFallSpeed);  // 使用圓形的落下速度
            }
            
            // 檢查這個 bin 的圓形是否都到位
            for (let j = 0; j < anim.circles.length; j++) {
              let cir = anim.circles[j];
              if (Math.abs(cir.y - cir.targetY) > 0.1) {  // 如果還有圓形未到達目標位置
                allCirclesInPlace = false;
              }
            }
            
            // 檢查是否所有圓形都已經生成
            if (anim.nextCircleIndex < targetCount) {
              allCirclesInPlace = false;
              allCirclesGenerated = false;
            }
          }
          
          // 繪製圓形（調整繪製位置以對齊方塊）
          let x = marginWidth + i * binWidth + binWidth/2;
          
          for (let j = 0; j < anim.circles.length; j++) {
            let cir = anim.circles[j];
            
            // 根據位置和時間計算顏色
            let circleColor = 175;  // 預設灰色
            
            // 只有在所有圓形都落下完成後才開始變色
            if (circlesFallingComplete && !colorTransitionComplete) {
              let curTime = frameCount / 60;
              let elapsedTime = curTime - colorTransitionStartTime;
              let progress = elapsedTime / colorTransitionDuration;
              
              // 修改計算方式，使其嚴格從左到右變化
              // 首先計算每個bin的權重，左邊的bin權重小，右邊的bin權重大
              let binWeight = i / (binCount - 1);  // 範圍從0到1
              
              // 計算這個圓形在其bin內的相對位置（從上到下）
              let circlePositionInBin = j / Math.max(1, anim.circles.length - 1);  // 範圍從0到1，上方的圓形索引小，下方的圓形索引大
              
              // 結合bin權重和圓形位置，計算最終的閾值
              // 這裡我們優先考慮bin的位置（左右），其次才考慮圓形在bin內的位置（上下）
              let startThreshold = binWeight * 0.9 + circlePositionInBin * 0.1;  // 90%的權重給bin位置，10%給圓形位置
              
              if (progress > startThreshold) {
                // 計算個別圓形的變色進度，使用ease out效果
                let normalizedProgress = (progress - startThreshold) / (1 - startThreshold);
                // 使用ease out函數：1 - (1 - x)^3
                let easedProgress = 1 - Math.pow(1 - Math.min(1, normalizedProgress * 1.5), 3);
                circleColor = lerp(175, cir.val, easedProgress);
              }
            } else if (colorTransitionComplete) {
              circleColor = cir.val;
            }
            
            fill(circleColor);
            stroke(circleColor);
            strokeWeight(1);
            circle(x, cir.y + offsetHeight, circleSize);
          }
        } else {
          barAnimations[i].progress = 2;
        }
      }
    }
    
    fill(175);
    stroke(0);
    
    // 繪製第一條橫線（帶動畫）- 移到圓形繪製之後
    strokeWeight(1);
    stroke(0);
    
    if (!line1AnimationComplete) {
      let curTime = frameCount / 60;
      let elapsedTime = curTime - line1AnimationStartTime;
      line1Progress = Math.min(1, elapsedTime / line1AnimationDuration);
      
      // 使用ease-out效果
      let easedProgress = 1 - Math.pow(1 - line1Progress, 3);
      
      // 繪製部分橫線
      let lineEndX = marginWidth + (canvasWidth - marginWidth * 2) * easedProgress;
      line(marginWidth, canvasHeight/4 + circleSize/2 + offsetHeight, lineEndX, canvasHeight/4 + circleSize/2 + offsetHeight);  // 修改這裡
      
      if (line1Progress >= 1) {
        line1AnimationComplete = true;
      }
    } else {
      // 橫線動畫完成後，繪製完整的橫線
      line(marginWidth, canvasHeight/4 + circleSize/2 + offsetHeight, canvasWidth - marginWidth, canvasHeight/4 + circleSize/2 + offsetHeight);  // 修改這裡
    }
    
    // 更新第一個動畫的完成狀態
    if (!circlesFallingComplete && allCirclesInPlace && allCirclesGenerated) {
      // 再次確認所有圓形都已經到位
      let reallyAllInPlace = true;
      for (let i = 0; i < binCount; i++) {
        if (mappedBins[i] != 0) {
          let anim = barAnimations[i];
          // 確認所有圓形都已生成
          let squaresInBin = samples.filter(s => s.sortedX === i);
          let maxCircles = floor(histogramHeight * (mappedBins[i] / maxCount) / circleSpacing) + 1;
          let step = squaresInBin.length / maxCircles;
          let sampledSquares = [];
          for (let j = 0; j < squaresInBin.length; j += step) {
            let idx = round(j);
            sampledSquares.push(squaresInBin[idx]);
            if (sampledSquares.length >= maxCircles) break;
          }
          let targetCount = sampledSquares.length;
          
          if (anim.circles.length < targetCount || anim.nextCircleIndex < targetCount) {
            reallyAllInPlace = false;
            break;
          }
          
          // 確認所有圓形都已到達目標位置
          for (let j = 0; j < anim.circles.length; j++) {
            let cir = anim.circles[j];
            if (Math.abs(cir.y - cir.targetY) > 0.05) {  // 使用更嚴格的閾值
              reallyAllInPlace = false;
              break;
            }
          }
          
          if (!reallyAllInPlace) break;
        }
      }
      
      if (reallyAllInPlace) {
        circlesFallingComplete = true;
        colorTransitionStartTime = frameCount / 60;  // 記錄開始顏色轉換的時間
      }
    }
    
    // 檢查顏色轉換是否完成
    if (circlesFallingComplete && !colorTransitionComplete) {
      let curTime = frameCount / 60;
      if (curTime - colorTransitionStartTime >= colorTransitionDuration) {
        colorTransitionComplete = true;
        firstAnimationComplete = true;  // 設置第一個動畫完成
        pauseStartTime = curTime;  // 開始計算停頓時間
      }
    }
    
    // 檢查停頓是否完成
    if (colorTransitionComplete && !pauseComplete) {
      let curTime = frameCount / 60;
      if (curTime - pauseStartTime >= pauseDuration) {
        pauseComplete = true;
      }
    }
    
    // 圖2
    
    // 只有在停頓完成後才開始第二個動畫
    if (pauseComplete) {
      // 更新第二條橫線動畫進度（但不繪製）
      if (!line2AnimationComplete) {
        // 更新橫線進度
        let curTime = frameCount / 60;
        if (line2AnimationStartTime === 0) {
          line2AnimationStartTime = curTime;
        }
        
        let elapsedTime = curTime - line2AnimationStartTime;
        line2Progress = Math.min(1, elapsedTime / line2AnimationDuration);
        
        if (line2Progress >= 1) {
          line2AnimationComplete = true;
        }
      }
      
      // 只有在橫線動畫完成後才更新和繪製方塊
      if (line2AnimationComplete) {
        // 更新第二張圖的動畫
        let expandedBinWidth = squareSize;
        let maxExpandedHeight = Math.max(...squaresPerExpandedBin);
        // let squareSpacing = (histogramHeight - 20) / (maxExpandedHeight - 1);  // 使用新的 histogramHeight
        let squareSpacing = maxCircleCount * circleSize / (maxExpandedHeight - 1);  // 使用新的 histogramHeight
        console.log(maxCircleCount, circleSize, maxCircleCount * circleSize);

        for (let i = 0; i < expandedBins.length; i++) {
          if (expandedBins[i] && expandedBins[i].length > 0) {
            let anim = squareAnimations[i];  // 直接使用 i 作為索引
            
            if (isAnimating) {
              // 更新當前速度 - 與第一張圖保持一致
              let speedMultiplier = sin(frameCount * anim.speedFrequency + anim.speedPhase) * 0.5 + 0.5;
              anim.currentSpeed = anim.baseSpeed * speedMultiplier;
              
              anim.progress += anim.currentSpeed;
              
              // 檢查是否可以添加新的方塊
              if (!anim.squares[i]) {
                anim.squares[i] = [];
              }
              
              if (anim.squares[i].length < expandedBins[i].length) {
                let curTime = frameCount / 60;
                if (curTime - anim.lastSquareTime >= anim.nextSquareDelay) {
                  let squareIndex = anim.squares[i].length;
                  let targetY = canvasHeight/2 - squareSize - (squareIndex * squareSpacing);  // 修改這裡
                  anim.squares[i].push({
                    y: canvasHeight/4 + circleSize/2,  // 修改這裡
                    targetY: targetY,
                    val: expandedBins[i][squareIndex].val,
                    startTime: curTime
                  });
                  
                  anim.nextSquareDelay = random(squareMinDelay, squareMaxDelay);
                  anim.lastSquareTime = curTime;
                }
              }
              
              // 更新每個方塊的位置
              for (let j = 0; j < anim.squares[i].length; j++) {
                let sq = anim.squares[i][j];
                let curTime = frameCount / 60;
                
                // 只有在停留時間結束後才開始移動
                if (curTime - sq.startTime >= squareHoverTime) {
                  let direction = sq.targetY < sq.y ? -1 : 1;
                  sq.y += direction * squareFallSpeed * 10;
                  if (direction === -1 && sq.y <= sq.targetY) {
                    sq.y = sq.targetY;
                  } else if (direction === 1 && sq.y >= sq.targetY) {
                    sq.y = sq.targetY;
                  }
                }
              }
            }
            
            // 繪製方塊
            let x = marginWidth + i * expandedBinWidth;
            if (anim.squares[i]) {
              for (let j = 0; j < anim.squares[i].length; j++) {
                let sq = anim.squares[i][j];
                fill(sq.val);
                strokeWeight(0);
                square(x, sq.y + offsetHeight, squareSize);
              }
            }
          }
        }
        
        // 檢查所有方塊是否都已落下到位
        if (!secondAnimationComplete) {
          let allSquaresInPlace = true;
          
          // 檢查所有方塊是否都已經生成並到達目標位置
          for (let i = 0; i < expandedBins.length; i++) {
            if (expandedBins[i] && expandedBins[i].length > 0) {
              let anim = squareAnimations[i];
              
              // 檢查是否所有方塊都已生成
              if (!anim.squares[i] || anim.squares[i].length < expandedBins[i].length) {
                allSquaresInPlace = false;
                break;
              }
              
              // 檢查所有方塊是否都到達目標位置
              for (let j = 0; j < anim.squares[i].length; j++) {
                let sq = anim.squares[i][j];
                if (Math.abs(sq.y - sq.targetY) > 0.1) {
                  allSquaresInPlace = false;
                  break;
                }
              }
              
              if (!allSquaresInPlace) break;
            }
          }
          
          if (allSquaresInPlace) {
            secondAnimationComplete = true;
            secondGraphPauseStartTime = frameCount / 60;  // 記錄圖2停頓開始時間
          }
        }
      }
      
      // 繪製第二條橫線（帶動畫）- 確保橫線在方塊上方
      strokeWeight(1);
      stroke(0);
      
      if (!line2AnimationComplete) {
        // 使用ease-out效果
        let easedProgress = 1 - Math.pow(1 - line2Progress, 3);
        
        // 繪製部分橫線
        let lineEndX = marginWidth + (canvasWidth - marginWidth * 2) * easedProgress;
        line(marginWidth, canvasHeight/2 + offsetHeight, lineEndX, canvasHeight/2 + offsetHeight);  // 修改這裡
      } else {
        // 橫線動畫完成後，繪製完整的橫線
        line(marginWidth, canvasHeight/2 + offsetHeight, canvasWidth - marginWidth, canvasHeight/2 + offsetHeight);  // 修改這裡
      }
    }
    
    // 圖2完成後的停頓
    if (secondAnimationComplete && !secondGraphPauseComplete) {
      // 繪製圖2的最終狀態
      let expandedBinWidth = squareSize;
      
      for (let i = 0; i < expandedBins.length; i++) {
        if (expandedBins[i] && expandedBins[i].length > 0) {
          let anim = squareAnimations[i];
          let x = marginWidth + i * expandedBinWidth;
          
          if (anim.squares[i]) {
            for (let j = 0; j < anim.squares[i].length; j++) {
              let sq = anim.squares[i][j];
              fill(sq.val);
              strokeWeight(0);
              square(x, sq.y + offsetHeight, squareSize);
            }
          }
        }
      }
      
      // 繪製第二條橫線 - 確保橫線在方塊上方
      strokeWeight(1);
      stroke(0);
      line(marginWidth, canvasHeight/2 + offsetHeight, canvasWidth - marginWidth, canvasHeight/2 + offsetHeight);
      
      // 檢查停頓是否完成
      let curTime = frameCount / 60;
      if (curTime - secondGraphPauseStartTime >= secondGraphPauseDuration) {
        secondGraphPauseComplete = true;
        thirdAnimationStartTime = curTime;  // 記錄第三個圖動畫開始的時間
        
        // 計算中心點
        let centerX = canvasWidth / 2;
        let centerY = canvasHeight/2 + canvasHeight/4;
        
        // 圓角矩形的邊界
        let rectLeft = marginHeight;
        let rectRight = canvasWidth - marginHeight;
        let rectTop = centerY - imgHeight/2 - marginHeight/2;
        let rectBottom = centerY + imgHeight/2 + marginHeight/2;
        let rectWidth = rectRight - rectLeft;
        let rectHeight = rectBottom - rectTop;
        
        // 為每個樣本分配隨機的目標位置（圖3區域）
        for (let i = 0; i < samples.length; i++) {
          // 初始化為默認位置
          samples[i].currentX = marginWidth + i % noiseWidth * squareSize;
          samples[i].currentY = canvasHeight/2 - marginHeight - squareSize;
          
          // 尋找這個樣本在圖2中的方塊位置
          let found = false;
          for (let j = 0; j < expandedBins.length; j++) {
            if (expandedBins[j] && expandedBins[j].includes(samples[i])) {
              let idx = expandedBins[j].indexOf(samples[i]);
              if (squareAnimations[j] && squareAnimations[j].squares && 
                  squareAnimations[j].squares[j] && idx < squareAnimations[j].squares[j].length) {
                let sq = squareAnimations[j].squares[j][idx];
                samples[i].currentX = marginWidth + j * expandedBinWidth;
                samples[i].currentY = sq.y;
                found = true;
                break;
              }
            }
          }
          
          // 如果沒有找到對應的方塊，使用默認位置
          if (!found) {
            console.log("未找到樣本 " + i + " 在圖2中的位置");
          }
          
          // 生成高斯分布的隨機位置
          let validPosition = false;
          let targetX, targetY;
          let attempts = 0;
          const maxAttempts = 100;  // 最大嘗試次數，避免無限循環
          
          while (!validPosition && attempts < maxAttempts) {
            attempts++;
            
            // 使用Box-Muller轉換生成高斯分布的隨機數
            let u1 = random();
            let u2 = random();
            let z1 = sqrt(-2 * log(u1)) * cos(TWO_PI * u2);
            let z2 = sqrt(-2 * log(u1)) * sin(TWO_PI * u2);
            
            // 將高斯分布的隨機數映射到圓角矩形的範圍內
            // 使用標準差控制分布的集中程度
            targetX = centerX + z1 * (rectWidth * gaussianSigmaX);
            targetY = centerY + z2 * (rectHeight * gaussianSigmaY);
            
            // 檢查點是否在圓角矩形內
            if (isPointInRoundedRect(
              targetX, targetY, 
              rectLeft, rectTop, 
              rectWidth, rectHeight, 
              cornerRadius
            )) {
              validPosition = true;
            }
          }
          
          // 如果無法找到有效位置，則使用均勻分布的隨機位置作為備選
          if (!validPosition) {
            while (!validPosition) {
              targetX = random(rectLeft, rectRight);
              targetY = random(rectTop, rectBottom);
              
              validPosition = isPointInRoundedRect(
                targetX, targetY, 
                rectLeft, rectTop, 
                rectWidth, rectHeight, 
                cornerRadius
              );
            }
          }
          
          samples[i].inFinalPosition = false;
          samples[i].targetX = targetX;
          samples[i].targetY = targetY;
        }
      }
    }
    
    // 圖3---- 利用重建的新 sample 生成灰階高斯雜訊圖 ----
    if (secondGraphPauseComplete) {
      let allInFinalPosition = true;
      
      // 第一階段：移動到高斯分布位置
      if (!gaussianPauseComplete) {
        for (let i = 0; i < samples.length; i++) {
          if (!samples[i].inFinalPosition) {
            // 更新位置，向目標位置移動
            samples[i].currentX = lerp(samples[i].currentX, samples[i].targetX, gaussianMoveSpeed);
            samples[i].currentY = lerp(samples[i].currentY, samples[i].targetY, gaussianMoveSpeed);
            
            // 檢查是否已到達目標位置
            if (Math.abs(samples[i].currentX - samples[i].targetX) < 1 && 
                Math.abs(samples[i].currentY - samples[i].targetY) < 1) {
              samples[i].inFinalPosition = true;
              samples[i].currentX = samples[i].targetX;
              samples[i].currentY = samples[i].targetY;
            } else {
              allInFinalPosition = false;
            }
          }
          
          // 繪製方塊
          let bright = samples[i].val;
          fill(bright);
          strokeWeight(1);
          stroke(bright);
          square(samples[i].currentX, samples[i].currentY + offsetHeight, squareSize);
        }
        
        // 如果所有方塊都到達高斯分布位置，開始計時停頓
        if (allInFinalPosition && !thirdAnimationComplete) {
          thirdAnimationComplete = true;
          gaussianPauseStartTime = frameCount / 60;  // 記錄停頓開始時間
        }
        
        // 檢查停頓是否完成
        if (thirdAnimationComplete) {
          let curTime = frameCount / 60;
          if (curTime - gaussianPauseStartTime >= gaussianPauseDuration) {
            gaussianPauseComplete = true;
            
            // 設置最終矩陣位置
            for (let i = 0; i < samples.length; i++) {
              // 根據noiseIdx設置最終位置
              let finalX = canvasWidth/2 - imgWidth/2 + (samples[i].noiseX * squareSize);
              let finalY = canvasHeight/2 + marginHeight + (samples[i].noiseY * squareSize);
              
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
        
        for (let i = 0; i < samples.length; i++) {
          if (!samples[i].inFinalMatrixPosition) {
            // 更新位置，向最終矩陣位置移動
            samples[i].currentX = lerp(samples[i].currentX, samples[i].finalTargetX, matrixMoveSpeed);
            samples[i].currentY = lerp(samples[i].currentY, samples[i].finalTargetY, matrixMoveSpeed);
            
            // 檢查是否已到達最終矩陣位置
            if (Math.abs(samples[i].currentX - samples[i].finalTargetX) < 0.5 && 
                Math.abs(samples[i].currentY - samples[i].finalTargetY) < 0.5) {
              samples[i].inFinalMatrixPosition = true;
              samples[i].currentX = samples[i].finalTargetX;
              samples[i].currentY = samples[i].finalTargetY;
            } else {
              allInMatrixPosition = false;
            }
          }
          
          // 繪製方塊
          let bright = samples[i].val;
          fill(bright);
          strokeWeight(1);
          stroke(bright);
          square(samples[i].currentX, samples[i].currentY + offsetHeight, squareSize);
        }
        
        // 如果所有方塊都到達最終矩陣位置
        if (allInMatrixPosition) {
          finalMatrixAnimationComplete = true;
          console.log("所有動畫完成！");
        }
      }
      // 最終階段：保持矩陣排列
      else {
        // 繪製最終矩陣排列
        for (let i = 0; i < samples.length; i++) {
          let bright = samples[i].val;
          fill(bright);
          strokeWeight(1);
          stroke(bright);
          square(samples[i].currentX, samples[i].currentY + offsetHeight, squareSize);
        }
        
        // 如果尚未印出最終矩陣的灰度值，則進行處理
        if (!finalMatrixValuesPrinted) {
          // 創建一個二維陣列來暫存灰度值
          let matrixValues = Array(noiseHeight).fill().map(() => Array(noiseWidth).fill(0));
          
          // 將每個方塊的灰度值填入對應位置
          for (let i = 0; i < samples.length; i++) {
            let sample = samples[i];
            // 使用 noiseX 和 noiseY 來確定方塊在矩陣中的位置
            if (sample.noiseX >= 0 && sample.noiseX < noiseWidth && 
                sample.noiseY >= 0 && sample.noiseY < noiseHeight) {
              matrixValues[sample.noiseY][sample.noiseX] = sample.val;
            }
          }
          
          // 將二維陣列轉換為一維陣列（從左至右，從上至下）
          for (let y = 0; y < noiseHeight; y++) {
            for (let x = 0; x < noiseWidth; x++) {
              flattenedValues.push(matrixValues[y][x]);
            }
          }
          
          // 印出一維陣列
          // console.log("最終矩陣灰度值（從左至右，從上至下）：");
          // console.log(flattenedValues);
          
          // 標記為已印出
          finalMatrixValuesPrinted = true;
        }
      }
    }
  }
}

// 檢查點是否在圓角矩形內的輔助函數
function isPointInRoundedRect(x, y, rectX, rectY, rectWidth, rectHeight, radius) {
  // 檢查點是否在矩形的主體部分
  if (x >= rectX + radius && x <= rectX + rectWidth - radius &&
      y >= rectY + radius && y <= rectY + rectHeight - radius) {
    return true;
  }
  
  // 檢查點是否在四個圓角內
  // 左上角
  if (x < rectX + radius && y < rectY + radius) {
    return dist(x, y, rectX + radius, rectY + radius) <= radius;
  }
  // 右上角
  if (x > rectX + rectWidth - radius && y < rectY + radius) {
    return dist(x, y, rectX + rectWidth - radius, rectY + radius) <= radius;
  }
  // 左下角
  if (x < rectX + radius && y > rectY + rectHeight - radius) {
    return dist(x, y, rectX + radius, rectY + rectHeight - radius) <= radius;
  }
  // 右下角
  if (x > rectX + rectWidth - radius && y > rectY + rectHeight - radius) {
    return dist(x, y, rectX + rectWidth - radius, rectY + rectHeight - radius) <= radius;
  }
  
  // 檢查點是否在矩形的邊緣部分（非圓角）
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