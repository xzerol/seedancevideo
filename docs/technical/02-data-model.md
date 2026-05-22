# 数据模型

## Project

保存项目名称和更新时间。

关联：

- `CanvasNode`
- `CanvasEdge`
- `ProjectAsset`
- `GenerationBatch`
- `GenerationJob`

## Asset

保存素材元数据。

关键字段：

- `name`
- `mimeType`
- `kind`
- `libraryType`
- `source`
- `storageKey`
- `publicUrl`

## CanvasNode

保存画布节点。

关键字段：

- `projectId`
- `nodeId`
- `type`
- `positionX`
- `positionY`
- `dataJson`

## CanvasEdge

保存画布连线。

关键字段：

- `sourceNodeId`
- `targetNodeId`
- `sourceHandle`
- `targetHandle`

## GenerationJob

统一记录图片/视频生成任务。

关键字段：

- `type`
- `prompt`
- `status`
- `providerTaskId`
- `resultUrl`
- `errorMessage`

## GenerationBatch / GenerationTask

保留 Seedance 视频异步任务的批次和单任务结构。
