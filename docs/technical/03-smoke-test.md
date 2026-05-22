# 冒烟测试

用于每次较大改动后确认应用主路径可用。

## 本地验证

```bash
npm run test
npm run build
```

确认：

- 单元测试全部通过。
- Next.js 生产构建通过。
- 构建输出应包含首页和所有 `/api/*` 路由。

## Docker 验证

```bash
docker compose up -d --build
curl -sS http://localhost:3001/api/health
```

期望返回：

```json
{ "ok": true }
```

## 项目接口验证

最小接口链路：

1. `GET /api/projects?page=1&pageSize=10`
2. `POST /api/projects`
3. `GET /api/projects/:projectId`
4. `PATCH /api/projects/:projectId`
5. `DELETE /api/projects/:projectId`

需要确认：

- 项目列表返回分页元数据：`page`、`pageSize`、`total`、`totalPages`。
- 项目摘要包含：`id`、`name`、`thumbnailUrl`、`thumbnailKind`、`assetCount`、`generationCount`、`createdAt`、`updatedAt`。
- 新建项目后可以读取项目详情。
- 保存画布返回 `{ "ok": true }`。
- 删除临时项目返回 `{ "ok": true }`。

## 浏览器验证

打开：

```text
http://localhost:3001
```

确认：

- 默认显示“项目中心”主界面。
- 首页显示最近项目卡片。
- 项目卡片显示名称、缩略图区域、创建/更新时间、素材数量、生成数量。
- “更多项目”可进入分页项目列表。
- 点击项目卡片可进入节点画布。

## 本次结果

2026-05-22 已执行：

- `npm run test`：通过，6 个测试文件，15 个测试。
- `npm run build`：通过，无构建警告。
- `docker compose up -d --build`：通过。
- `GET /api/health`：通过。
- 项目列表、创建、详情、保存、删除接口链路：通过。
- 浏览器首页项目中心可见：通过。
