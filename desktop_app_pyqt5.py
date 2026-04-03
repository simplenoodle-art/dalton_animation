#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
達爾頓動畫桌面應用程式 - PyQt5版本
使用PyQt5 + QWebEngineView支援macOS跨螢幕全螢幕
"""

import sys
import requests
import time
import subprocess
import os
from PyQt5.QtWidgets import (QApplication, QMainWindow, QVBoxLayout, 
                            QWidget, QDesktopWidget, QPushButton, QLabel, QMessageBox)
from PyQt5.QtWebEngineWidgets import QWebEngineView, QWebEngineSettings, QWebEnginePage
from PyQt5.QtCore import Qt, QUrl, QTimer, pyqtSignal, QPoint, QEvent
from PyQt5.QtGui import QScreen, QMouseEvent, QPalette, QFont

class CustomWebEnginePage(QWebEnginePage):
    """自定義WebEnginePage來處理JavaScript錯誤和控制台訊息"""
    
    def javaScriptConsoleMessage(self, level, message, line, source):
        """過濾和處理JavaScript控制台訊息"""
        # 過濾掉AudioContext警告（這是瀏覽器安全限制，正常現象）
        if "AudioContext" in message and "user gesture" in message:
            return  # 不顯示AudioContext警告
        
        # 過濾掉一些常見的非關鍵錯誤
        if "I.at is not a function" in message:
            print(f"JavaScript相容性警告 (已處理): {message}")
            return
        
        # 只顯示重要的錯誤
        if level == QWebEnginePage.JavaScriptConsoleMessageLevel.ErrorMessageLevel:
            print(f"JavaScript錯誤 (第{line}行): {message}")
        elif level == QWebEnginePage.JavaScriptConsoleMessageLevel.WarningMessageLevel:
            if "deprecat" in message.lower() or "warning" in message.lower():
                print(f"JavaScript警告: {message}")

class DaltonAnimationPyQt5App(QMainWindow):
    def __init__(self):
        super().__init__()
        self.server_url = "http://localhost:3000"
        self.server_process = None
        self.web_view = None
        self.is_custom_size = False  # 追蹤是否為自定義尺寸
        self.close_button = None  # 關閉按鈕
        self.mouse_hide_timer = None  # 滑鼠隱藏計時器
        self.init_ui()
        
    def init_ui(self):
        """初始化用戶介面"""
        self.setWindowTitle('達爾頓動畫 - 動態直方圖 (PyQt5)')
        
        # 建立中央widget和布局
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        layout = QVBoxLayout(central_widget)
        layout.setContentsMargins(0, 0, 0, 0)
        
        # 建立QWebEngineView
        self.web_view = QWebEngineView()
        
        # 使用自定義的WebEnginePage
        custom_page = CustomWebEnginePage(self.web_view)
        self.web_view.setPage(custom_page)
        
        # 為WebEngineView安裝事件過濾器
        self.web_view.installEventFilter(self)
        
        # 強制啟用WebEngineView的滑鼠事件
        self.web_view.setAttribute(Qt.WA_AcceptTouchEvents, False)
        self.web_view.setAttribute(Qt.WA_Hover, True)
        
        # 設定WebEngine設定
        settings = self.web_view.settings()
        settings.setAttribute(QWebEngineSettings.JavascriptEnabled, True)
        settings.setAttribute(QWebEngineSettings.LocalStorageEnabled, True)
        settings.setAttribute(QWebEngineSettings.PluginsEnabled, True)
        settings.setAttribute(QWebEngineSettings.JavascriptCanOpenWindows, True)
        settings.setAttribute(QWebEngineSettings.LocalContentCanAccessRemoteUrls, True)
        settings.setAttribute(QWebEngineSettings.AllowWindowActivationFromJavaScript, True)
        settings.setAttribute(QWebEngineSettings.PlaybackRequiresUserGesture, False)
        settings.setAttribute(QWebEngineSettings.JavascriptCanAccessClipboard, True)
        settings.setAttribute(QWebEngineSettings.LocalContentCanAccessFileUrls, True)
        # 效能最大化設定
        settings.setAttribute(QWebEngineSettings.WebGLEnabled, True)                  # 啟用 WebGL
        settings.setAttribute(QWebEngineSettings.Accelerated2dCanvasEnabled, True)   # 加速 2D Canvas
        settings.setAttribute(QWebEngineSettings.ScrollAnimatorEnabled, False)        # 關閉滾動動畫省資源
        settings.setAttribute(QWebEngineSettings.ShowScrollBars, False)               # 隱藏捲軸
        
        # 設定用戶代理字串以提供更好的相容性
        custom_user_agent = (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
        profile = self.web_view.page().profile()
        profile.setHttpUserAgent(custom_user_agent)
        # 提高 HTTP 快取上限至 512MB，減少重複載入資源的開銷
        profile.setHttpCacheMaximumSize(512 * 1024 * 1024)
        
        layout.addWidget(self.web_view)
        
        # 創建關閉按鈕（初始隱藏）
        self.create_close_button()
        
        # 設定滑鼠隱藏計時器
        self.setup_mouse_hide_timer()
        
        # macOS跨螢幕支援的關鍵設定
        if sys.platform == "darwin":
            # macOS特殊設定：使用特定的視窗標誌組合
            window_flags = (
                Qt.Window |                    # 獨立視窗
                Qt.FramelessWindowHint |       # 無邊框
                Qt.WindowStaysOnTopHint |      # 保持在最上層
                Qt.CustomizeWindowHint |       # 自訂視窗
                Qt.WindowDoesNotAcceptFocus    # 不接受焦點（有助於跨螢幕）
            )
            self.setWindowFlags(window_flags)
            
            # 設定視窗屬性來繞過macOS的視窗管理限制
            self.setAttribute(Qt.WA_MacAlwaysShowToolWindow, True)
            self.setAttribute(Qt.WA_MacVariableSize, True)
            self.setAttribute(Qt.WA_ShowWithoutActivating, True)
            
        else:
            # 非macOS系統使用原本的設定
            self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint)
        
        # 啟用滑鼠追蹤
        self.setMouseTracking(True)
        central_widget.setMouseTracking(True)
        self.web_view.setMouseTracking(True)
        
        # 為所有widget設定滑鼠追蹤（新的統一方法）
        self.setup_mouse_tracking_for_all()
        
        # 連接頁面載入完成信號
        self.web_view.loadFinished.connect(self.on_load_finished)
        
    def create_close_button(self):
        """創建關閉按鈕（左下角，雙倍大小）"""
        self.close_button = QPushButton("✕", self)
        self.close_button.setFixedSize(80, 80)  # 雙倍大小 (原來40x40)
        self.close_button.setStyleSheet("""
            QPushButton {
                background-color: rgba(255, 0, 0, 0.7);
                color: white;
                border: none;
                border-radius: 40px;
                font-size: 36px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: rgba(255, 0, 0, 0.9);
            }
            QPushButton:pressed {
                background-color: rgba(200, 0, 0, 1.0);
            }
        """)
        self.close_button.clicked.connect(self.confirm_close)  # 改為確認關閉
        self.close_button.hide()  # 初始隱藏
        
        # 設定關閉按鈕的提示
        self.close_button.setToolTip("關閉應用程式")
    
    def confirm_close(self):
        """顯示關閉確認對話框（自定義位置和尺寸）"""
        # 獲取自定義配置
        config = self.get_dialog_config()
        
        # 創建自定義的訊息框
        msg_box = QMessageBox(self)
        msg_box.setWindowTitle(config['title'])
        msg_box.setText(config['text'])
        msg_box.setIcon(QMessageBox.Warning)  # 改為警告圖示（驚嘆號）
        
        # 移除邊框和標題欄
        msg_box.setWindowFlags(Qt.FramelessWindowHint | Qt.Dialog)
        
        # 添加自定義按鈕
        yes_button = msg_box.addButton('是', QMessageBox.YesRole)
        no_button = msg_box.addButton('否', QMessageBox.NoRole)
        msg_box.setDefaultButton(no_button)  # 預設選擇「否」
        
        # 設定對話框的位置和尺寸
        msg_box.setGeometry(config['x'], config['y'], config['width'], config['height'])
        
        # 設定對話框樣式
        msg_box.setStyleSheet(config['style'])
        
        # print(f"顯示確認對話框：位置({config['x']}, {config['y']})，尺寸({config['width']}x{config['height']})")
        
        # 顯示對話框並等待用戶選擇
        result = msg_box.exec_()
        
        if msg_box.clickedButton() == yes_button:
            print("用戶確認關閉程式")
            self.close()
        else:
            print("用戶取消關閉程式")
            # 隱藏關閉按鈕
            self.close_button.hide()
            
    def get_dialog_config(self):
        """獲取對話框配置 - 您可以在這裡自定義所有設定"""
        
        # 📏 對話框尺寸設定
        width = 400
        height = 200
        
        # 📍 位置計算選項 - 請選擇其中一種方式
        
        x = 310  # 距離螢幕左邊的像素
        y = 860  # 距離螢幕上邊的像素
        
        return {
            'title': '確認關閉',
            'text': '確定要關閉程式嗎？',
            'x': x,
            'y': y,
            'width': width,
            'height': height,
            'style': """
                QMessageBox {
                    background-color: white;
                    color: red;
                    font-size: 28px;
                    border: none;
                    border-radius: 15px;
                    padding: 30px 20px 20px 20px;
                }
                QMessageBox QLabel {
                    color: red;
                    font-weight: bold;
                    padding: 15px;
                    margin-top: 20px;
                    qproperty-alignment: 'AlignHCenter | AlignVCenter';
                }
                QMessageBox QLabel:first-child {
                    qproperty-alignment: 'AlignHCenter | AlignVCenter';
                    margin-top: 0px;
                    padding-top: 0px;
                }
                QMessageBox QPushButton {
                    background-color: #f0f0f0;
                    color: black;
                    border: 1px solid #ccc;
                    padding: 12px 24px;
                    margin: 8px;
                    border-radius: 8px;
                    font-size: 20px;
                    min-width: 80px;
                }
                QMessageBox QPushButton[text="否"] {
                    background-color: #4a90e2;
                    color: white;
                    border: none;
                }
                QMessageBox QPushButton[text="否"]:hover {
                    background-color: #357abd;
                }
                QMessageBox QPushButton[text="否"]:pressed {
                    background-color: #2968a3;
                }
                QMessageBox QPushButton[text="是"] {
                    background-color: #e74c3c;
                    color: white;
                    border: none;
                }
                QMessageBox QPushButton[text="是"]:hover {
                    background-color: #c0392b;
                }
                QMessageBox QPushButton[text="是"]:pressed {
                    background-color: #a93226;
                }
            """
        }
    
    def setup_mouse_hide_timer(self):
        """設定滑鼠隱藏計時器"""
        self.mouse_hide_timer = QTimer()
        self.mouse_hide_timer.timeout.connect(self.hide_mouse_cursor)
        self.mouse_hide_timer.setSingleShot(False)  # 只執行一次
        self.mouse_hide_timer.start(3000)  # 3秒後隱藏滑鼠
        
        # 添加全域滑鼠位置監控
        self.last_mouse_pos = None
        self.mouse_check_timer = QTimer()
        self.mouse_check_timer.timeout.connect(self.check_mouse_movement)
        self.mouse_check_timer.start(50)  # 每50毫秒檢查一次滑鼠位置
    
    def hide_mouse_cursor(self):
        """隱藏滑鼠指標（包括所有子widget）和關閉按鈕"""
        self.set_cursor_for_all_widgets(Qt.BlankCursor)
        
        # 同時隱藏關閉按鈕
        if self.close_button and not self.close_button.isHidden():
            self.close_button.hide()
        
        # print("滑鼠指標已隱藏（包括所有子widget）")
    
    def show_mouse_cursor(self):
        """顯示滑鼠指標（包括所有子widget）和關閉按鈕"""
        self.set_cursor_for_all_widgets(Qt.ArrowCursor)
        
        # 同時顯示關閉按鈕在左下角
        if self.close_button:
            window_height = self.height()
            self.close_button.move(10, window_height - 90)  # 左下角位置
            self.close_button.show()
            self.close_button.raise_()
        
        # print("滑鼠指標已顯示（包括所有子widget）")
    
    def set_cursor_for_all_widgets(self, cursor):
        """為所有widget設定滑鼠指標"""
        # 設定主視窗
        self.setCursor(cursor)
        
        # 設定中央widget
        central_widget = self.centralWidget()
        if central_widget:
            central_widget.setCursor(cursor)
        
        # 設定WebEngineView
        if self.web_view:
            self.web_view.setCursor(cursor)
        
        # 設定關閉按鈕（但保持其功能性）
        if self.close_button:
            if cursor == Qt.BlankCursor:
                # 隱藏滑鼠時，關閉按鈕也隱藏指標
                self.close_button.setCursor(Qt.BlankCursor)
            else:
                # 顯示滑鼠時，關閉按鈕使用指向手形
                self.close_button.setCursor(Qt.PointingHandCursor)
        
        # 遞歸設定所有子widget
        self.set_cursor_recursive(self, cursor)
    
    def set_cursor_recursive(self, widget, cursor):
        """遞歸設定所有子widget的滑鼠指標"""
        try:
            # 獲取所有子widget
            children = widget.findChildren(QWidget)
            for child in children:
                # 跳過已經特別處理的widget
                if child in [self.web_view, self.close_button]:
                    continue
                
                # 設定子widget的滑鼠指標
                child.setCursor(cursor)
                
                # 確保子widget啟用滑鼠追蹤
                if cursor == Qt.BlankCursor:
                    child.setMouseTracking(True)
        except Exception as e:
            print(f"設定子widget滑鼠指標時出現警告: {e}")
    
    def setup_mouse_tracking_for_all(self):
        """為所有widget啟用滑鼠追蹤"""
        # 主視窗
        self.setMouseTracking(True)
        
        # 中央widget
        central_widget = self.centralWidget()
        if central_widget:
            central_widget.setMouseTracking(True)
        
        # WebEngineView
        if self.web_view:
            self.web_view.setMouseTracking(True)
        
        # 關閉按鈕
        if self.close_button:
            self.close_button.setMouseTracking(True)
        
        # 遞歸設定所有子widget
        self.enable_mouse_tracking_recursive(self)
    
    def enable_mouse_tracking_recursive(self, widget):
        """遞歸啟用所有子widget的滑鼠追蹤"""
        try:
            children = widget.findChildren(QWidget)
            for child in children:
                child.setMouseTracking(True)
        except Exception as e:
            print(f"啟用子widget滑鼠追蹤時出現警告: {e}")
    
    def check_mouse_movement(self):
        """檢查滑鼠移動（全域監控）"""
        try:
            from PyQt5.QtGui import QCursor
            current_pos = QCursor.pos()  # 獲取全域滑鼠位置
            
            if self.last_mouse_pos is not None:
                # 計算滑鼠移動距離
                dx = abs(current_pos.x() - self.last_mouse_pos.x())
                dy = abs(current_pos.y() - self.last_mouse_pos.y())
                movement_distance = (dx * dx + dy * dy) ** 0.5
                
                # 可調整的敏感度設定 - 您可以修改這個值
                sensitivity_threshold = 1  # 移動超過1像素就檢測到（非常敏感）
                
                # 如果移動距離超過閾值
                if movement_distance > sensitivity_threshold:
                    # 檢查滑鼠是否在視窗範圍內
                    window_geometry = self.geometry()
                    local_pos = self.mapFromGlobal(current_pos)
                    
                    if (0 <= local_pos.x() <= window_geometry.width() and 
                        0 <= local_pos.y() <= window_geometry.height()):
                        # 滑鼠在視窗內移動
                        self.on_mouse_movement_detected(local_pos)
                        # print(f"全域檢測到滑鼠移動: 距離={movement_distance:.1f}像素")
            
            self.last_mouse_pos = current_pos
            
        except Exception as e:
            # 靜默處理錯誤，避免干擾正常運行
            pass
    
    def on_mouse_movement_detected(self, local_pos):
        """檢測到滑鼠移動時的處理（簡化版本）"""
        # 重置隱藏計時器
        self.reset_mouse_hide_timer()
        
        # 顯示滑鼠指標和關閉按鈕
        self.show_mouse_cursor()
    
    def mousePressEvent(self, event: QMouseEvent):
        """處理滑鼠按下事件（簡化版本）"""
        # 重置滑鼠隱藏計時器
        self.reset_mouse_hide_timer()
        
        # 顯示滑鼠指標和關閉按鈕
        self.show_mouse_cursor()
        
        super().mousePressEvent(event)
    
    def mouseMoveEvent(self, event: QMouseEvent):
        """處理滑鼠移動事件（簡化版本，只負責重置計時器和顯示滑鼠）"""
        # 重置滑鼠隱藏計時器
        self.reset_mouse_hide_timer()
        
        # 顯示滑鼠指標和關閉按鈕
        self.show_mouse_cursor()
        
        super().mouseMoveEvent(event)
    
    def reset_mouse_hide_timer(self):
        """重置滑鼠隱藏計時器"""
        if self.mouse_hide_timer:
            self.mouse_hide_timer.stop()
            self.mouse_hide_timer.start(3000)  # 重新開始2秒計時
    
    def enterEvent(self, event):
        """滑鼠進入視窗事件"""
        # print("滑鼠進入視窗")
        # 重置滑鼠隱藏計時器
        self.reset_mouse_hide_timer()
        
        # 顯示滑鼠指標
        self.show_mouse_cursor()
        
        super().enterEvent(event)
    
    def leaveEvent(self, event):
        """滑鼠離開視窗事件"""
        # print("滑鼠離開視窗")
        
        # 停止滑鼠隱藏計時器（離開視窗時不需要計時）
        if self.mouse_hide_timer:
            self.mouse_hide_timer.stop()
        
        # 立即隱藏滑鼠指標和關閉按鈕（離開視窗時）
        self.hide_mouse_cursor()
        
        super().leaveEvent(event)
    
    def eventFilter(self, obj, event):
        """事件過濾器 - 特別處理WebEngineView的滑鼠事件（簡化版本）"""
        if obj == self.web_view:
            # 處理多種滑鼠相關事件
            if event.type() in [QEvent.MouseMove, QEvent.HoverMove, QEvent.MouseButtonPress, 
                               QEvent.MouseButtonRelease, QEvent.HoverEnter, QEvent.HoverLeave]:
                # WebEngineView的滑鼠相關事件
                self.reset_mouse_hide_timer()
                self.show_mouse_cursor()
                        
            elif event.type() == QEvent.Leave:
                # WebEngineView的滑鼠離開事件
                # print("滑鼠離開WebEngineView")
                pass
                    
            elif event.type() == QEvent.Enter:
                # WebEngineView的滑鼠進入事件
                # print("滑鼠進入WebEngineView")
                self.reset_mouse_hide_timer()
                self.show_mouse_cursor()
        
        # 呼叫父類的事件過濾器
        return super().eventFilter(obj, event)
    
    def on_load_finished(self, success):
        """頁面載入完成後的處理"""
        if success:
            print("網頁載入成功")
            # 注入JavaScript來解決相容性問題和啟動AudioContext
            self.inject_compatibility_scripts()
        else:
            print("網頁載入失敗")
    
    def inject_compatibility_scripts(self):
        """注入相容性腳本來解決JavaScript問題"""
        compatibility_script = """
        // 解決AudioContext問題
        (function() {
            try {
                // 嘗試啟動AudioContext（如果存在）
                if (window.AudioContext || window.webkitAudioContext) {
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    if (audioContext.state === 'suspended') {
                        // 自動恢復AudioContext
                        audioContext.resume().catch(e => {
                            console.log('AudioContext已準備就緒，等待用戶互動');
                        });
                    }
                }
            } catch (e) {
                console.log('AudioContext設定完成');
            }
            
            // 解決Array.at方法的相容性問題
            if (!Array.prototype.at) {
                Array.prototype.at = function(index) {
                    if (index >= 0) {
                        return this[index];
                    } else {
                        return this[this.length + index];
                    }
                };
            }
            
            // 添加點擊事件監聽器來啟動AudioContext
            document.addEventListener('click', function() {
                try {
                    if (window.AudioContext || window.webkitAudioContext) {
                        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                        if (audioContext.state === 'suspended') {
                            audioContext.resume();
                        }
                    }
                } catch (e) {
                    // 靜默處理
                }
            }, { once: true });
            
            console.log('相容性腳本已載入');
        })();
        """
        
        # 執行相容性腳本
        self.web_view.page().runJavaScript(compatibility_script, lambda result: None)
        
        # 延遲執行模擬用戶點擊（用於啟動AudioContext）
        QTimer.singleShot(2000, self.simulate_user_interaction)
    
    def simulate_user_interaction(self):
        """模擬用戶互動來啟動AudioContext"""
        simulate_script = """
        // 模擬用戶點擊來啟動AudioContext
        (function() {
            try {
                const event = new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true
                });
                document.body.dispatchEvent(event);
                console.log('已模擬用戶互動以啟動AudioContext');
            } catch (e) {
                console.log('用戶互動模擬完成');
            }
        })();
        """
        self.web_view.page().runJavaScript(simulate_script, lambda result: None)
        
    def setup_custom_window_geometry(self):
        """設定自定義視窗幾何形狀 - 跨螢幕顯示"""
        app = QApplication.instance()
        
        # 獲取所有螢幕資訊
        screens = app.screens()
        print(f"檢測到 {len(screens)} 個螢幕")
        
        # 顯示每個螢幕的資訊
        for i, screen in enumerate(screens):
            geometry = screen.geometry()
            print(f"螢幕 {i}: x={geometry.x()}, y={geometry.y()}, "
                  f"width={geometry.width()}, height={geometry.height()}")
        
        if len(screens) >= 2:
            # 多螢幕模式：計算跨螢幕座標
            # 假設您有兩個螢幕，我們要讓視窗橫跨兩個螢幕
            
            # 獲取所有螢幕的邊界
            min_x = min(screen.geometry().x() for screen in screens)
            max_x = max(screen.geometry().x() + screen.geometry().width() for screen in screens)
            min_y = min(screen.geometry().y() for screen in screens)
            max_y = max(screen.geometry().y() + screen.geometry().height() for screen in screens)
            
            # 計算總寬度和高度
            total_width = max_x - min_x
            total_height = max_y - min_y
            
            print(f"總螢幕區域: x={min_x}, y={min_y}, width={total_width}, height={total_height}")
            
            # 您想要的尺寸
            target_width = 2160
            target_height = 1920
            
            # 計算讓視窗置中跨螢幕的座標
            # 如果您希望視窗從左螢幕延伸到右螢幕
            if total_width >= target_width:
                # 置中計算
                x = min_x + (total_width - target_width) // 2
            else:
                # 如果總寬度不夠，從最左邊開始
                x = min_x
            
            # 垂直置中
            if total_height >= target_height:
                y = min_y + (total_height - target_height) // 2
            else:
                y = min_y
            
            print(f"計算的跨螢幕位置: x={x}, y={y}, width={target_width}, height={target_height}")
            
        else:
            # 單螢幕模式：使用您原本的設定
            print("單螢幕模式，使用預設座標")
            target_width = 2160
            target_height = 1920
            x = 100
            y = 100
        
        # macOS特殊處理：多步驟設定視窗幾何
        if sys.platform == "darwin":
            print("啟用macOS跨螢幕特殊處理...")
            self.setup_macos_cross_screen_window(x, y, target_width, target_height)
        else:
            # 設定視窗幾何形狀
            self.setGeometry(x, y, target_width, target_height)
        
        self.is_custom_size = True  # 標記為自定義尺寸
        
        # 確保視窗顯示
        self.show()
        self.raise_()
        self.activateWindow()
        
        print(f"視窗已設定為跨螢幕顯示: x={x}, y={y}, width={target_width}, height={target_height}")
        
        # 驗證視窗實際位置
        actual_geometry = self.geometry()
        print(f"實際視窗幾何: x={actual_geometry.x()}, y={actual_geometry.y()}, "
              f"width={actual_geometry.width()}, height={actual_geometry.height()}")
        
        # 檢查視窗是否真的跨螢幕
        self.check_screen_coverage()
        
    def setup_macos_cross_screen_window(self, x, y, width, height):
        """macOS專用的跨螢幕視窗設定"""
        print(f"macOS跨螢幕設定: x={x}, y={y}, width={width}, height={height}")
        
        # 步驟1: 先隱藏視窗
        self.hide()
        
        # 步驟2: 移除所有視窗管理限制
        original_flags = self.windowFlags()
        bypass_flags = (
            Qt.Window |
            Qt.FramelessWindowHint |
            Qt.WindowStaysOnTopHint |
            Qt.BypassWindowManagerHint |  # 重要：繞過視窗管理器
            Qt.X11BypassWindowManagerHint  # 額外保險
        )
        self.setWindowFlags(bypass_flags)
        
        # 步驟3: 設定特殊屬性
        self.setAttribute(Qt.WA_DontShowOnScreen, False)
        self.setAttribute(Qt.WA_MacOpaqueSizeGrip, False)
        self.setAttribute(Qt.WA_MacNoShadow, True)
        
        # 步驟4: 強制設定幾何
        self.setGeometry(x, y, width, height)
        
        # 步驟5: 使用原生API（如果可能）
        try:
            # 嘗試使用Qt的原生接口
            self.winId()  # 確保原生視窗已創建
            
            # 再次強制設定位置
            self.move(x, y)
            self.resize(width, height)
            
            print("macOS原生視窗設定完成")
            
        except Exception as e:
            print(f"macOS原生設定警告: {e}")
        
        # 步驟6: 重新顯示視窗
        self.show()
        
        # 步驟7: 最後確認位置
        QTimer.singleShot(100, lambda: self.verify_and_adjust_position(x, y, width, height))
    
    def verify_and_adjust_position(self, target_x, target_y, target_width, target_height):
        """驗證並調整視窗位置"""
        current_geometry = self.geometry()
        print(f"最終位置驗證: 目標=({target_x}, {target_y}, {target_width}, {target_height})")
        print(f"實際=({current_geometry.x()}, {current_geometry.y()}, {current_geometry.width()}, {current_geometry.height()})")
        
        # 如果位置不正確，再次嘗試設定
        if (abs(current_geometry.x() - target_x) > 10 or 
            abs(current_geometry.y() - target_y) > 10):
            print("位置不正確，重新調整...")
            self.setGeometry(target_x, target_y, target_width, target_height)
            
            # 最後的檢查
            QTimer.singleShot(500, self.final_position_check)
    
    def final_position_check(self):
        """最終位置檢查"""
        print("=== 最終位置檢查 ===")
        self.check_screen_coverage()
        
    def test_macos_cross_screen_methods(self):
        """測試macOS的不同跨螢幕方法"""
        print("\n=== macOS跨螢幕測試模式 ===")
        print("測試方法1: 使用BypassWindowManagerHint")
        
        # 方法1: 完全繞過視窗管理器
        self.setWindowFlags(
            Qt.Window |
            Qt.FramelessWindowHint |
            Qt.BypassWindowManagerHint |
            Qt.WindowStaysOnTopHint
        )
        
        # 強制設定位置
        self.setGeometry(-1080, 0, 2160, 1920)
        self.show()
        
        # 延遲檢查
        QTimer.singleShot(1000, self.check_method_1_result)
    
    def check_method_1_result(self):
        """檢查方法1的結果"""
        print("方法1結果:")
        self.check_screen_coverage()
        
        # 給出macOS系統設定建議
        print("\n=== macOS跨螢幕設定指引 ===")
        print("macOS版本不同，設定路徑可能不同，請嘗試以下路徑：")
        print("\n【方法1 - macOS Ventura/Monterey/Big Sur (較新版本)】")
        print("1. 蘋果選單 → 系統設定 (System Settings)")
        print("2. 側邊欄選擇「桌面與Dock」")
        print("3. 向下滾動找到「Mission Control」區域")
        print("4. 關閉「顯示器具有分離的空間」或 'Displays have separate Spaces'")
        print("\n【方法2 - macOS Mojave/Catalina/Big Sur (較舊版本)】")
        print("1. 蘋果選單 → 系統偏好設定 (System Preferences)")
        print("2. 點選「Mission Control」或「調度中心」")
        print("3. 取消勾選「顯示器有單獨的工作空間」或 'Displays have separate Spaces'")
        print("\n【方法3 - 使用終端機 (任何版本)】")
        print("在終端機執行以下命令：")
        print("defaults write com.apple.spaces spans-displays -bool true")
        print("killall Dock")
        print("\n【驗證設定】")
        print("設定完成後，請:")
        print("1. 登出並重新登入，或重新啟動電腦")
        print("2. 重新運行本程式測試")
        print("3. 如果還是無法跨螢幕，按 Ctrl+5 嘗試替代方案")
        
    def setup_normal_window_geometry(self):
        """設定正常視窗幾何形狀"""
        width = 1200
        height = 800
        x = 100
        y = 100
        
        print(f"設定正常視窗尺寸: x={x}, y={y}, width={width}, height={height}")
        
        # 設定視窗幾何形狀
        self.setGeometry(x, y, width, height)
        self.is_custom_size = False  # 標記為正常尺寸
        
        # 確保視窗顯示
        self.show()
        self.raise_()
        self.activateWindow()
        
        print("視窗已設定為正常尺寸")
    
    def check_screen_coverage(self):
        """檢查視窗覆蓋了哪些螢幕"""
        app = QApplication.instance()
        screens = app.screens()
        window_geometry = self.geometry()
        
        covered_screens = []
        
        for i, screen in enumerate(screens):
            screen_geometry = screen.geometry()
            
            # 檢查視窗是否與這個螢幕有重疊
            if (window_geometry.intersects(screen_geometry)):
                # 計算重疊區域
                intersection = window_geometry.intersected(screen_geometry)
                overlap_area = intersection.width() * intersection.height()
                screen_area = screen_geometry.width() * screen_geometry.height()
                window_area = window_geometry.width() * window_geometry.height()
                
                # 計算重疊百分比
                overlap_percentage_of_screen = (overlap_area / screen_area) * 100
                overlap_percentage_of_window = (overlap_area / window_area) * 100
                
                covered_screens.append({
                    'screen_index': i,
                    'screen_geometry': screen_geometry,
                    'intersection': intersection,
                    'overlap_area': overlap_area,
                    'overlap_percentage_of_screen': overlap_percentage_of_screen,
                    'overlap_percentage_of_window': overlap_percentage_of_window
                })
                
                print(f"螢幕 {i} 覆蓋情況:")
                print(f"  - 重疊區域: {intersection}")
                print(f"  - 重疊面積: {overlap_area} 像素²")
                print(f"  - 佔螢幕比例: {overlap_percentage_of_screen:.1f}%")
                print(f"  - 佔視窗比例: {overlap_percentage_of_window:.1f}%")
        
        if len(covered_screens) > 1:
            print(f"✅ 視窗成功跨越 {len(covered_screens)} 個螢幕！")
        elif len(covered_screens) == 1:
            print(f"⚠️  視窗只在螢幕 {covered_screens[0]['screen_index']} 上顯示")
        else:
            print("❌ 視窗不在任何螢幕的可見區域內")
            
        return covered_screens
    
    def check_server_status(self):
        """檢查伺服器是否正在運行"""
        try:
            response = requests.get(self.server_url, timeout=5)
            return response.status_code == 200
        except requests.exceptions.RequestException:
            return False
    
    def start_node_server(self):
        """啟動Node.js伺服器"""
        try:
            print("正在啟動Node.js伺服器...")
            current_dir = os.path.dirname(os.path.abspath(__file__))
            
            self.server_process = subprocess.Popen(
                ['node', 'server.js'],
                cwd=current_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True
            )
            
            # 等待伺服器啟動
            for _ in range(30):
                if self.check_server_status():
                    print("Node.js伺服器已成功啟動！")
                    return True
                time.sleep(1)
            
            print("伺服器啟動超時")
            return False
            
        except FileNotFoundError:
            print("錯誤：找不到Node.js。請確保已安裝Node.js並且在PATH中。")
            return False
        except Exception as e:
            print(f"啟動伺服器時發生錯誤：{e}")
            return False
    
    def stop_server(self):
        """停止Node.js伺服器"""
        if self.server_process:
            self.server_process.terminate()
            self.server_process.wait()
            print("Node.js伺服器已停止")
    
    def load_web_content(self):
        """載入網頁內容"""
        if self.web_view:
            self.web_view.setUrl(QUrl(self.server_url))
            print(f"正在載入: {self.server_url}")
    
    def keyPressEvent(self, event):
        """處理按鍵事件"""
        if event.key() == Qt.Key_Escape:
            # ESC鍵退出應用程式
            self.close()
        elif event.key() == Qt.Key_F11:
            # F11切換自定義視窗尺寸和正常尺寸
            if self.is_custom_size:
                self.setup_normal_window_geometry()
            else:
                self.setup_custom_window_geometry()
        elif event.key() == Qt.Key_F12:
            # F12顯示螢幕資訊和視窗覆蓋情況
            print("\n=== 螢幕資訊調試 ===")
            self.check_screen_coverage()
        elif event.key() == Qt.Key_1 and event.modifiers() == Qt.ControlModifier:
            # Ctrl+1: 測試位置1 - 完全跨螢幕
            print("測試位置1: 完全跨螢幕")
            self.setGeometry(-1080, 0, 2160, 1920)
            self.check_screen_coverage()
        elif event.key() == Qt.Key_2 and event.modifiers() == Qt.ControlModifier:
            # Ctrl+2: 測試位置2 - 從左螢幕中間開始
            print("測試位置2: 從左螢幕中間開始")
            self.setGeometry(-540, 0, 2160, 1920)
            self.check_screen_coverage()
        elif event.key() == Qt.Key_3 and event.modifiers() == Qt.ControlModifier:
            # Ctrl+3: 測試位置3 - 完全在左螢幕
            print("測試位置3: 完全在左螢幕")
            self.setGeometry(-1920, 0, 1920, 1080)
            self.check_screen_coverage()
        elif event.key() == Qt.Key_4 and event.modifiers() == Qt.ControlModifier:
            # Ctrl+4: 測試macOS特殊模式
            print("測試macOS特殊跨螢幕模式")
            if sys.platform == "darwin":
                self.test_macos_cross_screen_methods()
            else:
                print("此模式僅適用於macOS")
        elif event.key() == Qt.Key_5 and event.modifiers() == Qt.ControlModifier:
            # Ctrl+5: 使用終端機命令設定
            print("使用終端機命令設定跨螢幕")
            if sys.platform == "darwin":
                self.apply_terminal_fix()
            else:
                print("此模式僅適用於macOS")
        elif event.key() == Qt.Key_R and event.modifiers() == Qt.ControlModifier:
            # Ctrl+R重新載入頁面
            self.web_view.reload()
            print("正在重新載入頁面...")
        elif event.key() == Qt.Key_Q and event.modifiers() == Qt.ControlModifier:
            # Ctrl+Q退出應用程式
            self.close()
        super().keyPressEvent(event)
    
    def closeEvent(self, event):
        """視窗關閉事件"""
        self.stop_server()
        print("應用程式已關閉")
        event.accept()
    
    def run(self):
        """運行應用程式"""
        print("正在啟動達爾頓動畫桌面應用程式 (PyQt5版本)...")
        
        # 檢查並啟動伺服器
        if not self.check_server_status():
            print("伺服器未運行，正在啟動...")
            if not self.start_node_server():
                print("無法啟動伺服器，請檢查Node.js是否已正確安裝")
                return False
        else:
            print("伺服器已在運行中")
        
        # 設定自定義視窗幾何形狀
        self.setup_custom_window_geometry()
        
        # 載入網頁內容
        self.load_web_content()
        
        return True

    def apply_terminal_fix(self):
        """使用終端機命令自動修復macOS跨螢幕設定"""
        print("\n=== 自動修復macOS跨螢幕設定 ===")
        print("正在執行終端機命令...")
        
        import subprocess
        
        try:
            # 執行設定命令
            result1 = subprocess.run([
                'defaults', 'write', 'com.apple.spaces', 'spans-displays', '-bool', 'true'
            ], capture_output=True, text=True)
            
            if result1.returncode == 0:
                print("✅ 成功設定 spans-displays = true")
            else:
                print(f"❌ 設定失敗: {result1.stderr}")
                
            # 重啟Dock
            result2 = subprocess.run(['killall', 'Dock'], capture_output=True, text=True)
            
            if result2.returncode == 0:
                print("✅ 成功重啟Dock")
            else:
                print(f"⚠️  重啟Dock警告: {result2.stderr}")
            
            print("\n🎉 自動修復完成！")
            print("請等待幾秒鐘讓Dock重新啟動，然後測試跨螢幕功能")
            
            # 延遲測試
            QTimer.singleShot(3000, self.test_after_terminal_fix)
            
        except Exception as e:
            print(f"❌ 執行終端機命令時發生錯誤: {e}")
            print("\n手動執行這些命令:")
            print("defaults write com.apple.spaces spans-displays -bool true")
            print("killall Dock")
    
    def test_after_terminal_fix(self):
        """終端機修復後的測試"""
        print("\n=== 終端機修復後測試 ===")
        print("重新測試跨螢幕功能...")
        
        # 重新設定視窗到跨螢幕位置
        self.setGeometry(-1080, 0, 2160, 1920)
        self.show()
        self.raise_()
        
        # 檢查結果
        QTimer.singleShot(1000, self.final_cross_screen_test)
    
    def final_cross_screen_test(self):
        """最終的跨螢幕測試"""
        print("=== 最終跨螢幕測試結果 ===")
        coverage = self.check_screen_coverage()
        
        if len(coverage) > 1:
            print("🎉 恭喜！跨螢幕顯示成功！")
        else:
            print("😔 仍然無法跨螢幕顯示")
            print("\n可能的原因:")
            print("1. 需要重新登入或重啟電腦")
            print("2. 某些macOS版本可能不支援")
            print("3. 螢幕配置特殊")
            print("\n替代方案:")
            print("- 考慮使用兩個分別的視窗分別顯示在兩個螢幕上")
            print("- 或調整視窗大小適應單一螢幕")

def main():
    """主函數"""
    print("=" * 50)
    print("達爾頓動畫桌面應用程式 (PyQt5版本)")
    print("=" * 50)
    
    # ──────────────────────────────────────────────
    # 效能最大化：Chromium 命令列旗標
    # 必須在 QApplication 建立之前設定
    # ──────────────────────────────────────────────
    os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = " ".join([
        # GPU 加速
        "--enable-gpu-rasterization",           # GPU 光柵化
        "--enable-zero-copy",                   # 零拷貝渲染，減少記憶體複製
        "--ignore-gpu-blocklist",               # 忽略 GPU 黑名單，強制啟用 GPU
        "--enable-native-gpu-memory-buffers",   # 原生 GPU 記憶體緩衝
        "--enable-oop-rasterization",           # 獨立程序 GPU 光柵化
        "--enable-raw-draw",                    # 直接繪製，減少合成開銷
        # 渲染執行緒
        "--num-raster-threads=4",               # 光柵化執行緒數（建議 4）
        # 影格率
        "--disable-frame-rate-limit",           # 移除 60fps 限制
        # Canvas / WebGL
        "--enable-accelerated-2d-canvas",       # 加速 2D Canvas（p5.js 使用）
        "--enable-webgl",                       # 確保 WebGL 開啟
        "--enable-webgl2",                      # 啟用 WebGL2
        # 記憶體
        "--max-gum-fps=120",                    # 提高最大 GPU 影格率
        "--disable-gpu-vsync",                  # 關閉 GPU VSync，降低延遲
        # 其他
        "--disable-background-timer-throttling", # 停用背景分頁節流
        "--disable-renderer-backgrounding",      # 停用背景渲染器降速
    ])
    
    # 設定高DPI支援 - 必須在QApplication創建之前設定
    QApplication.setAttribute(Qt.AA_EnableHighDpiScaling, True)
    QApplication.setAttribute(Qt.AA_UseHighDpiPixmaps, True)
    QApplication.setAttribute(Qt.AA_UseDesktopOpenGL, True)   # 強制使用桌面 OpenGL
    QApplication.setAttribute(Qt.AA_ShareOpenGLContexts, True) # 共享 OpenGL context
    
    # 建立QApplication
    app = QApplication(sys.argv)
    
    # 檢查依賴
    try:
        import requests
        from PyQt5.QtWebEngineWidgets import QWebEngineView
    except ImportError as e:
        print(f"缺少必要的Python庫：{e}")
        print("請運行以下命令安裝依賴：")
        print("pip install PyQt5 PyQtWebEngine requests")
        return
    
    # 建立並運行應用程式
    dalton_app = DaltonAnimationPyQt5App()
    
    try:
        if dalton_app.run():
            # 顯示使用說明
            print("\n🎮 控制說明:")
            print("【鍵盤控制】")
            # print("- ESC: 退出應用程式")
            # print("- F11: 切換自定義視窗尺寸和正常尺寸")
            # print("- F12: 顯示螢幕資訊和視窗覆蓋情況")
            # print("- Ctrl+1: 測試位置1 - 完全跨螢幕")
            # print("- Ctrl+2: 測試位置2 - 從左螢幕中間開始")
            # print("- Ctrl+3: 測試位置3 - 完全在左螢幕")
            # print("- Ctrl+4: 測試macOS特殊模式")
            # print("- Ctrl+5: 使用終端機命令設定")
            # print("- Ctrl+R: 重新載入頁面")
            print("- Ctrl+Q: 退出應用程式")
            print("\n【滑鼠控制】")
            print("- 滑鼠靜止3秒: 自動隱藏滑鼠指標和關閉按鈕")
            print("- 移動滑鼠: 重新顯示滑鼠指標和關閉按鈕")
            print("- 關閉按鈕: 固定在左下角 (80x80)，與滑鼠同步顯示/隱藏")
            print("- 點擊關閉按鈕: 顯示確認對話框")
            # print("- 🔥 超敏感檢測: 移動1像素即可喚醒滑鼠和關閉按鈕")
            # print("- 🔥 全域監控: 50ms間隔檢測滑鼠位置")
            # print("- 🔥 多重事件: 支援所有滑鼠和hover事件")
            # print("- 🔥 同步控制: 滑鼠和關閉按鈕完全同步顯示/隱藏")
            
            # 進入事件迴圈
            sys.exit(app.exec_())
        else:
            print("應用程式啟動失敗")
    except KeyboardInterrupt:
        print("\n收到中斷信號，正在關閉應用程式...")
        dalton_app.stop_server()
    except Exception as e:
        print(f"運行應用程式時發生錯誤：{e}")
        dalton_app.stop_server()

if __name__ == "__main__":
    main() 