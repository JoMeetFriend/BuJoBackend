process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
// 注意：TZ 不能在這裡設——setupFiles 執行時 V8 的 localtime 快取已經用啟動時的
// TZ 初始化過，這裡才改 process.env.TZ 對 Date 解析不會生效。TZ=Asia/Taipei
// 固定在 package.json 的 test scripts（process 啟動前）與 Dockerfile 裡。
