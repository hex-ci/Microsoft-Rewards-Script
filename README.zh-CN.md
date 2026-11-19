# Microsoft Rewards Script

[![Validate](https://github.com/hex-ci/Microsoft-Rewards-Script/actions/workflows/validate.yml/badge.svg?branch=v5)](https://github.com/hex-ci/Microsoft-Rewards-Script/actions/workflows/validate.yml)
![Version](https://img.shields.io/github/package-json/v/hex-ci/Microsoft-Rewards-Script/v5)
[![Docker image (GHCR)](https://img.shields.io/badge/Docker-GHCR%20v5-2496ED?logo=docker&logoColor=white)](https://github.com/hex-ci/Microsoft-Rewards-Script/pkgs/container/microsoft-rewards-script)
![Node.js](https://img.shields.io/badge/node-%3E%3D24-green)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE)

> [!NOTE]
> **语言 / Language:** [English](README.md) | 简体中文（当前）

Microsoft Rewards 自动化脚本，提供 API 与浏览器两种模式，支持会话持久化、多账号、本地化搜索词和可选的 Control API。

## 功能

- 每日任务（Daily Set）、促销、打卡卡片和奖励积分领取。
- 桌面/移动搜索、Explore on Bing、每日签到（Daily Check-In）和 Read to Earn。
- 可选的 Visual Search 与后台 Edge 浏览。
- 连续天数进度、基于 API 的 streak protection、带校验的积分上报。
- 定时运行、账号选择、会话复用，以及 Discord/Telegram/ntfy 通知。
- Control API：实时事件、持久化历史、打卡进度和活动余额观测。

> [!TIP]
> 此分支为 v5，是对 v4 的完整重写：模块分层、配置结构、会话存储都已变化，**与 v3/v4 的配置和 `accounts.json` 不兼容**。
> 旧版本仍在 [v3](https://github.com/hex-ci/Microsoft-Rewards-Script/tree/v3) 和 [v4](https://github.com/hex-ci/Microsoft-Rewards-Script/tree/v4) 分支。
>
> 使用风险自负 —— 部分功能可能无法按预期工作。

## 文档

- [安装与使用](docs/usage.zh-CN.md) —— 本地/Nix/Docker 安装、账号配置、设置项、命令与排错。
- [Control API](docs/control-api.md) —— 鉴权、接口、运行控制、定时任务与仪表板数据（英文）。

## 快速上手

需要 Node.js 24 或更高版本。

```bash
npm ci
npm run install:browser
npm run build
cp env.example .env
cp config.example.json config.json
```

Linux 下安装 Chromium 系统依赖：

```bash
npx patchright install --with-deps chromium
```

在 `.env` 里填入 `ACCOUNT_1_EMAIL` 及相关的登录信息，然后运行：

```bash
npm start
```

每个账号追加一组编号配置块。无密码/仅验证器的账号可以不填密码。账号字段见 [env.example](env.example)，登录方式见[安装与使用](docs/usage.zh-CN.md#账号与会话)。

## 模式与设置

启动前编辑 [config.json](config.example.json)。

| 设置                               | 作用                                                 |
| ---------------------------------- | ---------------------------------------------------- |
| `rewardsMode: "browser"`           | 通过渲染后的卡片和 GhostCursor 完成网页活动。        |
| `rewardsMode: "api"`               | 保存登录会话、关闭浏览器，改用 HTTP 调用。           |
| `searchSettings.parallelSearching` | 开启时并行处理桌面与移动端。                         |
| `workers`                          | 按任务单独开关。                                     |
| `taskDelay`                        | 任务之间的间隔。                                     |
| `searchSettings.searchDelay`       | 搜索之间的间隔。                                     |
| `searchSettings.useAccountLocale`  | 按账号所在国家选择搜索词。                           |
| `ensureStreakProtection`           | 两种模式下都通过 HTTP 开启并校验 streak protection。 |
| `experimental`                     | 可选实验特性，默认关闭。                             |

完整设置见[设置参考](docs/usage.zh-CN.md#设置参考)。

### 本分支新增的设置

| 设置                        | 默认 | 作用                                                                |
| --------------------------- | ---- | ------------------------------------------------------------------- |
| `workers.doOtherPromotions` | true | 完成 SAIOS 通道里 App 面板未列出的 `urlreward` 促销（本分支新增）。 |

## 会话

在带图形界面的桌面环境手动登录：

```bash
npm run manual-login -- user@example.com --platform both
npm run open-session -- --help
```

会话保存在 `sessionPath` 指定的目录（SQLite）。请勿公开 `.env`、本地配置、会话数据库和诊断文件。

## Docker

基于 `env.example` 创建 `.env`，然后按需调整 [compose.yaml](compose.yaml) 里的时区和定时。

```bash
docker compose up -d --build
docker compose logs -f
```

本分支的镜像为 `ghcr.io/hex-ci/microsoft-rewards-script:5`，`compose.override.yaml` 已指向它。

Docker 把配置持久化在 `./config`、会话在 `./sessions`、可选的错误快照在 `./diagnostics`。缺少时容器会用内置默认值生成 `config/config.json`。`RUN_ON_START` 控制首次启动是否立即运行，`CRON_SCHEDULE` 设定初始定时；Control API 的定时改动保存在 `config/schedule.json`。

启用 Control API 见 [Control API 的 Docker 配置](docs/control-api.md#docker)。

## 本分支自上游 v5 起的改动

- `src/rewards/shared/data/RewardsSessionTicket.ts`：为 `rewards.bing.com/api/getuserinfo` 预置 `tifacfaatcs` 票据，避免首选端点退化成 Bing flyout。
- `src/rewards/app/actions/OtherPromotions.ts`：补上 App 面板未列出的 SAIOS `urlreward` 促销。
- `ServerActions.bootstrap()` 在缺少 `section#dailyset` 时只告警不中断：浏览器模式从 flyout 读任务，并不依赖该节点。
- `BING` 指向 `cn.bing.com`，并在各处 Bing 域名匹配中放行该域名。

## 许可

[GPL-3.0-or-later](LICENSE)。
