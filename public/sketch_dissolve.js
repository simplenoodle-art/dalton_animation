let canvasWidth = 1080;
let canvasHeight = 1920;
let imgPrev, imgNow, imgNext;
let blended;
let globalTime = 0;
let blockStartTimes = []; // 儲存每個方塊的開始時間
let blockGrayDurations = []; // 儲存每個方塊的灰色停留時間
let blockGrayValues = []; // 儲存每個方塊的灰色值
let imagesLoaded = false;
let animationStarted = false; // 動畫是否已開始
let moveUpStarted = false; // 向上移動是否已開始
let blockAnimationStarted = false; // 方塊動畫是否已開始
let loadCompleteTime = 0; // 載入完成的時間
let startDelay = 2.0; // 開始延遲（秒）
let moveUpDuration = 1.0; // 向上移動動畫時長（秒）
let moveUpStartTime = 0; // 向上移動開始時間
let blockSize = 12; // 方塊大小 (n×n)
let blocksX, blocksY; // 水平和垂直方向的方塊數量

// MQTT 客戶端
let client;

// 動畫狀態
let waitingForNextImage = true; // 是否在等待下一張圖片
let currentAnimationPhase = 'idle'; // 'idle', 'waiting', 'animating'
let isFirstTime = true; // 是否是第一次動畫

// 均勻分布參數（最小值和最大值）
let startTimeMin = 0.2; // 開始時間最小值（秒）
let startTimeMax = 3.0; // 開始時間最大值（秒）
let grayDurationMin = 0.3; // 灰色停留時間最小值（秒）
let grayDurationMax = 1.3; // 灰色停留時間最大值（秒）

// 灰色值高斯分布參數
let grayValueMean = 128; // 灰色值均值
let grayValueStd = 60; // 灰色值標準差
let grayValueMin = 0; // 灰色值最小值
let grayValueMax = 255; // 灰色值最大值

// 連接到 MQTT broker 的函數
function connectToMQTT() {
  const clientId = 'galton_animation_client_' + Math.random().toString(16).substr(2, 8);
  
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
    console.log(`使用 URL 參數指定的 MQTT 伺服器: ${hosts[0]}`);
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
  
  console.log('嘗試連接到 MQTT broker: ' + host);
  client = mqtt.connect(host, options);
  
  client.on('connect', function() {
    console.log('已成功連接到 MQTT broker: ' + host);
    connectionAttempts = 0;
    
    const subscribeOptions = {
      qos: mqttQoS.subscribe
    };
    
    client.subscribe('galton/images', subscribeOptions, function(err) {
      if (err) {
        console.error('訂閱主題失敗:', err);
      } else {
        console.log(`已成功訂閱主題: galton/images (QoS: ${subscribeOptions.qos})`);
      }
    });
    
    window.mqttQoS = mqttQoS;
  });
  
  client.on('error', function(error) {
    console.error(`MQTT 連接錯誤 (${host}):`, error);
    connectionAttempts++;
    console.log(`連接嘗試次數: ${connectionAttempts}/${maxConnectionAttempts}`);
    
    if (connectionAttempts >= maxConnectionAttempts) {
      connectionAttempts = 0;
      currentHostIndex++;
      
      if (currentHostIndex < hosts.length) {
        console.log(`嘗試下一個連接選項: ${hosts[currentHostIndex]}`);
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

// 設置 MQTT 客戶端事件處理
function setupEventHandlers(clientInstance, currentHost) {
  clientInstance.on('reconnect', function() {
    console.log(`正在重新連接到 MQTT broker (${currentHost})...`);
  });
  
  clientInstance.on('close', function() {
    console.log(`MQTT 連接已關閉 (${currentHost})`);
  });
  
  clientInstance.on('offline', function() {
    console.log(`MQTT 客戶端離線 (${currentHost})`);
  });
  
  // 監聽新數據
  clientInstance.on('message', function(topic, message) {
    if (topic === 'galton/images') {
      console.log(`從 ${currentHost} 收到新數據`);
      
      try {
        const messageData = JSON.parse(message.toString());
        console.log('接收到的數據:', messageData);
        
        if (messageData.imgNextPath) {
          loadNextImageAndStartAnimation(messageData.imgNextPath);
        }
      } catch (error) {
        console.error('解析MQTT訊息失敗:', error);
      }
    }
  });
}

// 載入下一張圖片並開始動畫
function loadNextImageAndStartAnimation(imgPath) {
  if (currentAnimationPhase !== 'idle') {
    console.log('動畫正在進行中，忽略新的圖片請求');
    return;
  }
  
  console.log('開始載入新圖片:', imgPath);
  currentAnimationPhase = 'waiting';
  
  loadImage(imgPath, img => {
    console.log('圖片載入完成:', imgPath);
    
    // 設置下一張圖片，但不改變上方圖片
    imgNext = img;
    imgNext.resize(480, 720);
    imgNext.loadPixels();
    
    // 如果是第一次，創建空白的 imgPrev
    if (isFirstTime && !imgPrev) {
      imgPrev = createImage(480, 720); // 創建空白圖片
      imgPrev.loadPixels();
      for (let i = 0; i < imgPrev.pixels.length; i += 4) {
        imgPrev.pixels[i] = 255;     // R
        imgPrev.pixels[i + 1] = 255; // G
        imgPrev.pixels[i + 2] = 255; // B
        imgPrev.pixels[i + 3] = 255; // A
      }
      imgPrev.updatePixels();
    }
    // 注意：這裡不再立即更新 imgPrev，讓它保持原樣
    
    // 初始化動畫參數
    initializeAnimationParameters();
    
    // 開始動畫
    startAnimation();
  }, () => {
    console.error('圖片載入失敗:', imgPath);
    currentAnimationPhase = 'idle';
  });
}

// 初始化動畫參數
function initializeAnimationParameters() {
  if (!imgNow) return;
  
  blended = createImage(imgNow.width, imgNow.height);
  imgNow.loadPixels();
  if (imgNext) imgNext.loadPixels();
  blended.loadPixels();
  
  // 計算方塊的數量
  blocksX = Math.ceil(imgNow.width / blockSize);
  blocksY = Math.ceil(imgNow.height / blockSize);
  let totalBlocks = blocksX * blocksY;
  
  // 為每個方塊分配時間參數
  blockStartTimes = [];
  blockGrayDurations = [];
  blockGrayValues = [];
  
  for (let i = 0; i < totalBlocks; i++) {
    blockStartTimes[i] = random(startTimeMin, startTimeMax);
    blockGrayDurations[i] = random(grayDurationMin, grayDurationMax);
    blockGrayValues[i] = constrain(randomGaussian(grayValueMean, grayValueStd), grayValueMin, grayValueMax);
  }
}

// 開始動畫
function startAnimation() {
  currentAnimationPhase = 'animating';
  animationStarted = false;
  moveUpStarted = false;
  blockAnimationStarted = false;
  globalTime = 0;
  loadCompleteTime = millis() / 1000.0;
  
  console.log('動畫開始');
}

function setup() {
    createCanvas(canvasWidth, canvasHeight);
    frameRate(60);
    
    connectToMQTT();
    
    // 載入初始圖片
    loadImage('images/step_0.png', img => {
        imgNow = img;
        imgNow.resize(480, 720);
        imgNow.loadPixels();
        imagesLoaded = true;
        currentAnimationPhase = 'idle';
        console.log('初始圖片載入完成');
    });
}

// 檢查兩張圖片是否都已載入
function checkImagesLoaded() {
    // 這個函數現在由動態載入處理
}

function draw() {
    background(255);
    
    if (!imagesLoaded) {
        // 圖片還未載入完成，顯示載入中訊息
        fill(0);
        textAlign(CENTER, CENTER);
        textSize(24);
        text("載入中...", width/2, height/2);
        return;
    }
    
    if (currentAnimationPhase === 'idle') {
        // 空閒狀態
        if (!isFirstTime && imgPrev) {
            // 非第一次：上方顯示 imgPrev
            image(imgPrev, 300, 160);
        }
        // 下方顯示當前圖片
        if (imgNow) {
            image(imgNow, 300, 1040);
        }
        drawDownArrow();
        return;
    }
    
    if (currentAnimationPhase === 'waiting') {
        // 等待載入新圖片期間，保持當前畫面不變
        if (!isFirstTime && imgPrev) {
            // 非第一次：上方顯示 imgPrev
            image(imgPrev, 300, 160);
        }
        // 下方顯示當前圖片
        if (imgNow) {
            image(imgNow, 300, 1040);
        }
        drawDownArrow();
        return;
    }
    
    if (currentAnimationPhase !== 'animating') {
        return;
    }
    
    // 動畫邏輯（與之前相同）
    let current_time = millis() / 1000.0;
    let elapsedSinceLoad = current_time - loadCompleteTime;
    
    if (!animationStarted) {
        if (elapsedSinceLoad >= startDelay) {
            animationStarted = true;
            moveUpStartTime = current_time;
        } else {
            // 延遲期間，顯示兩張圖片
            if (imgPrev) image(imgPrev, 300, 160);
            if (imgNow) image(imgNow, 300, 1040);
            drawDownArrow();
            return;
        }
    }
    
    if (!moveUpStarted) {
        // 向上移動階段
        let moveElapsed = current_time - moveUpStartTime;
        let moveProgress = constrain(moveElapsed / moveUpDuration, 0, 1);
        
        if (moveProgress >= 1) {
            moveUpStarted = true;
            blockAnimationStarted = true;
            // 在向上移動完成時才更新上方圖片
            if (imgNow && imgPrev) {
                imgPrev.copy(imgNow, 0, 0, imgNow.width, imgNow.height, 0, 0, imgNow.width, imgNow.height);
                imgPrev.loadPixels();
            }
        }
        
        // 繪製移動中的畫面
        if (imgPrev) image(imgPrev, 300, 160);
        if (imgNow) image(imgNow, 300, 1040);
        drawDownArrow();
        
        if (imgNow) {
            let yPos = lerp(1040, 160, smoothstep(moveProgress));
            image(imgNow, 300, yPos);
        }
        
        return;
    }
    
    if (!blockAnimationStarted) {
        return;
    }
    
    // 方塊動畫階段
    let completedBlocks = 0;
    let totalBlocks = blocksX * blocksY;
    
    // 上面顯示 imgPrev
    if (imgPrev) image(imgPrev, 300, 160);
    drawDownArrow();
    
    // 處理下面的方塊動畫
    if (imgNow && imgNext) {
        for (let blockY = 0; blockY < blocksY; blockY++) {
            for (let blockX = 0; blockX < blocksX; blockX++) {
                let blockIndex = blockY * blocksX + blockX;
                let startTime = blockStartTimes[blockIndex];
                let grayDuration = blockGrayDurations[blockIndex];
                let grayValue = blockGrayValues[blockIndex];
                let grayEndTime = startTime + grayDuration;
                
                let startX = blockX * blockSize;
                let startY = blockY * blockSize;
                let endX = min(startX + blockSize, imgNow.width);
                let endY = min(startY + blockSize, imgNow.height);
                
                let blockCompleted = false;
                
                for (let y = startY; y < endY; y++) {
                    for (let x = startX; x < endX; x++) {
                        let pixelIndex = y * imgNow.width + x;
                        let pixelArrayIndex = pixelIndex * 4;
                        
                        if (globalTime < startTime) {
                            for (let j = 0; j < 4; j++) {
                                blended.pixels[pixelArrayIndex + j] = imgNow.pixels[pixelArrayIndex + j];
                            }
                        } else if (globalTime < grayEndTime) {
                            for (let j = 0; j < 3; j++) {
                                blended.pixels[pixelArrayIndex + j] = grayValue;
                            }
                            blended.pixels[pixelArrayIndex + 3] = imgNow.pixels[pixelArrayIndex + 3];
                        } else {
                            for (let j = 0; j < 4; j++) {
                                blended.pixels[pixelArrayIndex + j] = imgNext.pixels[pixelArrayIndex + j];
                            }
                            blockCompleted = true;
                        }
                    }
                }
                
                if (blockCompleted) {
                    completedBlocks++;
                }
            }
        }
        
        blended.updatePixels();
        image(blended, 300, 1040);
    }
    
    // 檢查動畫是否完成
    if (completedBlocks >= totalBlocks) {
        if (imgNow && imgNext) {
            imgNow.copy(imgNext, 0, 0, imgNext.width, imgNext.height, 0, 0, imgNext.width, imgNext.height);
        }
        currentAnimationPhase = 'idle';
        isFirstTime = false; // 標記非第一次
        console.log("動畫完成！");
        return;
    }
    
    if (blockAnimationStarted) {
        globalTime += 1/60;
    }
}

function drawDownArrow() {
    let arrowCenterX = 540;
    let arrowCenterY = 960;
    
    let triangleSide = 60;
    let triangleHeight = triangleSide * sqrt(3) / 2;
    
    let rectWidth = 20;
    let rectHeight = triangleSide;
    
    fill(0, 0, 0);
    noStroke();
    
    let triangleTop = arrowCenterY;
    let triangleBottom = triangleTop + triangleHeight;
    
    let x1 = arrowCenterX - triangleSide / 2;
    let y1 = triangleTop;
    let x2 = arrowCenterX + triangleSide / 2;
    let y2 = triangleTop;
    let x3 = arrowCenterX;
    let y3 = triangleBottom;
    
    triangle(x1, y1, x2, y2, x3, y3);
    
    let rectX = arrowCenterX - rectWidth / 2;
    let rectY = triangleTop - rectHeight;
    
    rect(rectX, rectY, rectWidth, rectHeight);
}

function smoothstep(t) {
    return t * t * (3 - 2 * t);
}

// function mousePressed() {
//     window.resizeTo(1080, 1920);
//     let fs = fullscreen();
//     if (!fs) {
//       fullscreen(true);
//     } else {
//       fullscreen(false);
//     }
// }