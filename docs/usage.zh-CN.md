# 安装与使用

[概览](../README.zh-CN.md) · [Control API](control-api.md)

## 目录

- [快速安装](#本地安装)：本地 Node.js、[Nix](#nix) 或 [Docker](#docker)。
- [账号配置与登录会话](#账号与会话)。
- [配置示例](#配置示例) 与 [设置参考](#设置参考)。
- [命令](#命令) 与 [升级排错](#升级与排错)。

## 本地安装

1. 安装 **Node.js 24+**。
2. 解压源码包，或克隆仓库：

```bash
git clone --branch v5 https://github.com/hex-ci/Microsoft-Rewards-Script.git
cd Microsoft-Rewards-Script
```

3. 复制 `env.example` 为 `.env`，填入账号。
4. 安装依赖、Chromium 并编译：

```bash
npm ci
npm run install:browser
npm run build
node dist/config/ConfigSync.js sync --patch
```

5. 编辑 `config.json`，可参考[配置示例](#配置示例)。
6. 启动：

```bash
npm start
```

- 配置同步会创建缺失的配置或补上缺失的默认项，已有值保持不变。
- 也可以直接把 `config.example.json` 重命名为 `config.json` 手工配置，它只是模板，可以不存在。
- Linux 依赖安装：`npx patchright install --with-deps chromium`。
- 可见浏览器需要图形界面；没有显示器的 Linux 会以无头模式运行。

### Nix

启用 Nix flakes 后，在项目目录执行命令。

1. 复制 `env.example` 为 `.env` 并填入账号。
2. 保留已有 `config.json`，或使用下文[配置示例](#配置示例)。
3. 运行启动脚本，无需另外安装 Node.js。

| 命令                                                                    | 启动内容                       |
| ----------------------------------------------------------------------- | ------------------------------ |
| `bash scripts/nix/run.sh`                                               | Rewards 机器人，使用配置的模式 |
| `bash scripts/nix/run.sh api`                                           | Control API                    |
| `bash scripts/nix/run.sh manual-login user@example.com --platform both` | 交互式登录                     |

启动脚本会安装锁定版本的依赖和 Chromium，然后构建。Linux 下会提供 Chromium 所需的系统库，macOS 使用原生运行时。

## Docker

1. 复制 `env.example` 为 `.env` 并填入账号。
2. 按需修改 `compose.yaml` 中的服务。
3. 启动：

```bash
docker compose up -d --build
docker compose logs -f
```

| Compose `environment` 中的选项 | 示例            | 含义                                 |
| ------------------------------ | --------------- | ------------------------------------ |
| `TZ`                           | `Asia/Shanghai` | 调度时区。                           |
| `CRON_SCHEDULE`                | `0 7 * * *`     | 每天 07:00 运行。                    |
| `RUN_ON_START`                 | `false`         | 容器启动时是否立即运行一次。         |
| `SKIP_RANDOM_SLEEP`            | `false`         | 为 true 时跳过定时运行前的随机延迟。 |
| `MIN_SLEEP_MINUTES`            | `5`（默认）     | 定时运行的最小延迟。                 |
| `MAX_SLEEP_MINUTES`            | `50`（默认）    | 定时运行的最大延迟。                 |
| `STUCK_PROCESS_TIMEOUT_HOURS`  | `8`（默认）     | 已有进程的超时时间。                 |
| `CONFIG_REWARDS_MODE`          | `browser`       | 任务通道：`browser` 或 `api`。       |
| `API_MODE`                     | `true`          | 在调度器之外同时启动 Control API。   |
| `CONFIG_AUTO_SYNC`             | `true`          | 启动时补齐配置默认项。               |

- Docker 在两种模式下都无头运行。
- 设置在宿主机上的 **`config/config.json`**。
- 首次启动会用内置默认值创建该文件。
- 想复用自己的配置，启动前把它放到 `config/config.json`。
- 保留 `config`、`sessions`、`diagnostics` 三个挂载目录。
- 已保存的调度会覆盖 `CRON_SCHEDULE`，见 [API 定时](control-api.md#scheduling)。
- 只想手动通过 API 运行时，关闭已保存的调度，设 `RUN_ON_START=false` 并清空 `CRON_SCHEDULE`。

本分支已通过 `compose.override.yaml` 指向 `ghcr.io/hex-ci/microsoft-rewards-script:5`，拉取即可：

```bash
docker compose pull
docker compose up -d
```

可以固定到具体的 `5.x.y` 版本。

## 账号与会话

在 `.env` 中为每个账号添加一组编号配置：

```dotenv
ACCOUNT_1_EMAIL=user@example.com
# 无密码/仅验证器登录时可省略密码
#ACCOUNT_1_PASSWORD=your-password
ACCOUNT_1_LANG_CODE=en
ACCOUNT_1_GEO_LOCALE=NL

ACCOUNT_2_EMAIL=another@example.com
#ACCOUNT_2_PASSWORD=another-password
```

- 后续账号用 `ACCOUNT_3_*`、`ACCOUNT_4_*` 依此类推。
- 允许槽位不连续。
- 账号按槽位顺序选取，`clusters` 控制并发数。
- `.env` 和会话数据务必保密。

### 账号选项

把 `N` 换成账号槽位号。

| 环境变量                             | 默认值  | 作用                                   |
| ------------------------------------ | ------- | -------------------------------------- |
| `ACCOUNT_N_EMAIL`                    | 必填    | 微软账号邮箱。                         |
| `ACCOUNT_N_PASSWORD`                 | 空      | 密码；无密码登录时可省略。             |
| `ACCOUNT_N_TOTP_SECRET`              | 未设置  | 验证器 TOTP 密钥。                     |
| `ACCOUNT_N_RECOVERY_EMAIL`           | 空      | 支持的验证流程使用的恢复邮箱。         |
| `ACCOUNT_N_LANG_CODE`                | `en`    | 浏览器语言，例如 `nl`、`en`、`pt-BR`。 |
| `ACCOUNT_N_GEO_LOCALE`               | `auto`  | 账号国家，例如 `NL`、`US`。            |
| `ACCOUNT_N_SAVE_FINGERPRINT_DESKTOP` | `true`  | 复用已保存的桌面浏览器指纹。           |
| `ACCOUNT_N_SAVE_FINGERPRINT_MOBILE`  | `true`  | 复用已保存的移动浏览器指纹。           |
| `ACCOUNT_N_PROXY_URL`                | 空      | 浏览器代理地址。                       |
| `ACCOUNT_N_PROXY_PORT`               | `0`     | 需要时单独指定的代理端口。             |
| `ACCOUNT_N_PROXY_USERNAME`           | 空      | HTTP/HTTPS 代理用户名。                |
| `ACCOUNT_N_PROXY_PASSWORD`           | 空      | HTTP/HTTPS 代理密码。                  |
| `ACCOUNT_N_PROXY_HTTP`               | `false` | 同时让支持的 HTTP 请求走代理。         |

- `auto` 会在首次获取到微软资料后缓存国家。
- 浏览器语言作用于新标签页、弹窗和手动会话；站点自身语言设置可能优先。
- 搜索词语言是独立设置：`useAccountLocale=true` 时由账号国家推导。
- Rewards 运行时区由浏览器提供；Docker 的调度使用 `TZ`。
- 支持 HTTP、HTTPS 和不带认证的 SOCKS 代理。

### 只登录不做任务

**通过 API：** 对全部账号或指定槽位执行[重新生成会话](control-api.md#regenerate-sessions)。

**在图形界面下：**

```bash
npm run manual-login -- user@example.com --platform both --fresh
```

1. 在每个浏览器窗口完成登录。
2. 等待会话已保存的提示。
3. 校验通过后浏览器会自动关闭。

| 选项                 | 行为                            |
| -------------------- | ------------------------------- |
| `--platform desktop` | 仅桌面会话。                    |
| `--platform mobile`  | 仅移动会话，manual-login 默认。 |
| `--platform both`    | 两种会话，依次进行。            |
| `--fresh`            | 忽略已保存的 cookie 重新登录。  |

- 校验失败或取消会保留原有会话。
- 自动运行会复用兼容的会话，需要时再重新登录。
- API 模式下浏览器会在执行任务前关闭。
- 后台的 API/Docker 任务无法通过 stdin 输入邮箱验证码，这类情况请用手动登录。
- 删除会话前先停止正在运行的任务。

## 配置示例

把下面列出的值填到 `config.json` 的对应字段，保留其他设置和嵌套对象中的同级字段。

新建 `config.json` 时，一个片段就可以作为整个初始文件，缺失项会使用内置默认值。

### 浏览器模式，顺序会话

```json
{
    "rewardsMode": "browser",
    "headless": false,
    "clusters": 1,
    "searchSettings": {
        "parallelSearching": false,
        "maxSearchOnBingAttempts": 3
    }
}
```

### API 模式，顺序会话

```json
{
    "rewardsMode": "api",
    "headless": true,
    "clusters": 1,
    "searchSettings": {
        "parallelSearching": false,
        "maxSearchOnBingAttempts": 3
    }
}
```

### 只做活动

关闭常规搜索、额外搜索、Explore 搜索、Visual Search 和相关实验。

```json
{
    "workers": {
        "doDailySet": true,
        "doClaimBonusPoints": true,
        "doMorePromotions": true,
        "doOtherPromotions": true,
        "doPunchCards": true,
        "doAppPromotions": true,
        "doDailyCheckIn": true,
        "doReadToEarn": true,
        "doDesktopSearch": false,
        "doMobileSearch": false,
        "doBonusSearches": false,
        "doActivateSearchPerk": false,
        "doVisualSearch": false
    },
    "activities": {
        "searchOnBing": false
    },
    "experimental": {
        "edgeBrowsing": false,
        "browserSearchApiReport": false
    }
}
```

### 更长的停顿

与任一模式搭配使用。

```json
{
    "accountDelay": { "min": "2min", "max": "5min" },
    "taskDelay": { "min": "30sec", "max": "1min" },
    "searchSettings": {
        "searchDelay": { "min": "45sec", "max": "90sec" },
        "readDelay": { "min": "30sec", "max": "1min" }
    }
}
```

## 设置参考

下表默认值来自内置配置。环境变量列可写在 `.env` 或 Compose 的 `environment:` 中。

- 修改 `config.json` 后，改动在**下一次运行**生效。
- 时长接受 `"30sec"` 这类字符串，也接受毫秒数字。
- 延迟的 `max` 不得小于 `min`。
- 缺失或非法的设置会告警并回退默认值；JSON 语法错误必须自行修正。

### 通用

| 设置                        | 默认          | 作用                                   | 环境变量覆盖                                            |
| --------------------------- | ------------- | -------------------------------------- | ------------------------------------------------------- |
| `rewardsMode`               | `"browser"`   | 用渲染控件还是 `"api"` HTTP 完成任务。 | `CONFIG_REWARDS_MODE`                                   |
| `sessionPath`               | `"sessions"`  | 会话保存目录。                         | -                                                       |
| `headless`                  | `false`       | 隐藏浏览器窗口。                       | `CONFIG_HEADLESS`                                       |
| `clusters`                  | `1`           | 并发账号数，正整数。                   | `CONFIG_CLUSTERS`                                       |
| `accountDelay`              | `1min–3min`   | 账号之间的间隔。                       | `CONFIG_ACCOUNT_DELAY_MIN` / `CONFIG_ACCOUNT_DELAY_MAX` |
| `taskDelay`                 | `15sec–30sec` | 单个任务之间的间隔。                   | `CONFIG_TASK_DELAY_MIN` / `CONFIG_TASK_DELAY_MAX`       |
| `globalTimeout`             | `"30sec"`     | 浏览器操作与账号数据请求的预算。       | `CONFIG_GLOBAL_TIMEOUT`                                 |
| `ensureStreakProtection`    | `true`        | 开启可用的 streak protection。         | `CONFIG_ENSURE_STREAK_PROTECTION`                       |
| `autoClaimPunchcardRewards` | `false`       | 自动领取已完成的打卡奖励。             | `CONFIG_AUTO_CLAIM_PUNCHCARD_REWARDS`                   |
| `continueOnBotWarning`      | `false`       | 收到微软明确的反机器人警告后仍继续。   | `CONFIG_CONTINUE_ON_BOT_WARNING`                        |
| `skipNonPointTasks`         | `true`        | 跳过没有积分奖励的活动。               | `CONFIG_SKIP_NON_POINT_TASKS`                           |
| `searchOnBingLocalQueries`  | `false`       | 使用内置的 Explore on Bing 搜索词。    | `CONFIG_SEARCH_ON_BING_LOCAL`                           |
| `debugLogs`                 | `false`       | 输出更多诊断日志。                     | `CONFIG_DEBUG_LOGS`                                     |
| `errorDiagnostics`          | `false`       | 保存可用的脱敏诊断快照。               | `CONFIG_ERROR_DIAGNOSTICS`                              |

streak protection 在两种模式下都通过 API 对每个账号检查一次。如果无法开启或无法校验（包括没有可用的保护天数），会记录警告并继续执行其他任务。

**任务节奏**

- Daily Set 的每一项分别使用 `taskDelay`。
- 该间隔同样作用于促销、打卡步骤和 App 任务。
- 失败的任务仍占用间隔；跳过的任务不额外增加间隔。
- 并行执行的桌面/移动端各自独立计时。
- 两个延迟边界都设为 `0` 即关闭任务间隔。
- 搜索和文章阅读使用下面的独立延迟。

### Workers（任务）

以下字段写在 `workers` 内，账号支持时才会执行。

| Worker                 | 默认    | 活动                             | 环境变量覆盖                         |
| ---------------------- | ------- | -------------------------------- | ------------------------------------ |
| `doDailySet`           | `true`  | 每日任务项。                     | `CONFIG_WORKER_DAILY_SET`            |
| `doMorePromotions`     | `true`  | 额外促销。                       | `CONFIG_WORKER_MORE_PROMOTIONS`      |
| `doOtherPromotions`    | `true`  | SAIOS 通道的额外促销（本分支）。 | `CONFIG_WORKER_OTHER_PROMOTIONS`     |
| `doPunchCards`         | `true`  | 打卡卡片步骤。                   | `CONFIG_WORKER_PUNCH_CARDS`          |
| `doClaimBonusPoints`   | `true`  | 领取可用的奖励积分。             | `CONFIG_WORKER_CLAIM_BONUS_POINTS`   |
| `doAppPromotions`      | `true`  | App 平台促销。                   | `CONFIG_WORKER_APP_PROMOTIONS`       |
| `doDailyCheckIn`       | `true`  | 每日签到。                       | `CONFIG_WORKER_DAILY_CHECKIN`        |
| `doReadToEarn`         | `true`  | Read to Earn 文章。              | `CONFIG_WORKER_READ_TO_EARN`         |
| `doDesktopSearch`      | `true`  | 桌面搜索额度。                   | `CONFIG_WORKER_DESKTOP_SEARCH`       |
| `doMobileSearch`       | `true`  | 移动搜索额度。                   | `CONFIG_WORKER_MOBILE_SEARCH`        |
| `doBonusSearches`      | `false` | 额外搜索活动。                   | `CONFIG_WORKER_BONUS_SEARCHES`       |
| `doActivateSearchPerk` | `true`  | 搜索加成激活。                   | `CONFIG_WORKER_ACTIVATE_SEARCH_PERK` |
| `doVisualSearch`       | `false` | Visual Search 连续活动。         | `CONFIG_WORKER_VISUAL_SEARCH`        |

每日签到现在每个账号在 Read to Earn 之前执行一次。会先做一次 streak/促销检查，已完成的签到（包括重启后）直接跳过；完成情况通过刷新后的状态或余额校验。

奖励积分只有在已知可领取总额大于 0 时才提交。浏览器模式下的卡片会依次尝试 flyout、`/earn` 和 `/dashboard`；语义仍有歧义的控件保持不动。

`activities` 内：

| 设置           | 默认   | 控制内容               | 环境变量覆盖                     |
| -------------- | ------ | ---------------------- | -------------------------------- |
| `urlReward`    | `true` | URL 奖励类活动。       | `CONFIG_ACTIVITY_URL_REWARD`     |
| `searchOnBing` | `true` | Explore on Bing 活动。 | `CONFIG_ACTIVITY_SEARCH_ON_BING` |

### 搜索设置

以下字段写在 `searchSettings` 内。

| 设置                      | 默认                                                 | 作用                                  | 环境变量覆盖                                                    |
| ------------------------- | ---------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------- |
| `parallelSearching`       | `true`                                               | 并行处理桌面与移动端工作。            | `CONFIG_SEARCH_PARALLEL`                                        |
| `searchDelay`             | `30sec–1min`                                         | 搜索之间的间隔。                      | `CONFIG_SEARCH_DELAY_MIN` / `CONFIG_SEARCH_DELAY_MAX`           |
| `readDelay`               | `30sec–1min`                                         | 文章阅读停留时间。                    | `CONFIG_SEARCH_READ_DELAY_MIN` / `CONFIG_SEARCH_READ_DELAY_MAX` |
| `maxSearchOnBingAttempts` | `3`                                                  | 每个 Explore 奖励的搜索次数，正整数。 | `CONFIG_SEARCH_ON_BING_MAX_ATTEMPTS`                            |
| `maxBonusSearches`        | `110`                                                | 额外搜索上限；`0` 关闭，最大 `1000`。 | `CONFIG_SEARCH_MAX_BONUS_SEARCHES`                              |
| `runOnZeroPoints`         | `false`                                              | 搜索积分用尽后仍允许有限次搜索。      | `CONFIG_SEARCH_RUN_ON_ZERO_POINTS`                              |
| `clusterSearch`           | `true`                                               | 为每个话题追加相关的 Bing 联想词。    | `CONFIG_SEARCH_CLUSTER`                                         |
| `useAccountLocale`        | `true`                                               | 优先使用由账号国家推导的语言/地区。   | `CONFIG_SEARCH_USE_ACCOUNT_LOCALE`                              |
| `queryEngines`            | `["google", "local", "wikipedia", "rss.googleNews"]` | 话题来源，至少一项。                  | `CONFIG_SEARCH_QUERY_ENGINES`                                   |
| `scrollRandomResults`     | `false`                                              | 浏览器模式下可选的结果页滚动。        | `CONFIG_SEARCH_SCROLL_RANDOM`                                   |
| `clickRandomResults`      | `false`                                              | 浏览器模式下可选的结果页访问。        | `CONFIG_SEARCH_CLICK_RANDOM`                                    |
| `searchResultVisitTime`   | `"10sec"`                                            | 可选结果访问的停留时间。              | `CONFIG_SEARCH_VISIT_TIME`                                      |

**搜索行为**

- Explore 的次数预算在 flyout、earn 和移动端各次执行间共享，失败也计入。
- 预算在下一个账号运行开始时重置。
- 常规/额外搜索在浏览器模式下每个查询最多提交五次。
- 浏览器模式每 **四次搜索** 检查一次积分，并在最后再检查一次。
- 崩溃的 Bing 标签页会在同一会话内被替换。
- 崩溃的可选结果访问会关闭其弹窗并产生警告。
- 浏览器点击使用 Ghostclick，滚动使用共享的滚轮例程。
- 同意提示会在操作控件前处理；同意被阻塞时任务保持未完成。

### 搜索词来源

| 取值                                  | 话题                                                |
| ------------------------------------- | --------------------------------------------------- |
| `google`                              | Google 趋势话题。                                   |
| `local`                               | 内置[本地搜索词](../src/data/search-queries.json)。 |
| `wikipedia`                           | 维基百科话题源。                                    |
| `wikirandom`                          | 维基百科随机话题。                                  |
| `hackernews`                          | Hacker News 话题。                                  |
| `reddit`                              | Reddit 话题。                                       |
| `rss`                                 | 各地区 Google 订阅源与已配置的 RSS 源。             |
| `rss.googleTrends` / `rss.googleNews` | 各地区 Google 趋势/新闻。                           |
| `rss.bbc`                             | 已配置的全部 BBC 订阅源。                           |
| `rss.bbc.technology`                  | 单个具名订阅源。                                    |

RSS 选择器遵循 `rss`、`rss.<站点>` 或 `rss.<站点>.<栏目>`，清单见 [rssFeeds.ts](../src/constants/rssFeeds.ts)。

- `useAccountLocale=false` 时使用英文/美国的搜索词偏好。
- 来源可能返回其他语言，或语言元数据未知。
- 常规搜索日志会显示所选搜索词的语言和来源。
- 调试日志额外显示上级话题和来源 URL。

```text
[SEARCH-BING] Searching | search=1 | query="alexander zverev" | language=nl | source=rss.googleTrends | progressCheckEvery=4
```

### 实验特性与代理

实验字段写在 `experimental` 内，默认全部为 `false`。

| 设置                     | 行为                                                                 | 环境变量覆盖                                    |
| ------------------------ | -------------------------------------------------------------------- | ----------------------------------------------- |
| `blockMedia`             | 拦截浏览器的图片/视频/音频请求。                                     | `CONFIG_EXPERIMENTAL_BLOCK_MEDIA`               |
| `edgeBrowsing`           | 在任一模式下运行后台 Edge API 任务。                                 | `CONFIG_EXPERIMENTAL_EDGE_BROWSING`             |
| `browserSearchApiReport` | 检查当日 Bing 搜索连续天数；未确认完成时发送一次桌面 API 搜索/上报。 | `CONFIG_EXPERIMENTAL_BROWSER_SEARCH_API_REPORT` |

- 上报在桌面搜索阶段之后执行，即使额度已满或桌面搜索 worker 已关闭。
- 新鲜的 Bing 搜索连续天数检查会跳过当日已完成项（包括重启后）；否则最多发送一次请求，校验阶段不会重发。
- 已取消/延期的账号会直接停止后续工作。
- API 模式忽略该实验特性。

`proxy` 内：

| 设置                      | 默认    | 作用                                  | 环境变量覆盖                             |
| ------------------------- | ------- | ------------------------------------- | ---------------------------------------- |
| `queryEngine`             | `true`  | 让支持的话题源请求也走账号代理。      | `CONFIG_PROXY_QUERY_ENGINE`              |
| `ignoreCertificateErrors` | `false` | 对刻意配置的中间人代理关闭 TLS 校验。 | `CONFIG_PROXY_IGNORE_CERTIFICATE_ERRORS` |

### 日志与通知

完成 Bing 搜索、Daily Set、Edge 浏览、Bing App 和 Visual Search 连续天数后会输出绿色完成日志。
当 Rewards 提供周期总数时，消息包含 `streak=4/7`（已完成天数/总天数）。
相同完成不会在每次快照轮询时重复输出；日志在每次账号运行时重置。
浏览器模式会在关闭活动浏览器前刷新连续天数。不可用或未完成的连续天数不会记为完成。

| 结果          | 含义                               |
| ------------- | ---------------------------------- |
| `confirmed`   | 已校验完成，实际入账金额可能未知。 |
| `unconfirmed` | 预期的工作未能确认。               |
| `failed`      | 操作失败。                         |
| `skipped`     | 已完成、不可用、已禁用或不适用。   |

- 绿色日志表示确认完成或校验入账。
- Read to Earn 会显示每次校验到的入账；待确认的检查只是信息性输出。
- 缺少积分证据时显示 `unknown`，不会猜测奖励金额。
- API 会把未完成的工作与不可用/不适用的活动分开。
- 由奖励、结果访问和 MSN 阅读打开的弹窗会在每次点击后清理。
- 诊断保存在 `diagnostics/`，分享前请先检查内容。

**日志过滤**

控制台输出用 `consoleLogFilter`，通知用 `webhook.webhookLogFilter`。

| 字段            | 取值或示例                                           |
| --------------- | ---------------------------------------------------- |
| `enabled`       | 默认 `false`；`true` 开启过滤。                      |
| `mode`          | `"whitelist"` 保留匹配项，`"blacklist"` 移除匹配项。 |
| `levels`        | `["info", "warn", "error"]`，也支持 `"debug"`。      |
| `keywords`      | `["Finished account"]`                               |
| `regexPatterns` | `["SEARCH-.*"]`                                      |

任一等级、关键词或正则命中即算匹配。控制台调试输出仍需 `debugLogs=true` 或 `-dev`。

- 控制台过滤覆盖项：`CONFIG_LOG_FILTER_ENABLED`、`CONFIG_LOG_FILTER_MODE`、`CONFIG_LOG_FILTER_LEVELS`、`CONFIG_LOG_FILTER_KEYWORDS`。
- Webhook 过滤覆盖项：`CONFIG_WEBHOOK_LOG_FILTER_ENABLED`、`CONFIG_WEBHOOK_LOG_FILTER_MODE`、`CONFIG_WEBHOOK_LOG_FILTER_LEVELS`、`CONFIG_WEBHOOK_LOG_FILTER_KEYWORDS`。
- `regexPatterns` 请写在 JSON 中。

**通知服务**

每个服务配置在 `webhook` 下。

环境变量名使用 `CONFIG_DISCORD_*`、`CONFIG_TELEGRAM_*` 或 `CONFIG_NTFY_*`。

| 服务       | 必填字段                        | 可选字段                                      |
| ---------- | ------------------------------- | --------------------------------------------- |
| `discord`  | `enabled`、`url`                | -                                             |
| `telegram` | `enabled`、`botToken`、`chatId` | -                                             |
| `ntfy`     | `enabled`、`url`                | `topic`、`token`、`title`、`tags`、`priority` |

- 所有服务默认关闭。
- ntfy 默认：标题 `Microsoft-Rewards-Script`，标签 `["bot", "notify"]`，优先级 `3`（`1–5` 区间）。
- 技术性调试输出不会进入通知 webhook。

Discord 配置示例：

```json
{
    "webhook": {
        "discord": {
            "enabled": true,
            "url": "https://discord.com/api/webhooks/WEBHOOK_ID/WEBHOOK_TOKEN"
        }
    }
}
```

等价的 Discord 环境变量：

```dotenv
CONFIG_DISCORD_ENABLED=true
CONFIG_DISCORD_URL=https://discord.com/api/webhooks/WEBHOOK_ID/WEBHOOK_TOKEN
```

其他通知服务示例：

```dotenv
CONFIG_TELEGRAM_ENABLED=true
CONFIG_TELEGRAM_BOTTOKEN=your-bot-token
CONFIG_TELEGRAM_CHATID=your-chat-id

CONFIG_NTFY_ENABLED=true
CONFIG_NTFY_URL=https://ntfy.sh
CONFIG_NTFY_TOPIC=your-topic
```

### 环境变量覆盖

`.env` 或进程环境中的 `CONFIG_*` 会覆盖 JSON 设置。

```dotenv
CONFIG_REWARDS_MODE=browser
CONFIG_GLOBAL_TIMEOUT=60sec
CONFIG_TASK_DELAY_MIN=15sec
CONFIG_TASK_DELAY_MAX=30sec
CONFIG_SEARCH_ON_BING_MAX_ATTEMPTS=3
CONFIG_SEARCH_PARALLEL=false
CONFIG_SEARCH_QUERY_ENGINES=google,local,wikipedia,rss.googleNews
```

- 数组用逗号分隔。
- 自动运行时，`FORCE_HEADLESS=true` 强制无头。
- 正则过滤请写在 JSON 中。
- Compose 的 `environment:` 优先于 `env_file`。
- 改动账号/环境变量后要重启 API；Docker 需重建容器。
- API 写入配置无法覆盖当前生效的 `CONFIG_*`。

列出全部覆盖项：

```bash
node dist/config/ConfigEnvOverrides.js list
node dist/config/ConfigEnvOverrides.js list --format env
```

## 命令

| 命令                                                          | 用途                                  |
| ------------------------------------------------------------- | ------------------------------------- |
| `npm start`                                                   | 运行编译后的机器人一次。              |
| `npm run ts-start`                                            | 直接从 TypeScript 运行。              |
| `npm run dev`                                                 | 带调试日志的 TypeScript 运行。        |
| `npm run api`                                                 | 启动 Control API。                    |
| `npm run dev:api`                                             | 构建并启动 API。                      |
| `npm run manual-login -- user@example.com --platform both`    | 只创建会话，不执行任务。              |
| `npm run open-session -- user@example.com --platform desktop` | 检查已保存的会话。                    |
| `npm run clear-sessions -- list`                              | 列出已保存的会话。                    |
| `npm run clear-sessions -- email user@example.com`            | 删除某个账号的会话。                  |
| `npm run clear-sessions -- all`                               | 删除全部会话。                        |
| `npm run clear-diagnostics`                                   | 删除已捕获的诊断。                    |
| `npm run kill-chrome-win`                                     | Windows：关闭内置 Chromium 实例。     |
| `npm run install:browser`                                     | 安装匹配版本的 Chromium。             |
| `npm run build`                                               | 编译并复制运行时资源。                |
| `npm run pre-build`                                           | 安装锁定依赖和匹配的 Chromium。       |
| `npm run create-docker`                                       | 构建 Docker 镜像。                    |
| `npm run check`                                               | 构建、API 类型检查、lint 与格式检查。 |
| `npm run check:api`                                           | 对 API 的 JavaScript 做类型检查。     |
| `npm run lint` / `npm run lint:fix`                           | 检查/修复代码风格。                   |
| `npm run format:check` / `npm run format`                     | 检查/应用格式。                       |

## 升级与排错

1. 保留 `.env`、`config.json`、`config/` 和 `sessions/`。
2. 替换源码文件。
3. 重新安装并构建：

```bash
npm ci
npm run install:browser
npm run build
node dist/config/ConfigSync.js sync --patch
```

4. 重启机器人/API。Docker 下执行 `docker compose up -d --build`。

配置同步使用内置默认值，修补已有配置前会先备份。

| 问题             | 处理方式                                               |
| ---------------- | ------------------------------------------------------ |
| 找不到 Chromium  | 执行 `npm run install:browser`。                       |
| 登录需要交互     | 用 `manual-login` 创建会话。                           |
| 已保存的登录失效 | 删除该账号的会话后重新登录。                           |
| 任务不可用       | 查看其分类/原因；不可用的跳过属于信息性记录。          |
| 任务一直未完成   | 检查原因与日志；请求成功本身不代表完成。               |
| 页面/请求超时    | 调高 `globalTimeout`，必要时开启调试日志。             |
| 渲染进程反复崩溃 | 检查宿主内存与容器限制；搜索标签页会自动恢复。         |
| API/仪表板连不上 | 按 [API 指南](control-api.md) 检查主机、端口和 token。 |
