[![Discord](https://img.shields.io/badge/Join%20Our%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/8BxYbV4pkj)
[![Latest Build](https://img.shields.io/github/actions/workflow/status/hex-ci/Microsoft-Rewards-Script/auto-release.yml?branch=v4&style=for-the-badge&label=Latest%20Build)](https://github.com/hex-ci/Microsoft-Rewards-Script/actions/workflows/auto-release.yml)
[![Docker](https://img.shields.io/badge/Docker-GHCR-blue?style=for-the-badge&logo=docker)](https://github.com/hex-ci/Microsoft-Rewards-Script/pkgs/container/microsoft-rewards-script)

> [!NOTE]
> **语言 / Language:** [English](README.md) | 简体中文（当前）

> [!TIP]
> 此版本**仅支持全新版 Bing Rewards 面板**，**不支持**旧版面板。
> 如果你的账号仍在使用旧版面板，请改用 [v3 分支](https://github.com/hex-ci/Microsoft-Rewards-Script/tree/v3) 及 v3.x 版本！
>
> 使用风险自负 —— 部分功能可能无法按预期工作。

---

## 目录

- [目录](#目录)
- [快速上手](#快速上手)
    - [本地安装](#本地安装)
        - [获取脚本](#获取脚本)
- [账号配置](#账号配置)
- [配置文件](#配置文件)
    - [构建并运行脚本（本地安装版本）](#构建并运行脚本本地安装版本)
- [Docker](#docker)
- [Control API 与仪表板](#control-api-与仪表板)
- [Nix 安装](#nix-安装)
- [配置项](#配置项)
    - [核心](#核心)
    - [Workers（任务）](#workers任务)
    - [Activities（活动）](#activities活动)
    - [搜索设置](#搜索设置)
        - [搜索词来源](#搜索词来源)
    - [实验性功能](#实验性功能)
    - [日志](#日志)
    - [代理](#代理)
    - [Webhook（推送通知）](#webhook推送通知)
- [常见问题](#常见问题)
    - [会话管理](#会话管理)
- [免责声明](#免责声明)

---

## 快速上手

### 本地安装

**运行环境要求：** Node.js >= 24 和 Git
支持 Windows、Linux、macOS 和 WSL。

#### 获取脚本

```bash
git clone https://github.com/hex-ci/Microsoft-Rewards-Script.git
cd Microsoft-Rewards-Script
```

也可以下载最新版的 ZIP 压缩包并解压。

## 账号配置

- 复制 [`env.example`](env.example) 并重命名为 `.env`，然后填入你的账号信息：

```env
ACCOUNT_1_EMAIL=email@example.com
ACCOUNT_1_PASSWORD=your_password
```

> [!NOTE]
> 每个账号添加一组 `ACCOUNT_N_*` 配置。账号槽位不必连续 —— 例如 `ACCOUNT_2` 或 `ACCOUNT_4` 可以在前面槽位缺失时配置。账号按槽位升序运行。每个账号还有一些可选字段，包括恢复邮箱、地区、语言、代理和指纹持久化等，完整列表见 [`env.example`](env.example)。

`ACCOUNT_N_LANG_CODE` 接受 BCP 47 语言标签，例如 `nl`、`it` 或 `pt-BR`。`ACCOUNT_N_GEO_LOCALE` 接受两位国家代码，或默认为 `auto`。所选语言和国家会一致地应用到浏览器指纹、`Accept-Language`、Microsoft Rewards 应用请求头以及市场相关请求。在 `auto` 模式下，首次成功请求仪表板后会缓存微软账号资料里报告的国家；更改任一地区设置会自动替换不兼容的已保存指纹。

> [!TIP]
> 对于启用了两步验证（2FA）的账号，设置 `ACCOUNT_N_TOTP_SECRET` 后，脚本会自动生成并填入 6 位验证码。获取该密钥的方法：打开微软安全设置中的“管理登录方式”，添加一个验证器应用，当出现二维码时选择“手动输入代码”，把那段代码填到 `.env` 里即可。

> [!WARNING]
> 修改 `.env` 后必须重新构建脚本才能生效。

## 配置文件

> [!WARNING]
> 如果你是本地安装运行脚本，这一步**不能**跳过。

- **本地安装：** 把 `config.example.json` 复制或重命名为 `config.json`（放在项目根目录），然后按需修改各项设置。
- **Docker：** 首次运行时会自动生成一个有效的 `config.json` 并保存到本地的 `./config/` 目录。你也可以手动创建 `config.json`（例如需要填写正则表达式时），用提供的 `config.example.json` 作为模板。

> [!CAUTION]
> 旧版的 `accounts.json` 和 `config.json` 与当前版本不兼容。

### 构建并运行脚本（本地安装版本）

```bash
npm run pre-build
npm run build
npm run start
```

## Docker

- 复制示例文件 [`compose.yaml`](compose.yaml)
- 复制 [`env.example`](env.example) 并重命名为 `.env`，填入你的账号信息：

```env
ACCOUNT_1_EMAIL=email@example.com
ACCOUNT_1_PASSWORD=your_password
```

- 检查 `compose.yaml`，按需调整定时任务、时区和配置项。

> [!NOTE]
> 首次运行时会自动用默认值生成一个有效的 `config.json`，并保存到本地的 `./config/`。
> 你也可以在 `compose.yaml` 的 `environment:` 区域用 `CONFIG_*` 变量来自定义选项（例如集群数、webhook 等）。
> 完整选项列表见[下方表格](#配置项)。
> `CONFIG_*` 变量在每次启动时都会应用，且始终优先于 `./config/config.json`。

> [!TIP]
> 如果新版镜像新增了你尚未配置的选项，容器日志里会出现提示。
> 更新方法：删除 `./config/config.json` 再重启 —— 脚本会基于最新模板重新生成一份，并重新应用你在 `compose.yaml` 里的覆盖设置。

- 启动容器：`docker compose up -d`

> [!TIP]
> 用 `docker logs microsoft-rewards-script` 查看日志，方便查看无密码登录的验证码或排查问题。
> 你也可以在 `compose.yaml` 中启用 webhook 来接收通知。

---

## Control API 与仪表板

可选的 Control API 让本地仪表板或其他受信任的工具通过 HTTP 监控和控制脚本。完整的 Control API 文档（含配置、鉴权、每个端点、请求字段、响应示例和安全指引）见 [scripts/api/README.md](scripts/api/README.md)。

常见用途包括：

- 用 `GET /health` 和 `GET /status` 检查 API 健康状态和当前运行状态；
- 读取实时积分、日志、错误、账号摘要、运行历史和错误诊断；
- 列出已存储会话的安全元数据，并删除某个账号的移动端/桌面端会话；
- 用 `POST /start` 和空 JSON 体启动所有账号；
- 用 `POST /start` 和 `{"accountIndex":2}` 只运行某一个账号；
- 用 `POST /start` 和 `{"excludedAccountIndexes":[2,4]}` 运行除指定槽位外的所有账号；
- 用 `POST /stop` 或 `POST /restart` 停止或重启一次运行；
- 用 `GET /events` 以 Server-Sent Events（SSE）流式获取实时日志和状态更新；
- 读取当前配置和定时计划，配置与计划的变更仅在其对应的 `API_ALLOW_*` 选项启用时可用。

例如，用 cURL 只启动 `ACCOUNT_2`：

```bash
curl --request POST \
  --url http://127.0.0.1:3010/start \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"accountIndex":2}'
```

如需现成的 Web 界面，可使用受支持并推荐的 [Rewards Dashboard](https://github.com/mgrimace/rewards-dashboard)。它连接此 Control API 来管理运行、账号、计划、日志、积分及相关脚本设置。

---

## Nix 安装

如果你使用 Nix：`bash scripts/nix/run.sh`

---

## 配置项

编辑 `config.json` 来调整行为，或者在 `compose.yaml`（Docker）中设置 `CONFIG_*` 环境变量。下面列出目前所有可用选项。

> [!WARNING]
> 每次修改配置后，本地安装需重新构建脚本，Docker 需重建容器才能生效。

### 核心

| 设置项                      | 类型    | 默认值       | 说明                                        | Docker 环境变量                       |
| --------------------------- | ------- | ------------ | ------------------------------------------- | ------------------------------------- |
| `sessionPath`               | string  | `"sessions"` | 存储浏览器会话的目录                        |                                       |
| `headless`                  | boolean | `false`      | 隐藏浏览器窗口运行                          | 在 Docker 中始终为 `true`             |
| `clusters`                  | number  | `1`          | 并发处理的账号集群数                        | `CONFIG_CLUSTERS`                     |
| `errorDiagnostics`          | boolean | `false`      | 将错误和未知登录页诊断保存到 `diagnostics/` | `CONFIG_ERROR_DIAGNOSTICS`            |
| `ensureStreakProtection`    | boolean | `true`       | 确保已启用连续打卡保护                      | `CONFIG_ENSURE_STREAK_PROTECTION`     |
| `autoClaimPunchcardRewards` | boolean | `false`      | 自动领取已完成的打卡奖励                    | `CONFIG_AUTO_CLAIM_PUNCHCARD_REWARDS` |
| `skipNonPointTasks`         | boolean | `true`       | 跳过不给积分的任务                          | `CONFIG_SKIP_NON_POINT_TASKS`         |
| `accountDelay.min`          | string  | `"1min"`     | 启动下一个配置账号前的最小延迟              | `CONFIG_ACCOUNT_DELAY_MIN`            |
| `accountDelay.max`          | string  | `"3min"`     | 启动下一个配置账号前的最大延迟              | `CONFIG_ACCOUNT_DELAY_MAX`            |
| `searchOnBingLocalQueries`  | boolean | `false`      | ExploreOnBing 使用本地搜索词列表            | `CONFIG_SEARCH_ON_BING_LOCAL`         |
| `globalTimeout`             | string  | `"30sec"`    | 所有操作的超时时间                          | `CONFIG_GLOBAL_TIMEOUT`               |

### Workers（任务）

| 设置项                         | 类型    | 默认值  | 说明                                                      | Docker 环境变量                      |
| ------------------------------ | ------- | ------- | --------------------------------------------------------- | ------------------------------------ |
| `workers.doDailySet`           | boolean | `true`  | 完成每日任务集                                            | `CONFIG_WORKER_DAILY_SET`            |
| `workers.doClaimBonusPoints`   | boolean | `true`  | 领取额外积分                                              | `CONFIG_WORKER_CLAIM_BONUS_POINTS`   |
| `workers.doMorePromotions`     | boolean | `true`  | 完成“更多活动”                                            | `CONFIG_WORKER_MORE_PROMOTIONS`      |
| `workers.doPunchCards`         | boolean | `true`  | 完成打卡任务                                              | `CONFIG_WORKER_PUNCH_CARDS`          |
| `workers.doAppPromotions`      | boolean | `true`  | 完成应用推广活动                                          | `CONFIG_WORKER_APP_PROMOTIONS`       |
| `workers.doDesktopSearch`      | boolean | `true`  | 执行桌面端搜索                                            | `CONFIG_WORKER_DESKTOP_SEARCH`       |
| `workers.doMobileSearch`       | boolean | `true`  | 执行移动端搜索                                            | `CONFIG_WORKER_MOBILE_SEARCH`        |
| `workers.doBonusSearches`      | boolean | `false` | 超出上限后继续刷额外搜索                                  | `CONFIG_WORKER_BONUS_SEARCHES`       |
| `workers.doDailyCheckIn`       | boolean | `true`  | 完成每日签到                                              | `CONFIG_WORKER_DAILY_CHECKIN`        |
| `workers.doReadToEarn`         | boolean | `true`  | 完成“阅读赚积分”                                          | `CONFIG_WORKER_READ_TO_EARN`         |
| `workers.doActivateSearchPerk` | boolean | `true`  | 出现时激活“再搜索 N 次得积分”特权（在每日任务集之后执行） | `CONFIG_WORKER_ACTIVATE_SEARCH_PERK` |
| `workers.doVisualSearch`       | boolean | `false` | 激活视觉搜索的连续打卡并执行视觉搜索                      | `CONFIG_WORKER_VISUAL_SEARCH`        |

### Activities（活动）

| 设置项                    | 类型    | 默认值 | 说明                    | Docker 环境变量                  |
| ------------------------- | ------- | ------ | ----------------------- | -------------------------------- |
| `activities.urlReward`    | boolean | `true` | 完成 URL 奖励活动       | `CONFIG_ACTIVITY_URL_REWARD`     |
| `activities.searchOnBing` | boolean | `true` | 完成 ExploreOnBing 活动 | `CONFIG_ACTIVITY_SEARCH_ON_BING` |

### 搜索设置

| 设置项                                 | 类型     | 默认值                      | 说明                                                        | Docker 环境变量                    |
| -------------------------------------- | -------- | --------------------------- | ----------------------------------------------------------- | ---------------------------------- |
| `searchSettings.scrollRandomResults`   | boolean  | `false`                     | 在搜索结果页随机滚动                                        | `CONFIG_SEARCH_SCROLL_RANDOM`      |
| `searchSettings.clickRandomResults`    | boolean  | `false`                     | 随机点击搜索结果中的链接                                    | `CONFIG_SEARCH_CLICK_RANDOM`       |
| `searchSettings.runOnZeroPoints`       | boolean  | `false`                     | 即使没有搜索积分剩余也继续搜索                              | `CONFIG_SEARCH_RUN_ON_ZERO_POINTS` |
| `searchSettings.maxBonusSearches`      | number   | `110`                       | 每次运行的最大额外搜索次数（开启 `doBonusSearches` 时生效） | `CONFIG_SEARCH_MAX_BONUS_SEARCHES` |
| `searchSettings.parallelSearching`     | boolean  | `true`                      | 并行执行搜索                                                | `CONFIG_SEARCH_PARALLEL`           |
| `searchSettings.clusterSearch`         | boolean  | `true`                      | 用必应建议把每个主话题聚合成簇                              | `CONFIG_SEARCH_CLUSTER`            |
| `searchSettings.queryEngines`          | string[] | 见[搜索词来源](#搜索词来源) | 用于构建搜索词库的来源                                      | `CONFIG_SEARCH_QUERY_ENGINES` \*   |
| `searchSettings.searchResultVisitTime` | string   | `"10sec"`                   | 每个搜索结果的停留时间                                      | `CONFIG_SEARCH_VISIT_TIME`         |
| `searchSettings.searchDelay.min`       | string   | `"30sec"`                   | 搜索之间的最小间隔                                          | `CONFIG_SEARCH_DELAY_MIN`          |
| `searchSettings.searchDelay.max`       | string   | `"1min"`                    | 搜索之间的最大间隔                                          | `CONFIG_SEARCH_DELAY_MAX`          |
| `searchSettings.readDelay.min`         | string   | `"30sec"`                   | 阅读活动的最小时长                                          | `CONFIG_SEARCH_READ_DELAY_MIN`     |
| `searchSettings.readDelay.max`         | string   | `"1min"`                    | 阅读活动的最大时长                                          | `CONFIG_SEARCH_READ_DELAY_MAX`     |

> [!NOTE]
> \* Docker 中 `CONFIG_*` 的数组值用逗号分隔，例如 `"error,warn"`。正则表达式必须在 `config.json` 中直接设置。

#### 搜索词来源

`searchSettings.queryEngines` 决定主搜索话题从哪里来。可以任意组合，所有选中来源的话题会被合并、去重。当启用 `searchSettings.clusterSearch` 时，每个主话题会按需用必应建议扩展成簇，该簇被打乱并完成后，再进入下一个主话题的搜索。

核心来源：

| 选项         | 来源                                            |
| ------------ | ----------------------------------------------- |
| `google`     | Google 趋势（热门搜索）                         |
| `wikipedia`  | 维基百科前一日的热门条目                        |
| `wikirandom` | 随机维基百科条目                                |
| `hackernews` | Hacker News 首页文章                            |
| `reddit`     | Reddit r/popular 帖子标题                       |
| `local`      | 内置的 `src/functions/search-queries.json` 词表 |

RSS 订阅源使用点分路径 —— `rss` 表示全部订阅源，`rss.<站点>` 表示某站点的全部订阅源，`rss.<站点>.<端点>` 表示单个订阅源：

| 选项               | 订阅源                                                          |
| ------------------ | --------------------------------------------------------------- |
| `rss.googleTrends` | Google 趋势（`gb`、`us`）                                       |
| `rss.googleNews`   | Google 新闻（`gb`、`us`、`world`、`technology`、`business`）    |
| `rss.bbc`          | BBC 新闻（`top`、`world`、`technology`、`business`、`science`） |
| `rss.guardian`     | 卫报（`international`、`world`、`technology`）                  |
| `rss.theVerge`     | The Verge（`all`）                                              |
| `rss.arsTechnica`  | Ars Technica（`all`）                                           |
| `rss.reddit`       | Reddit 订阅源（`popular`、`worldnews`、`technology`）           |

你可以在 `src/constants/rssFeeds.ts` 中添加自己的订阅源。

默认值：

```json
[
    "google",
    "wikipedia",
    "wikirandom",
    "hackernews",
    "reddit",
    "local",
    "rss.googleTrends",
    "rss.googleNews",
    "rss.bbc",
    "rss.guardian.world",
    "rss.theVerge.all"
]
```

### 实验性功能

可选功能，可能会变动，默认关闭。

| 设置项                         | 类型    | 默认值  | 说明                                                | Docker 环境变量                          |
| ------------------------------ | ------- | ------- | --------------------------------------------------- | ---------------------------------------- |
| `experimental.apiSearch`       | boolean | `false` | 通过 HTTP 接口执行必应搜索，而非驱动浏览器页面      | `CONFIG_EXPERIMENTAL_API_SEARCH`         |
| `experimental.apiSearchOnBing` | boolean | `false` | 通过 HTTP 接口完成 ExploreOnBing 活动，而非用浏览器 | `CONFIG_EXPERIMENTAL_API_SEARCH_ON_BING` |

> [!NOTE]
> API 方式速度更快，但依赖新版面板的接口。如果某个 ExploreOnBing 活动未能到账，请关闭 `apiSearchOnBing` 回退到浏览器方式。

无论实验性搜索设置如何，常规 Rewards 操作都会使用引导阶段捕获的 cookie 和操作数据，而不刷新可见页面。浏览器在浏览器搜索开始前保持空闲。失败或未被确认的 URL 奖励请求会触发一次上下文刷新和一次重试；成功请求则使用服务器操作返回的余额。

### 日志

| 设置项                           | 类型     | 默认值                 | 说明                      | Docker 环境变量                 |
| -------------------------------- | -------- | ---------------------- | ------------------------- | ------------------------------- |
| `debugLogs`                      | boolean  | `false`                | 启用调试日志              | `CONFIG_DEBUG_LOGS`             |
| `consoleLogFilter.enabled`       | boolean  | `false`                | 启用控制台日志过滤        | `CONFIG_LOG_FILTER_ENABLED`     |
| `consoleLogFilter.mode`          | string   | `"whitelist"`          | 过滤模式（白名单/黑名单） | `CONFIG_LOG_FILTER_MODE`        |
| `consoleLogFilter.levels`        | string[] | `["error", "warn"]`    | 要过滤的日志级别          | `CONFIG_LOG_FILTER_LEVELS` \*   |
| `consoleLogFilter.keywords`      | string[] | `["starting account"]` | 要过滤的关键词            | `CONFIG_LOG_FILTER_KEYWORDS` \* |
| `consoleLogFilter.regexPatterns` | string[] | `[]`                   | 用于过滤的正则表达式      |                                 |

> [!NOTE]
> \* Docker 中 `CONFIG_*` 的数组值用逗号分隔，例如 `"error,warn"`。正则表达式必须在 `config.json` 中直接设置。

### 代理

| 设置项              | 类型    | 默认值 | 说明                 | Docker 环境变量             |
| ------------------- | ------- | ------ | -------------------- | --------------------------- |
| `proxy.queryEngine` | boolean | `true` | 搜索词引擎请求走代理 | `CONFIG_PROXY_QUERY_ENGINE` |

### Webhook（推送通知）

| 设置项                                   | 类型     | 默认值                                               | 说明                      | Docker 环境变量                         |
| ---------------------------------------- | -------- | ---------------------------------------------------- | ------------------------- | --------------------------------------- |
| `webhook.discord.enabled`                | boolean  | `false`                                              | 启用 Discord webhook      | `CONFIG_DISCORD_ENABLED`                |
| `webhook.discord.url`                    | string   | `""`                                                 | Discord webhook 地址      | `CONFIG_DISCORD_URL`                    |
| `webhook.telegram.enabled`               | boolean  | `false`                                              | 启用 Telegram webhook     | `CONFIG_TELEGRAM_ENABLED`               |
| `webhook.telegram.botToken`              | string   | `""`                                                 | Telegram 机器人令牌       | `CONFIG_TELEGRAM_BOTTOKEN`              |
| `webhook.telegram.chatId`                | string   | `""`                                                 | Telegram 聊天 ID          | `CONFIG_TELEGRAM_CHATID`                |
| `webhook.ntfy.enabled`                   | boolean  | `false`                                              | 启用 ntfy 通知            | `CONFIG_NTFY_ENABLED`                   |
| `webhook.ntfy.url`                       | string   | `""`                                                 | ntfy 服务器地址           | `CONFIG_NTFY_URL`                       |
| `webhook.ntfy.topic`                     | string   | `""`                                                 | ntfy 主题                 | `CONFIG_NTFY_TOPIC`                     |
| `webhook.ntfy.token`                     | string   | `""`                                                 | ntfy 认证令牌             | `CONFIG_NTFY_TOKEN`                     |
| `webhook.ntfy.title`                     | string   | `"Microsoft-Rewards-Script"`                         | 通知标题                  | `CONFIG_NTFY_TITLE`                     |
| `webhook.ntfy.tags`                      | string[] | `["bot", "notify"]`                                  | 通知标签                  | `CONFIG_NTFY_TAGS` \*                   |
| `webhook.ntfy.priority`                  | number   | `3`                                                  | 通知优先级（1-5）         | `CONFIG_NTFY_PRIORITY`                  |
| `webhook.webhookLogFilter.enabled`       | boolean  | `false`                                              | 启用 webhook 日志过滤     | `CONFIG_WEBHOOK_LOG_FILTER_ENABLED`     |
| `webhook.webhookLogFilter.mode`          | string   | `"whitelist"`                                        | 过滤模式（白名单/黑名单） | `CONFIG_WEBHOOK_LOG_FILTER_MODE`        |
| `webhook.webhookLogFilter.levels`        | string[] | `["error"]`                                          | 要发送的日志级别          | `CONFIG_WEBHOOK_LOG_FILTER_LEVELS` \*   |
| `webhook.webhookLogFilter.keywords`      | string[] | `["starting account", "select number", "collected"]` | 要过滤的关键词            | `CONFIG_WEBHOOK_LOG_FILTER_KEYWORDS` \* |
| `webhook.webhookLogFilter.regexPatterns` | string[] | `[]`                                                 | 用于过滤的正则表达式      |                                         |

> [!NOTE]
> \* Docker 中 `CONFIG_*` 的数组值用逗号分隔，例如 `"error,warn"`。正则表达式必须在 `config.json` 中直接设置。

> [!WARNING]
> 使用 **NTFY** 的用户请把 `webhookLogFilter` 设为 `enabled`，否则你会收到_所有_日志的推送通知。
> 启用后，只有账号开始、2FA 验证码和账号完成摘要会作为推送通知发送。
> 可以用 `keywords` 选项自定义接收哪些通知。

---

## 常见问题

> [!TIP]
> 大多数登录问题都可以通过删除 `/sessions` 文件夹并重新部署脚本来解决。

### 会话管理

会话工具需要显式命令，不带参数运行时只显示帮助，不会删除任何内容。

```bash
# 列出已存储的移动端和桌面端会话
npm run clear-sessions -- list

# 删除某个账号的会话
npm run clear-sessions -- email user@example.com

# 删除所有已存储会话
npm run clear-sessions -- all
```

```bash
# 列出安全的会话元数据
curl --request GET \
  --url http://127.0.0.1:3010/sessions \
  --header 'Authorization: Bearer YOUR_API_TOKEN'

# 仅删除 user@example.com 的移动端和桌面端会话
curl --request DELETE \
  --url http://127.0.0.1:3010/sessions/user%40example.com \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

响应数据、Axios 示例和错误行为见 [Control API 会话文档](scripts/api/README.md#session-management)。

---

## 免责声明

使用风险自负。
自动化 Microsoft Rewards 可能导致账号被暂停或封禁。
本软件仅供学习交流使用。
作者不对微软采取的任何措施负责。
