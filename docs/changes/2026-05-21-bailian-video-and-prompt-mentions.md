# 百炼视频、@ 引用与对话保存

## 修改内容

- 放大画布连线点和点击热区。
- 生成节点对话框变大，支持输入 `@` 选择素材并插入引用。
- 每个生成节点支持保存当前对话和恢复历史版本。
- Seedance 视频节点增加“参考视频”模式。
- 新增“百炼视频”节点，支持文生、图生、参考图、首尾帧和参考视频模式。
- 新增节点默认出现在选中节点右侧或当前视野中心，避免离当前工作区太远。

## 接口与配置

- 新增 `/api/bailian-video-generations` 和 `/api/bailian-video-generations/:batchId`。
- 新增 `/api/conversation-snapshots`。
- `.env` 新增 `DASHSCOPE_API_KEY` 和百炼模型配置。
- 百炼生成完成后会把临时视频 URL 转存到 TOS，再保存到本地数据库。
