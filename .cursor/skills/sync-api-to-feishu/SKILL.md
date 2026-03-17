---
name: sync-api-to-feishu
description: >-
  Sync server-side API endpoint documentation to Feishu documents via MCP.
  Use when the user finishes implementing an API endpoint and asks to sync docs,
  or during AGENTS.md Step 7 (sync technical specs), or when the user mentions
  "sync API to Feishu", "update Feishu API doc", or "同步接口文档到飞书".
---

# Sync API Docs to Feishu

将服务端 API 接口信息自动同步到飞书文档，格式为标准接口文档模板（接口地址 / 请求参数 / 响应结果表格）。

## Prerequisites

1. 项目已配置飞书 MCP（`.cursor/mcp.json` 中有 `feishu` server）
2. `docs/feishu.md` 中 **API 接口规范** 状态为 `已配置`，且包含飞书文档链接
3. 飞书文档链接为 wiki 类型（`/wiki/xxx`）

## Workflow

### Step 1: Resolve Target Document

1. Read `docs/feishu.md`, find "API 接口规范" row
2. Extract wiki token from the URL (last path segment)
3. Call `wiki_v2_space_getNode` with the token to get `obj_token` (the actual `document_id`)
4. Call `docx_v1_documentBlock_list` to get the current document block tree

### Step 2: Extract API Info from Source Code

Scan the codebase for API route definitions. Adapt detection to the framework:

| Framework | Detection Pattern |
|-----------|------------------|
| Express/Koa | `router.get/post/put/delete(...)` or `app.get/post(...)` |
| FastAPI | `@app.get/post(...)` or `@router.get/post(...)` |
| Gin (Go) | `r.GET/POST(...)` or `group.GET/POST(...)` |
| Spring Boot | `@GetMapping`, `@PostMapping`, `@RequestMapping` |
| NestJS | `@Get()`, `@Post()` with `@Controller()` |

For each endpoint, extract:
- **Route path** (e.g. `/api/v1/user/login`)
- **HTTP method** (GET / POST / PUT / DELETE)
- **Request parameters**: field name, type, required flag, description
- **Response fields**: field name, description

Source of truth priority:
1. TypeScript types / interfaces / Zod schemas / Pydantic models
2. JSDoc / docstring annotations
3. Inline code inference (as fallback)

### Step 3: Diff Against Existing Document

1. Read `docx_v1_document_rawContent` to get current plain text
2. Parse existing API entries (by heading + table pattern)
3. Classify each extracted endpoint as:
   - **New**: Not in document → append
   - **Changed**: In document but fields differ → update
   - **Unchanged**: Skip

### Step 4: Write to Feishu

For each **new** API entry, create blocks as children of the document root block:

```
Heading2 (block_type 4):  "N. 模块名称"
Heading3 (block_type 5):  "N.M 接口名称"
Text     (block_type 2):  "1）接口地址："
Table    (block_type 31): 2 rows × 2 cols → 请求地址 / 请求方法
Text     (block_type 2):  "2）请求参数："
Table    (block_type 31): (1+params) rows × 4 cols → 字段/类型/是否必填/说明
Text     (block_type 2):  "3）响应结果："
Table    (block_type 31): (1+fields) rows × 2 cols → 字段/说明
```

#### Block Creation Reference

**Create structure blocks** (heading + text + tables):

```json
{
  "path": { "document_id": "<doc_id>", "block_id": "<doc_id>" },
  "data": {
    "children": [
      { "block_type": 4, "heading2": { "elements": [{"text_run": {"content": "Section Title"}}], "style": {} } },
      { "block_type": 31, "table": { "property": { "row_size": 3, "column_size": 4 } } }
    ],
    "index": -1
  },
  "useUAT": true
}
```

**Fill table cells** — after creating a table, the response returns auto-generated cell IDs in `table.cells[]` (row-major order). For each cell, create a text child:

```json
{
  "path": { "document_id": "<doc_id>", "block_id": "<cell_id>" },
  "data": {
    "children": [
      { "block_type": 2, "text": { "elements": [{"text_run": {"content": "Cell Content"}}], "style": {} } }
    ]
  },
  "useUAT": true
}
```

### Step 5: Report

Output a summary table:

| Endpoint | Method | Action |
|----------|--------|--------|
| /api/v1/login | POST | 新增 |
| /api/v1/user | GET | 已跳过（无变化） |

Include the Feishu document link for the user to verify.

## Important Notes

- Always use `useUAT: true` for all Feishu MCP calls
- Table cells are returned in **row-major order**: for a 3×4 table, cells[0..3] = row 0, cells[4..7] = row 1, etc.
- Row 0 of parameter/response tables is always the **header row** (字段 / 类型 / 是否必填 / 说明)
- If `docs/feishu.md` has no API doc configured, stop and ask the user to configure it first
- Never fabricate API fields — only write what is found in the source code
