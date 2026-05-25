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
- `storageKey`：本地素材 Key，通常为 `local-asset:...`。
- `publicUrl`：本地预览地址，通常为 `/api/local-files/assets/...`。上游模型调用所需的对象存储 URL 会在运行时临时生成，不作为长期素材地址保存。

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
