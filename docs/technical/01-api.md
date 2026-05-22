# API 文档

## 健康检查

`GET /api/health`

返回：

```json
{ "ok": true }
```

## 素材

`GET /api/assets`

返回全局素材库。

`POST /api/assets`

表单字段：

- `file`：图片、视频或音频文件。
- `libraryType`：`asset` 或 `person`。

`PATCH /api/assets/:assetId`

修改素材名称或资源类型。

`DELETE /api/assets/:assetId`

删除本地素材记录。不会删除 TOS 远程对象。

`POST /api/assets/from-url`

把生成结果 URL 收藏为全局素材。

## 对象存储配置

上传素材依赖 S3/TOS 兼容对象存储。

必填：

- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`

常用：

- `S3_REGION`，默认 `cn-beijing`。
- `S3_ENDPOINT` 可选；为空时会按 `https://tos-s3-${S3_REGION}.volces.com` 自动推导。

别名：

- `TOS_BUCKET`
- `TOS_ACCESS_KEY_ID`
- `TOS_SECRET_ACCESS_KEY`
- `TOS_REGION`
- `TOS_ENDPOINT`

## 项目

`GET /api/projects?page=&pageSize=`

获取分页项目列表；如果没有项目，会自动创建默认项目。

项目摘要字段：

- `id`
- `name`
- `thumbnailUrl`
- `thumbnailKind`
- `assetCount`
- `generationCount`
- `createdAt`
- `updatedAt`

`POST /api/projects`

创建项目。

`GET /api/projects/:projectId`

读取项目详情、画布节点、连线、素材引用和生成任务。

`PATCH /api/projects/:projectId`

保存画布状态。

`DELETE /api/projects/:projectId`

删除项目，同时清理该项目的画布、连线、生成批次和生成记录。

## 图片生成

`POST /api/image-generations`

调用 Seedream 5.0。

主要字段：

- `projectId`
- `nodeId`
- `prompt`
- `assetIds`
- `ratio`
- `size`
- `count`
- `optimizePrompt`
- `watermark`

## 视频生成

`POST /api/generations`

调用 Seedance 2.0。

主要字段：

- `projectId`
- `nodeId`
- `prompt`
- `assetIds`
- `mode`
- `ratio`
- `resolution`
- `duration`
- `count`
- `generateAudio`

`GET /api/generations/:batchId`

轮询视频生成任务状态。

## 本地视频文件

`GET /api/local-files/videos/:filePath`

播放已保存到本地 `generated-videos/` 目录的生成视频，支持浏览器 range 请求。
