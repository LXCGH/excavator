# Gemini 项目级系统指令

> 本文件由 Gemini CLI / Gemini Code Assist 自动加载，无需手动引用。

## 启动指令

**每次会话开始时，你必须：**
1. 读取项目根目录的 `AGENTS.md`（v3.0），理解完整的角色、工作流和协作规范。
2. 等待用户通过 `/role [pm|dev|qa]` 声明角色后，再加载对应的 `agents/[role].md` 提示词。
3. 若用户未声明角色，默认以 **Dev Agent** 身份运行，并提示用户可以用 `/role` 切换角色。
4. 若用户消息以 `!quick` 开头，进入快速模式：仅读取 `SPEC.md` 技术架构部分，跳过飞书和完整启动流程。

## 关键约束
- **SPEC.md** 是项目唯一技术规范。若不存在或为空模板，Dev Agent 必须先执行 `agents/dev.md` 中的自动初始化流程。
- **docs/feishu.md** 是外部数据源配置。仅当链接状态标记为 `已配置` 时通过 MCP 读取；`未配置` 时跳过。
- **docs/bugs.md** 是本地 Bug 镜像，QA Agent 必须双轨记录。
- 代码必须遵循 `AGENTS.md` 第 2 节的编码约定。
- 所有开发/测试活动必须在 `devlogs/` 记录日志（格式见 `AGENTS.md` 第 4 节）。
