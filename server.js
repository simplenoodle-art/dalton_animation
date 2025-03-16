const express = require('express');
const app = express();
const port = 3000;
const path = require('path');

// 設置 MIME 類型
express.static.mime.define({'application/javascript': ['js']});

// 允許跨域請求
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// 處理 JSON 請求
app.use(express.json());

// 提供靜態文件，確保使用絕對路徑
app.use(express.static(path.join(__dirname, 'public')));

// POST API 接收新的 fixedBins 陣列
app.post('/api/updateBins', (req, res) => {
  const { fixedBins } = req.body;
  
  // 驗證輸入
  if (!Array.isArray(fixedBins)) {
    return res.status(400).json({ error: 'fixedBins must be an array' });
  }
  
  // 廣播新的 fixedBins 到所有連接的客戶端
  if (global.io) {
    global.io.emit('updateBins', fixedBins);
  }
  
  res.json({ success: true });
});

// 設置 Socket.IO
const server = require('http').createServer(app);
const io = require('socket.io')(server);
global.io = io;

io.on('connection', (socket) => {
  console.log('Client connected');
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// 添加錯誤處理中間件
app.use((req, res, next) => {
  res.status(404).send('Sorry, that route does not exist.');
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
}); 