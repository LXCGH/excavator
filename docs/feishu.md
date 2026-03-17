# 🔗 飞书项目资源配置

本文件用于记录项目接入飞书 MCP 所需的文档链接与配置状态，供 AI 在开发前读取。

## 1. 飞书资源清单

| 资源 | 链接 | 状态 |
| :--- | :--- | :---: |
| 项目文档 | https://xa0r7pu9bau.feishu.cn/wiki/WyzHwHCGSir9yfkIeAIc4PMwnPb | `已配置` |
| API 接口规范 | https://xa0r7pu9bau.feishu.cn/wiki/BECuwTKmzirwoYkvDEGcr75WngA | `已配置` |
| 测试用例库 | https://xa0r7pu9bau.feishu.cn/wiki/EHFUwM8sai8oVOk84x2cvQLhn2c?table=tblEuI5AelkegD58&view=vewuDBLjcE | `已配置` |

## 2. 使用规则

1. AI 执行任务前必须先读取本文件。
2. 仅当资源状态为 `已配置` 时，AI 才能通过飞书 MCP 读取对应内容。
3. 若状态为 `未配置`，应先补充链接和状态，再执行依赖该资源的开发任务。
4. 若状态为 `已配置` 但飞书 MCP 读取失败，AI 必须明确说明失败原因。

## 3. 配置示例

```markdown
| 项目文档 | https://xxx.feishu.cn/wiki/xxx | `已配置` |
| API 接口规范 | https://xxx.feishu.cn/docx/xxx | `已配置` |
| 测试用例库 | https://xxx.feishu.cn/base/xxx | `已配置` |
```
