# 動態直方圖動畫系統

這是一個基於 Node.js、p5.js 和 MQTT 的動態直方圖動畫系統，可以通過 MQTT 訊息即時更新動畫數據。

## 系統需求

- Node.js (建議版本 14.0.0 或更高)
- npm (通常隨 Node.js 一起安裝)
- 現代網頁瀏覽器（支援 HTML5 和 WebSockets）
- MQTT Broker (如 Mosquitto, EMQ X, HiveMQ 等)

## 安裝步驟

1. **安裝 Node.js**
   - 訪問 [Node.js 官網](https://nodejs.org/)
   - 下載並安裝 LTS 版本
   - 安裝時請確保勾選「Add to PATH」選項

2. **下載專案**
   ```bash
   git clone [您的專案 URL]
   cd [專案資料夾名稱]
   ```

3. **安裝依賴**
   ```bash
   npm install
   ```

4. **啟動伺服器**
   ```bash
   npm start
   ```

5. **訪問網頁**
   - 打開瀏覽器
   - 訪問 `http://localhost:3000`

## MQTT 配置

系統使用 MQTT 協議接收數據並發送完成訊息。預設配置如下：

- MQTT 訂閱主題：`galton/bins`
- MQTT 發布主題：`galton/completed`
- 預設 MQTT Broker：`ws://localhost:8083/mqtt`
- 預設訂閱 QoS：2（確保只接收一次）
- 預設發布 QoS：2（確保只傳遞一次）

您可以通過URL參數自定義 MQTT 連接：

```
http://localhost:3000/?mqtt_host=broker.example.com&mqtt_port=8083&mqtt_path=/mqtt&subscribe_qos=1&publish_qos=2
```

## 使用 MQTT 客戶端發送數據

您可以使用任何 MQTT 客戶端（如 MQTT.fx、Mosquitto 客戶端等）向系統發送數據：

### 使用 Mosquitto 客戶端發送數據

```bash
mosquitto_pub -h localhost -p 1883 -t "galton/bins" -m "[0, 2, 8, 10, 15, 35, 40, 45, 53, 64, 77, 87, 77, 92, 64, 46, 40, 35, 23, 13, 10, 6, 3, 2]"
```

### 使用 Node.js MQTT 客戶端發送數據

```javascript
const mqtt = require('mqtt');
const client = mqtt.connect('mqtt://localhost:1883');

client.on('connect', function() {
  const data = [0, 2, 8, 10, 15, 35, 40, 45, 53, 64, 77, 87, 77, 92, 64, 46, 40, 35, 23, 13, 10, 6, 3, 2];
  client.publish('galton/bins', JSON.stringify(data), { qos: 1 });
});
```

## QoS (Quality of Service) 設定

MQTT 提供三種 QoS 級別：

- **QoS 0**：最多傳遞一次 (最快但不保證傳遞)
- **QoS 1**：至少傳遞一次 (保證傳遞，但可能重複)
- **QoS 2**：只傳遞一次 (保證傳遞且不重複，但最慢)

您可以通過 URL 參數調整 QoS 級別，例如：
```
http://localhost:3000/?subscribe_qos=1&publish_qos=2
```

## 動畫說明

動畫分為三個階段：

1. **第一階段**：
   - 顯示原始直方圖
   - 圓形從上方落下形成直方圖
   - 完成後有短暫停頓

2. **第二階段**：
   - 展開直方圖
   - 方塊從上方落下
   - 完成後有短暫停頓

3. **第三階段**：
   - 方塊移動形成高斯分布
   - 最終形成矩陣排列
   - 完成時發送 MQTT 訊息到 `galton/completed` 主題

## 參數設定

可以在 sketch.js 中調整以下參數：

- `canvasWidth`：畫布寬度 (預設：1080)
- `canvasHeight`：畫布高度 (預設：1920)
- `marginWidth`：邊距寬度
- `marginHeight`：邊距高度
- `pauseDuration`：各階段之間的停頓時間
- `circleSize`：圓形大小
- `squareSize`：方塊大小
- `circleFallSpeed`：圓形落下速度
- `squareFallSpeed`：方塊落下速度

## 常見問題

1. **無法連接 MQTT Broker**
   - 確認 MQTT Broker 已正確安裝並啟動
   - 檢查 MQTT Broker 的地址、埠和路徑
   - 確認防火牆設定允許 WebSocket 連接 (通常是 8083 埠)

2. **動畫無法顯示**
   - 確認瀏覽器支援 HTML5 和 WebSockets
   - 檢查瀏覽器 Console 是否有錯誤訊息
   - 確認 MQTT 連接是否正常建立

3. **無法接收 MQTT 訊息**
   - 確認發送的 JSON 格式正確
   - 檢查發送主題是否為 `galton/bins`
   - 檢查 QoS 設定是否適當

## 注意事項

1. 每次發送新的數據時，舊的動畫會被完全停止並重置
2. fixedBins 陣列的值應該是非負整數
3. 建議在本地開發環境中測試後再部署到生產環境
4. 動畫效果可能因設備性能而異
5. 動畫完成後會自動發送 MQTT 訊息到 `galton/completed` 主題

## 授權說明

[在此加入您的授權聲明]

## 聯絡方式

[在此加入您的聯絡資訊] 