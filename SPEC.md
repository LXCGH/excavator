# SPEC

> 项目级基础规范。详细 API 文档、设计文档和实现细节维护在 `docs/` 目录。

## 1. 项目定位与背景

- **项目名称**：挖掘机大作战 3D（Excavator）
- **目标**：基于浏览器的 3D 挖掘机模拟闯关游戏，支持登录、关卡、挖土、铺路等玩法。
- **使用场景**：休闲游戏、操作练习、关卡挑战。
- **当前边界**：前端 3D 游戏 + 后端登录鉴权；关卡设计、暂停、暖色背景等核心功能已实现。

## 2. 技术栈与运行环境

| 层级 | 技术 | 版本/说明 |
| :--- | :--- | :--- |
| 前端 | Vite | ^7.2.4 |
| 前端 | Three.js | ^0.181.2 |
| 前端 | Vanilla JavaScript (ESM) | - |
| 后端 | NestJS | ^11.0.0 |
| 后端 | TypeScript | ^5.7.3 |
| 后端 | Node.js | v14+ |

**启动方式**：

- 前端：`cd web && npm run dev`（默认 `http://localhost:5173`）
- 后端：`cd backend && npm run start:dev`（默认 `http://127.0.0.1:3000`）
- 环境变量：参考 `backend/.env.example`

## 3. 项目结构与模块边界

```
excavator/
├── web/                    # 前端 3D 游戏
│   ├── src/
│   │   ├── main.js         # 入口：登录 + Game 初始化
│   │   ├── Game.js         # 游戏主控、场景、暂停、循环
│   │   ├── Excavator.js    # 挖掘机模型与操控
│   │   ├── SoilSystem.js   # 土壤粒子系统
│   │   ├── RoadSystem.js   # 道路与违规检测
│   │   ├── LevelManager.js # 关卡逻辑与 UI
│   │   └── SoundManager.js # 音效
│   ├── index.html
│   └── package.json
├── backend/                 # 后端 API
│   ├── src/
│   │   ├── main.ts         # 入口，全局前缀 /api/v1
│   │   ├── app.module.ts
│   │   └── auth/           # 登录模块
│   │       ├── auth.controller.ts
│   │       ├── auth.service.ts
│   │       └── login.dto.ts
│   └── package.json
├── docs/                    # 文档（API、设计、飞书配置）
│   └── feishu.md           # 飞书资源链接
├── devlogs/                 # 开发日志
├── SPEC.md
└── AGENTS.md
```

**模块职责**：

- **web**：3D 渲染、游戏逻辑、登录 UI、关卡、暂停、音效。
- **backend**：认证接口，当前为演示账号登录（`player` / `excavator123`）。

## 4. 全局约束与编码约定

- 后端 API 统一前缀：`/api/v1`
- 前端调用后端：`VITE_API_BASE_URL` 或默认 `http://localhost:3000`
- 会话存储：`localStorage` 键 `excavator.auth`
- 遵循 `AGENTS.md` 开发工作流，禁止臆造飞书文档、接口或测试口径

## 5. 集成与依赖概览

- **飞书**：项目文档、API 规范、测试用例库（见 `docs/feishu.md`）
- **外部依赖**：无数据库、无消息队列；当前为内存/演示模式

## 6. 非功能性需求

- **性能**：60fps 目标，Three.js 渲染 + 粒子系统需控制复杂度
- **安全**：演示账号仅用于开发；生产需接入真实鉴权
- **兼容**：现代浏览器（支持 WebGL、ESM）

## 7. 变更记录

| 日期 | 版本 | 变更说明 | 关联日志 |
| :--- | :--- | :--- | :--- |
| 2026-03-16 | v0.1.0 | 初始化 SPEC，基于飞书文档与源码扫描 | 2026-03-16-dev-SPEC初始化与项目分析 |
