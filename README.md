# 動態直方圖動畫系統

這是一個基於 Node.js 和 p5.js 的動態直方圖動畫系統，可以通過 API 即時更新動畫數據。

## 系統需求

- Node.js (建議版本 14.0.0 或更高)
- npm (通常隨 Node.js 一起安裝)
- 現代網頁瀏覽器（支援 HTML5 和 WebSocket）

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

## API 使用說明

### 更新動畫數據
- **端點**：`/api/updateBins`
- **方法**：POST
- **內容類型**：application/json
- **請求體格式**：
  ```json
  {
    "fixedBins": [0, 2, 8, 10, 15, 35, 40, 45, 53, 64, 77, 87, 77, 92, 64, 46, 40, 35, 23, 13, 10, 6, 3, 2]
  }
  ```

### 使用 curl 發送請求
```bash
curl -X POST http://localhost:3000/api/updateBins \
-H "Content-Type: application/json" \
-d '{"fixedBins": [0, 2, 8, 10, 15, 35, 40, 45, 53, 64, 77, 87, 77, 92, 64, 46, 40, 35, 23, 13, 10, 6, 3, 2]}'
```

### 使用 Postman 發送請求
1. 創建新的 POST 請求
2. 輸入 URL：`http://localhost:3000/api/updateBins`
3. 選擇 Body > raw > JSON
4. 輸入請求體 JSON 數據
5. 點擊 Send

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

1. **無法啟動伺服器**
   - 確認 Node.js 已正確安裝
   - 確認所有依賴已安裝
   - 檢查端口 3000 是否被占用

2. **動畫無法顯示**
   - 確認瀏覽器支援 HTML5
   - 檢查 Console 是否有錯誤訊息
   - 確認 Socket.IO 連接是否正常

3. **API 請求失敗**
   - 確認伺服器正在運行
   - 檢查請求格式是否正確
   - 確認 fixedBins 陣列格式正確

## 注意事項

1. 每次發送新的數據時，舊的動畫會被完全停止並重置
2. fixedBins 陣列的值應該是非負整數
3. 建議在本地開發環境中測試後再部署到生產環境
4. 動畫效果可能因設備性能而異

## 授權說明

[在此加入您的授權聲明]

## 聯絡方式

[在此加入您的聯絡資訊] 