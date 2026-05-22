# Seedance 2.0 视频生成工作台

一个 Docker 化的 Next.js 全栈应用，用于上传图片、视频、音频素材，通过文案和 `@素材名` 引用调用火山方舟 Seedance 2.0 生成视频。

## 运行

1. 复制环境变量：

```bash
cp .env.example .env
```

2. 填写 `.env` 中的 `ARK_API_KEY` 和 S3/TOS 兼容对象存储配置。上传后的素材 URL 必须能被火山方舟访问。

3. 启动：

```bash
docker compose up --build
```

打开 `http://localhost:3000`。

## 本地开发

```bash
npm install
npm run db:init
npm run dev
```

## 环境变量

- `ARK_API_KEY`：火山方舟 API Key。
- `ARK_BASE_URL`：默认 `https://ark.cn-beijing.volces.com/api/v3`。
- `SEEDANCE_MODEL`：默认 `doubao-seedance-2-0-260128`。
- `S3_ENDPOINT`、`S3_REGION`、`S3_BUCKET`、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`：对象存储配置。
- `S3_PUBLIC_BASE_URL`：如果 bucket 或 CDN 可公开访问，填写公开前缀；否则服务会生成临时签名 URL。

## 文档

完整产品和技术文档见 [docs/README.md](docs/README.md)。
