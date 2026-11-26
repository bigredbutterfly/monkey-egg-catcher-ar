# Monkey Egg Catcher AR — DeepSeek 版

一个 AR 游戏：戴上猴子面具，张嘴接住掉落的小吃，用人脸追踪玩。

## 本地运行

**前置要求：** Node.js 22 或 24

1. 安装依赖：
   `npm install`
2. 在 [.env.local](.env.local) 里填 `DEEPSEEK_API_KEY`
   - 在 https://platform.deepseek.com/api_keys 申请
   - 不填也能跑，游戏结束后的点评会用内置的 mock 文案代替
   - 模型默认 `deepseek-flash`，可在 `.env.local` 用 `DEEPSEEK_MODEL` 改成 `deepseek-v4-pro`
3. 运行：
   `npm run dev`
   打开 http://localhost:3000，允许摄像头

## 生产运行

```bash
npm install
npm run build
NODE_ENV=production npm start
```

## 线上地址

https://monkey-egg-catcher-ar-vercel.vercel.app/

当前发布在 Vercel，没有使用阿里云服务器。Vercel 部署时 Framework Preset 选 Vite，Build Command 用 `npm run build`，Output Directory 用 `dist`。

本地开发仍用上面的 `npm run dev`，由 `server.ts` 提供 `/api/commentary` 点评接口。
