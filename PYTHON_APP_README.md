# 達爾頓動畫桌面應用程式 (PyQt5版本)

## 概述

這是一個使用PyQt5開發的專業桌面應用程式，可以在原生桌面視窗中顯示達爾頓動畫的動態直方圖。程式支援跨螢幕顯示、智能滑鼠控制、自動伺服器管理等高級功能，特別針對macOS多螢幕環境進行了優化。

### 手動設定

#### macOS Ventura/Monterey/Big Sur (較新版本)
1. 蘋果選單 → 系統設定 (System Settings)
2. 側邊欄選擇「桌面與Dock」
3. 向下滾動找到「Mission Control」區域
4. 關閉「顯示器具有分離的空間」

#### macOS Mojave/Catalina (較舊版本)  
1. 蘋果選單 → 系統偏好設定 (System Preferences)
2. 點選「Mission Control」或「調度中心」
3. 取消勾選「顯示器有單獨的工作空間」


## 系統需求

- **Python 3.7+**
- **PyQt5** (包含 PyQtWebEngine)
- **Node.js** (用於後端伺服器)
- **作業系統**: macOS (推薦), Windows, Linux

## 安裝步驟

### 1. 安裝Python依賴

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. 確保Node.js依賴已安裝

```bash
npm install
```

### 3. 運行應用程式

```bash
source venv/bin/activate
python desktop_app_pyqt5.py
```
或者
```bash
sh run_desktop_app.sh
```

## 功能特性

✨ **跨螢幕全螢幕顯示** - 支援在多個螢幕之間無縫跨越
🖱️ **智能滑鼠控制** - 滑鼠檢測和自動隱藏功能  
🔒 **安全關閉確認** - 防止誤操作的確認對話框
🍎 **macOS優化** - 特別針對macOS系統進行了深度優化

### 🖼️ 視窗顯示功能
- **跨螢幕顯示**: 支援在多個螢幕間跨越顯示 (2160x1920)
- **自定義位置**: 預設位置 (-1080, 0) 適合雙螢幕配置
- **無邊框設計**: 沉浸式全螢幕體驗
- **視窗置頂**: 確保始終在最前方顯示

### 🖱️ 滑鼠控制系統
- **超敏感檢測**: 移動1像素即可喚醒滑鼠和關閉按鈕
- **全域監控**: 每50ms檢測滑鼠位置變化
- **自動隱藏**: 靜止3秒後自動隱藏滑鼠指標和關閉按鈕
- **同步顯示**: 關閉按鈕與滑鼠指標完全同步顯示/隱藏
- **智能關閉按鈕**: 固定在左下角 (80x80)，隨滑鼠一起出現
- **多重事件支援**: 支援所有滑鼠和hover事件

### 🔐 安全性功能
- **關閉確認對話框**: 自定義位置 (-740, 860)
- **防誤操作**: 點擊按鈕外區域自動隱藏
- **確認機制**: 關閉前需要用戶確認

### 🎛️ 鍵盤快捷鍵
- **ESC** - 退出應用程式
- **F11** - 切換自定義視窗尺寸和正常尺寸  
- **F12** - 顯示螢幕資訊和視窗覆蓋情況
- **Ctrl+1** - 測試位置1 (完全跨螢幕)
- **Ctrl+2** - 測試位置2 (從左螢幕中間開始)
- **Ctrl+3** - 測試位置3 (完全在左螢幕)
- **Ctrl+4** - 測試macOS特殊模式
- **Ctrl+5** - 使用終端機命令自動設定跨螢幕
- **Ctrl+R** - 重新載入頁面
- **Ctrl+Q** - 退出應用程式

## macOS跨螢幕設定

### 自動設定 (推薦)
按 **Ctrl+5** 自動執行以下命令：
```bash
defaults write com.apple.spaces spans-displays -bool true
killall Dock
```
## 自定義配置

### 調整視窗位置和尺寸
編輯 `setup_custom_window_geometry()` 方法：
```python
target_width = 2160   # 視窗寬度
target_height = 1920  # 視窗高度
x = -1080            # X座標
y = 0                # Y座標
```

### 調整對話框位置
編輯 `get_dialog_config()` 方法：
```python
x = -740  # 對話框X座標
y = 860   # 對話框Y座標
width = 400   # 對話框寬度
height = 200  # 對話框高度
```

### 調整滑鼠敏感度
編輯 `check_mouse_movement()` 方法：
```python
sensitivity_threshold = 1    # 移動閾值 (像素)
self.mouse_check_timer.start(50)  # 檢查間隔 (毫秒)
```

## 故障排除

### 1. 無法跨螢幕顯示
- 確保已設定macOS跨螢幕選項
- 嘗試按 **Ctrl+5** 自動修復
- 重新登入或重啟電腦
- 檢查螢幕配置是否正確

### 2. 滑鼠響應問題
- 程式使用超敏感檢測 (1像素移動)
- 支援多重檢測機制確保響應
- 如仍有問題，可調整敏感度設定

### 3. PyQt5安裝問題
```bash
# macOS
pip3 install PyQt5 PyQtWebEngine

# 如果遇到權限問題
pip3 install --user PyQt5 PyQtWebEngine

# 或使用Homebrew
brew install pyqt5
```

### 4. 高DPI顯示問題
程式已自動處理高DPI支援，如有問題請確保：
- 使用最新版本的PyQt5
- 檢查系統顯示設定

## 技術架構

### 核心技術
- **PyQt5**: 現代化桌面應用程式框架
- **QWebEngineView**: 高性能網頁渲染引擎
- **多重滑鼠檢測**: 事件過濾器 + 全域監控 + widget事件
- **跨螢幕支援**: macOS原生API + 特殊視窗標誌

### 特殊優化
- **WebEngineView事件過濾**: 處理網頁內的滑鼠事件
- **JavaScript相容性**: 自動修復AudioContext和Array.at問題
- **macOS窗口管理**: 繞過系統限制實現真正的跨螢幕

### 檔案結構
```
desktop_app_pyqt5.py     # 主程式
server.js                # Node.js後端伺服器
package.json            # Node.js依賴
public/                 # 前端資源
PYTHON_APP_README.md    # 本說明文件
```

## 效能監控

程式包含內建的調試功能：
- 螢幕覆蓋分析 (**F12**)
- 視窗位置驗證
- 滑鼠移動距離監控
- 事件觸發日誌

## 更新日誌

### v2.0 (PyQt5版本)
- ✅ 完全重構為PyQt5架構
- ✅ 新增跨螢幕全螢幕支援
- ✅ 實現超敏感滑鼠檢測
- ✅ 添加智能關閉按鈕
- ✅ macOS深度優化
- ✅ 自定義確認對話框
- ✅ 多重事件檢測機制

## 支援與反饋

如遇到問題，請檢查：
1. 所有依賴是否正確安裝
2. macOS跨螢幕設定是否正確
3. Node.js伺服器是否正常運行
4. 螢幕配置是否支援目標尺寸

祝您使用愉快！✨ 