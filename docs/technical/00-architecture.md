# 技术架构

## 运行形态

- Next.js App Router。
- TypeScript。
- React Flow 画布。
- Prisma Client + SQLite。
- Docker + docker-compose。
- TOS/S3 兼容对象存储。
- 火山方舟 Ark API。

## 关键目录

```text
app/
├── api/
│   ├── assets/
│   ├── generations/
│   ├── image-generations/
│   └── projects/
├── globals.css
└── page.tsx

lib/
├── canvas.ts
├── prisma.ts
├── seedance.ts
├── seedream.ts
├── storage.ts
└── validation.ts

scripts/
├── init-db.mjs
└── prepare-standalone.mjs
```

## 静态资源说明

Next.js 使用 `output: "standalone"`，构建后通过 `scripts/prepare-standalone.mjs` 把 `.next/static` 复制到 standalone 目录，保证 Docker 中 CSS/JS 可加载。
