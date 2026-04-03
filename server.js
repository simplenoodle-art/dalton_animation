const express = require('express');
const app = express();
const port = 3000;
const path = require('path');
const find = require('find-process');
const { exec } = require('child_process');

// 設置 MIME 類型
express.static.mime.define({'application/javascript': ['js']});

// 允許跨域請求
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// 提供靜態文件，確保使用絕對路徑
app.use(express.static(path.join(__dirname, 'public')));

// 添加錯誤處理中間件
app.use((req, res, next) => {
  res.status(404).send('Sorry, that route does not exist.');
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// 終止佔用端口的程序
async function killProcessOnPort(port) {
  try {
    // 查找佔用端口的程序
    const processList = await find('port', port);
    
    if (processList.length > 0) {
      console.log(`發現佔用端口 ${port} 的程序：`);
      
      // 對於每個佔用端口的程序
      for (const proc of processList) {
        console.log(`PID: ${proc.pid}, 名稱: ${proc.name}`);
        
        if (process.platform === 'win32') {
          // Windows 平台使用 taskkill
          exec(`taskkill /F /PID ${proc.pid}`, (error) => {
            if (error) {
              console.error(`無法終止程序 ${proc.pid}: ${error}`);
            } else {
              console.log(`成功終止程序 ${proc.pid}`);
            }
          });
        } else {
          // 類 Unix 平台使用 kill
          exec(`kill -9 ${proc.pid}`, (error) => {
            if (error) {
              console.error(`使用 kill 命令無法終止程序 ${proc.pid}: ${error}`);
            } else {
              console.log(`使用 kill 命令成功終止程序 ${proc.pid}`);
            }
          });
        }
      }
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`查找佔用端口的程序時出錯：${error}`);
    return false;
  }
}

// 啟動伺服器
async function startServer(portToUse = port) {
  try {
    // 嘗試啟動伺服器
    console.log(`嘗試在端口 ${portToUse} 啟動伺服器...`);
    const server = app.listen(portToUse, () => {
      console.log(`HTTP Server running at http://localhost:${portToUse}`);
    });
    
    // 監聽錯誤
    server.on('error', async (error) => {
      if (error.code === 'EADDRINUSE') {
        console.log(`端口 ${portToUse} 已被佔用`);
        
        // 嘗試終止佔用端口的程序
        console.log(`嘗試釋放端口 ${portToUse}...`);
        const killed = await killProcessOnPort(portToUse);
        
        if (killed) {
          console.log(`已嘗試終止佔用端口 ${portToUse} 的程序，等待端口釋放...`);
          
          // 等待一段時間，讓端口釋放
          setTimeout(() => {
            // 再次嘗試相同的端口
            startServer(portToUse);
          }, 2000);
        } else {
          // 無法終止程序，使用新端口
          console.log(`無法釋放端口 ${portToUse}，嘗試使用端口 ${portToUse + 1}`);
          startServer(portToUse + 1);
        }
      } else {
        console.error(`啟動伺服器時發生未預期的錯誤：`, error);
      }
    });
  } catch (error) {
    console.error(`啟動伺服器時發生錯誤：`, error);
    
    // 嘗試使用另一個端口
    const newPort = portToUse + 1;
    console.log(`嘗試使用新端口 ${newPort}`);
    startServer(newPort);
  }
}

// 啟動伺服器
startServer(); 