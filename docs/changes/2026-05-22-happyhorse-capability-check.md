# HappyHorse 视频能力核对

日期：2026-05-22

## 背景

需要确认百炼 HappyHorse 视频节点中，图生视频、首尾帧和参考视频模式是否与官方 API 能力一致。

## 官方能力结论

- HappyHorse `happyhorse-1.0-i2v` 是首帧图生视频。
  - `media` 中必须有且只能有 1 个 `first_frame`。
  - 不作为首尾帧接口使用。
- HappyHorse `happyhorse-1.0-r2v` 是参考图生视频。
  - 支持 1-9 张 `reference_image`。
  - prompt 中可用 `character1`、`character2` 等引用参考图顺序。
- HappyHorse `happyhorse-1.0-video-edit` 是视频编辑/参考视频生成。
  - 必须有 1 个 `video`。
  - 可选 0-5 张 `reference_image`。
- 首尾帧生成使用 Wan 首尾帧能力。
  - 当前默认模型为 `wan2.7-i2v`。
  - 需要且只能使用 2 张图片，分别作为首帧和尾帧。

## 代码改动

- HappyHorse I2V 模式校验改为严格 1 张首帧图。
- HappyHorse R2V 参考图上限从 5 张调整为 9 张。
- 首尾帧模式校验改为严格 2 张图片。
- UI 文案改为：
  - “首帧图生视频”
  - “参考图生视频”
  - “首尾帧（Wan）”
  - “参考视频编辑”
- 单元测试补充 I2V 单图约束和首尾帧双图约束。

## 官方参考

- HappyHorse image-to-video first frame API reference。
- HappyHorse reference-to-video API reference。
- HappyHorse video editing API reference。
- Wan first-and-last-frame image-to-video API reference。
