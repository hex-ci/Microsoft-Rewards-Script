---
name: verify
description: 改动代码后用 build、control-api 检查、format、lint 验证（仓库没有测试运行器）。
version: 1.0.0
---

# 验证改动

本仓库**没有测试运行器**，验证手段只有构建 + 类型检查 + 格式 + lint。

## 步骤

1. `npm run build` — 编译 TypeScript（类型错误即失败），并把 `src/data`、`src/control-api` 拷进 `dist/`。
2. `npm run check:api` — 用 `tsconfig.control-api.json` 对纯 JS 的 control API 做类型检查。
3. `npm run lint` — 全仓库 ESLint。
4. `npm run format:check` — Prettier 检查（4 空格、无分号、无尾逗号、单引号、宽度 120、`arrowParens: avoid`）。

四项全过才算完成。`npm run check` 会按顺序跑完这一组。

## 注意

- `npm run lint:fix` 和 `npm run format` 能自动修掉大部分问题，修完要重跑检查确认。
- 构建会先清空 `dist/`，所以启动前务必先 build。
- 没有任何测试夹具，涉及行为的改动必须真实跑一次才能确认。
