# Claude Code 项目级指令

请阅读并严格遵循项目根目录的 `AGENTS.md` 中的所有指令。

## 关键约束
- `SPEC.md` 是项目唯一技术规范来源。若不存在或为空模板，必须先执行 `agents/dev.md` 中的 SPEC 自动初始化流程。
- `docs/feishu.md` 是外部数据源配置，仅在链接状态为 `已配置` 时读取。
- 代码风格必须遵循 `AGENTS.md` 第 2 节的编码约定。
- 所有开发/测试活动必须在 `devlogs/` 记录日志（格式见 `AGENTS.md` 第 4 节）。

## 角色系统
用户通过 `/role [pm|dev|qa]` 切换角色，各角色提示词在 `agents/` 目录下。默认以 Dev Agent 身份运行。
