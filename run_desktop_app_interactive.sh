#!/bin/bash

# 道爾頓動畫桌面應用程式啟動腳本

# 設置信號處理器，確保在腳本被終止時清理子程序
cleanup() {
    echo "正在清理程序..."
    if [ ! -z "$DESKTOP_APP_PID" ]; then
        kill $DESKTOP_APP_PID 2>/dev/null || true
    fi
    if [ ! -z "$GENERATE_IMAGE_PID" ]; then
        kill $GENERATE_IMAGE_PID 2>/dev/null || true
    fi
    echo "清理完成"
    exit 0
}

# 捕捉終止信號
trap cleanup SIGINT SIGTERM

ulimit -n 65536
emqx start &
sleep 5

echo "===================================="
echo "道爾頓動畫桌面應用程式啟動器"
echo "===================================="

echo "正在啟動達爾頓動畫桌面應用程式..."

# 啟動桌面應用程式
source /Users/mac/Documents/dalton_animation/venv/bin/activate
python /Users/mac/Documents/dalton_animation/desktop_app_pyqt5.py --interactive &
DESKTOP_APP_PID=$!
deactivate

# 啟動圖片生成程式
source /Users/mac/Documents/diffusion_noise_substitution/venv/bin/activate
python /Users/mac/Documents/diffusion_noise_substitution/generate_image.py --mode interactive &
GENERATE_IMAGE_PID=$!
deactivate

# 等待桌面應用程式結束
wait $DESKTOP_APP_PID

# 當桌面應用程式結束時，終止圖片生成程式
echo "桌面應用程式已關閉，正在終止圖片生成程式..."
kill $GENERATE_IMAGE_PID 2>/dev/null || true

echo "所有程式已終止"