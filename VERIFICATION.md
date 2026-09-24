# 验证记录

## npm 安装态验收（本轮补做，针对改名风险）

在隔离 `DSH_HOME`（`artifacts/npm-acceptance/home`，独立端口 3081，未触碰运行中的 3080 实例）里，从零初始化干净 profile 并走真实 npm 安装路径：`dsh plugin --profile web add @lolkda/dsh-cache-temperature@next`，装入 `0.2.1-rc.2`。这一项针对的正是改名后最脆弱的一环——loader 能否按**新包名**解析 bundle。

| 检查项 | 结果 |
| --- | --- |
| 组合后的 profile 树 | 含 `- id: cache-keepalive` / `name: '@lolkda/dsh-cache-temperature'`（`--dump-config`），条目 id 未变、名称随新包名解析成功 |
| 隔离实例启动 | 日志仅有启动 URL，无 skipped bundle、无兼容性阻拦、无插件相关报错（对比 0.1.1 当时被版本门禁拦截） |
| 客户端半体登记 | boot wire 中出现 `{"id":"@lolkda/dsh-cache-temperature","url":"plugins/??@lolkda/dsh-cache-temperature/client.js&rev=..."}`，并带正确的 `inject` 列表 |
| 四方字节比对 | 仓库构建 = registry tarball = 隔离 profile 安装副本，`lib/client.js` 均为 `83a6ef56…`，`lib/index.js` 均为 `2ea5eda6…` |
| 服务端实际下发 | `plugins/??…/client.js` 返回 200；前 61,087 字节与构建产物逐字节一致，唯一差异是末尾追加 87 字节 `//# sourceMappingURL=…`（DSH 客户端模块服务的包装） |
| `--dump-config-schema` 的 4 条 `unrecognized Loader tree carrier` | **与本包无关**：在不含本包的对照 home（`artifacts/compat-0.1.7-rc.1/fixed-home`）上跑同一条命令出现完全相同的 4 条（索引 173–176）。因此该命令的 `status` 字段不能作为本包证据，本次验收不依赖它 |

尚未覆盖（与 README 一致，属于另行执行的交互验收）：浏览器里设置控件的实际读写、以及真实会话中的保温请求。改名不影响这两项（设置命名空间 `cache-keepalive` 与包名无关），但它们仍未在本轮实测。

## 当前交付状态（0.2.1）

- 目标包：`@lolkda/dsh-cache-temperature`，已发布到 npm：`0.2.1-rc.1`（维护者 2FA 手工首发布）、`0.2.1-rc.2`（CI 零 secret OIDC 发布）、`0.2.1`（首个正式版，发布后 `latest` 指向它；`next` 保持 `0.2.1-rc.2`）。npm 会把**首次**发布的版本强制设为 `latest`，所以 `0.2.1` 发布前 `latest` 一直停在 rc 版本上。工作区构建产物 `artifacts/dsh-0.1.7-rc.1-fixed/local-dsh-cache-temperature-0.2.1-rc.1.tgz`。
- 已通过 `dsh plugin --profile web add` 写入当前 Web Profile（`/app/.dsh/profiles/web`），安装副本的 `lib/index.js` 与工作区构建逐字节一致。
- **激活仍为 `restart-required`：运行中的 DSH 进程加载的是旧模块，必须重启进程；刷新网页不能代替。** 重启后必须重新确认页面控件可用。
- 改名影响面已核对：设置命名空间仍为 `cache-keepalive`，与包名无关，已保存的会话设置不受影响；但 loader 条目 `cordis.patch.yml` 与浏览器 bundle banner 必须同时指向新包名，否则安装后无法解析。两处已改，并由 `tests/integration/built-artifacts.test.ts`（产物 id 必须等于 manifest 名称）与 `tests/shared/configuration.test.ts`（patch 名称必须等于 manifest 名称）分别守住，两个守卫都先观察过 RED。
- 发布链路：`.github/workflows/ci.yml` 在 push main 与 PR 上跑完整检查加两道门禁；`.github/workflows/release.yml` 只由 `v*` tag 触发，发布前校验 tag 与 `package.json` 版本一致，预发布发到 dist-tag `next`。CI 已在真实 runner 上跑通（run 36011891738），release 的非发布路径也已跑通（run 36011919566）。
- 发布认证最终采用 npm trusted publishing（OIDC）：无 `NPM_TOKEN` secret（已删除），`id-token: write` 换取短时凭据。整条链路已闭环验证：
  1. run 36012163358（推 tag `v0.2.1-rc.1`）：安装、类型检查、lint、构建、198 个测试、两道门禁、tag 与版本一致性校验全部通过，`npm publish` 失败于 `npm error code EOTP`——账号启用 2FA 而当时 token `bypass_2fa: false`，runner 无法提供一次性口令。
  2. run 36016013119（改用 OIDC 后 dispatch）：失败于 `npm error code ENEEDAUTH`。npm 的 `oidc()` 交换失败时不抛错，publish 随后因无任何凭据才报此错（npm CLI `lib/commands/publish.js`、`lib/utils/oidc.js`）。此时包尚不存在，无 trusted publisher 可匹配，属预期。
  3. 首次发布：以 `npm login --auth-type=web` 取得交互式会话，在伪终端（`script -qec ...`）下完成 npm 的浏览器批准 2FA，`npm publish --access public --tag next` 发布 `0.2.1-rc.1`；随后 `npm trust github @lolkda/dsh-cache-temperature --file release.yml --repo lolkda/dsh-cache-temperature --allow-publish` 登记信任配置，id `09cbd118-5299-4881-b1e7-2339d07dee3d`，权限 `publish, stage publish`。核验：下载 tarball 的 sha1 与发布时 registry 报的 `c5130e1fb4eaa246d6d72e92262b8696724a7795` 一致，sha512 与 integrity 一致，15 个文件，包内 `cordis.patch.yml` 指向新包名，`npm pack @lolkda/dsh-cache-temperature@next` 可正常取包。
  4. **零 secret 的 CI 发布（本轮最终验证点）**：推 tag `v0.2.1-rc.2` 触发 run 36022617711，全部步骤通过，日志含 `publishing 0.2.1-rc.2 under dist-tag next`、`Signed provenance statement`、`Provenance statement published to transparency log`（sigstore logIndex 2940998946）；registry 侧 `dist-tags = {next: 0.2.1-rc.2, latest: 0.2.1-rc.1}`，`dist.attestations` 含 SLSA provenance v1，`dist.signatures` 存在，tarball 可取且 sha1 与 registry 记录一致，`repository` 元数据正确。
- 两条与 npm 行为相关的实测结论已写入 README：非交互环境下 npm 的 2FA 会直接失败（`otplease` 先检查 `process.stdin.isTTY`），需要伪终端才能走浏览器批准；发布被接受后 registry 仍有约 4–6 分钟的可用性延迟（先 packument、后 tarball），期间 404 不是失败。**注意不要把这类延迟误报成发布失败——本轮我先误判过一次，随后用 `?nc=<时间戳>` 绕过 CDN 缓存与 `?write=true` 权威读取才定性。**

### 本轮修复：控件停在“正在读取保温设置…”

- 现象：会话输入区的保温控件能显示，但设置面板一直显示“正在读取保温设置…”，开关无法写入。
- 根因：插件 `Config` 的 `sessions` 值 schema 用了 `Schema.transform`。DSH 把插件 schema 投影成信封交给浏览器，浏览器 `ConfigFormController.decode` 用 `new Schema(信封)` 重建后校验服务端下发的 section；transform 节点的 callback 不是 JSON，重建后为 `undefined`，校验抛 `callback is not a function`，`decode` 返回 `undefined`，表单状态永远停在 `loading`。已存过任何会话设置的文档必然触发；空字典反而不触发。
- 修复：值 schema 改为纯 `Schema.object`（默认值、`min`/`max`/`step(1)` 仍在 schema 上），严格文档校验（未知字段、非整数/越界时长）改挂同一 schema 的 Standard Schema `~standard.validate` 面，Loader 与原生表单写入照旧按字段拒绝。投影出去的信封因此保持纯数据。
- 证据：新增 `tests/integration/settings-form-contract.test.ts` 先观察 RED（`expected 'callback is not a function' to be undefined`），修复后 GREEN；原有的“未知字段必须被拒绝”契约测试未改动且仍通过；部署侧 `dsh --dump-config-schema` 中该 entry 由 `status: partial` 变为 `status: schema`，信封内不再有 transform 节点，`volatile` 标记与三个叶子字段仍在；隔离实例启动后 boot wire 正常登记该客户端模块，`/plugins` 下发的 bundle 与构建产物逐字节一致。

## 历史记录：0.1.1

- 目标包：`@local/dsh-cache-temperature@0.1.1`。
- 已通过 `plugin_manager` 写入当前 Web Profile，并保存为启用。
- **激活结果为 `restart-required`：必须重启 DSH 进程，刷新网页不能代替。新版运行态尚未验收，不能报告为已生效。**
- 最初的 0.1.0 已在发现兼容问题后主动停用；临时测试观察器已移除，测试设置已恢复。

## 用户确认的最终契约

- 每会话独立，默认开启；默认 4 分钟刷新、正常结束后最多空闲保温 30 分钟，均可调整。
- 仍向 DSH 请求 `maxTokens: 1` 以最小化输出；**允许 SDK 的最低预算**。本环境的 OpenAI Responses SDK 会使用 `Math.max(maxTokens, 16)`，不承诺所有路由严格输出 1 token。
- 单次保温超时已按用户选择改为 **90 秒**；空闲到期、用户停止和前台请求仍可更早取消。
- 不修改 thinking，不追加聊天消息，不执行工具，不开启新回合。
- 正常完成重放即按保温成功处理，不额外证明供应商缓存 TTL 已续期。

## 环境

DSH 0.1.6-alpha.2；Node 24.21.0；pnpm 12.4.2；TypeScript 5.9.3；Vitest 3.2.4；tsdown 0.15.12。

## 0.1.1 自动化检查

实际执行 `pnpm check && pnpm pack --pack-destination artifacts`，退出码 0：

| 检查 | 结果 |
| --- | --- |
| Host 类型检查 | 通过 |
| Client 类型检查 | 通过 |
| Tests 类型检查 | 通过 |
| oxlint --deny-warnings | 39 文件，0 警告、0 错误 |
| Host 构建 | 通过，约 21.54 kB |
| Client 原生模块构建 | 通过，约 55.83 kB |
| 完整 Vitest 测试 | 20 文件，172/172 通过 |

新增 90 秒验收先实际观察 RED，再修改共享常量：t=89,999ms 时在途保温未被请求超时取消，t=90,000ms 时取消；idle 截止时间、前台抢占和用户停止的提前取消测试仍通过。

测试使用真实 Cordis + LlmRuntime/ToolRuntime/SettingsProvider，覆盖注册、完整重放、两会话设置隔离、revision 冲突、取消、卸载、晚声明 Slot、Retry-After 与构建产物。绝大多数时间场景使用可控时钟，另有实际约 1 秒的 timer/异步上下文验证。

## 0.1.0 首次真实验证：未通过完整验收

原始记录保留在 [live-proof.json](test-results/live-proof.json)。

已观察到：
- 捕获真实 Agent 请求；当前路由为 `cpa/gpt-6-astra`。
- 保温请求包含 371 条消息，与最近真实请求的输入指纹一致。
- DSH 层请求参数为 `maxTokens: 1`。
- 未观察到保温引起的聊天消息、工具执行或新回合事件。
- 临时设置恢复结果为 `restored`。

未通过项：重放未在原 30 秒上限内正常完成，返回 `ABORTED`，原始报告 `passed: false`。返回中的零用量不作为真实零费用证明。

后续本地诊断发现，当前路由使用 `openai-responses`，本地 pi-ai SDK 在构造请求时将预算提升到最低 16。用户据此选择接受 SDK 最低预算，并将超时延长到 90 秒；不能以旧验证替代新版验收。

## 安装态验收清单

| 项目 | 当前状态 |
| --- | --- |
| 正式 0.1.1 tgz 写入 Profile | 完成 |
| 0.1.1 实际激活 | 待重启，返回 restart-required |
| 已安装状态下捕获真实请求 | 0.1.0 已观察；0.1.1 待复验 |
| SDK 最低预算下正常完成重放 | 待复验 |
| 首次临时设置恢复、观察器移除 | 已完成 |
| 当前 Web 页面开关及设置交互 | 待重启后确认 |

安装使用预构建 tgz，而不是工作区软链接，以避免绑定另一份 dsh-llm 模块而丢失请求标记身份。安装时 pnpm 有 peer dependency 提示；不把该提示视为已消除，也不把包安装成功当成实际激活成功。

## 独立审查修复记录

- 晚声明 Slot 直接注册失败，改为 slots.inject 等待声明。
- 输入显示丢失毫秒精度、未编辑 blur 写回、Enter+blur 二次提交。
- 提前释放取消中的保温 slot，可能形成并发与陈旧回调。
- 在途保温跨越空闲截止时间未及时取消。
- Retry-After 被无关会话设置或状态重排覆盖，导致提前重试。
- Provider 长 backoff 被 Node 单次 timer 上限截断。
- 新真实请求成功后未清理旧 backoff。

源码、测试和安装包已交付；新版真实 Provider 行为与页面操作仍待重启后验收。
