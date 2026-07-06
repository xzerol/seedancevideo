# HappyHorse I2V 模型升级

日期：2026-07-06

## 背景

阿里百炼已发布 HappyHorse 1.1 系列图生视频模型，官方推荐首帧图生视频使用 `happyhorse-1.1-i2v`。

## 代码改动

- 百炼 HappyHorse 首帧图生视频默认模型从 `happyhorse-1.0-i2v` 升级为 `happyhorse-1.1-i2v`。
- 保留 `HAPPYHORSE_I2V_MODEL` 环境变量覆盖能力。
- 首帧图生视频仍要求且只能输入 1 张 `first_frame` 图片。
- 补充 HappyHorse 1.1 I2V payload 单元测试。

## 官方能力结论

- `happyhorse-1.1-i2v` 是首帧图生视频模型。
- 输出支持 720P/1080P、3-15 秒、24 fps、MP4。
- 请求接口和媒体字段沿用百炼异步视频生成接口，`media` 中使用 `first_frame`。
