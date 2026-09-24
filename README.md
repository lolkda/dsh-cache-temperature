# DSH Cache Temperature

面向 DSH `0.1.7-rc.1` 的会话级缓存保温插件，使用 TypeScript / React TSX 开发。本次适配版为 `0.2.1-rc.1`，不修改 DSH 核心，也不依赖版本豁免。

## 行为

- 每个会话独立设置，默认开启。
- 默认每 4 分钟重放一次最近成功的真实 Agent 请求；间隔可调整。
- 原请求的 Provider、模型、system、messages、tools 等输入保持不变；请求最小输出预算 `maxTokens: 1`，并使用独立取消信号。实际预算接受 SDK 的最低限制；本环境的 OpenAI Responses SDK 最低会发送 `max_output_tokens: 16`，因此不承诺所有路由严格只生成 1 token。
- 长时间等待工具时继续保温。前台模型请求优先，不另起保温请求。
- 正常结束回答后，最多继续空闲保温 30 分钟；上限可调整。保温请求本身不会延长这个窗口。
- 点击聊天的“停止生成”会结束本轮保温；开关不变，下一次真实请求成功后可以恢复。
- 关闭保温、销毁会话或卸载插件会取消后台工作。
- 保温输出不写入聊天记录，不执行工具，不开启新回合。标题生成和上下文压缩不作为重放快照。

一次保温正常完成（包括因输出预算结束）即按成功处理，不额外证明供应商缓存的实际命中或有效期。允许 SDK 施加协议所需的最低预算，但插件不会自行尝试更大的输出额度或改变 thinking；SDK 或供应商仍拒绝时，只记录失败。

## 设置

在会话输入区域的保温控制中修改当前会话：

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| 开关 | 开启 | 只控制当前会话 |
| 刷新间隔 | 4 分钟 | 两次合格请求之间的刷新间隔 |
| 空闲保温上限 | 30 分钟 | 自然结束后保温的最长窗口 |

时间允许分钟小数，按毫秒取整后范围为 1 秒到 2,147,483,647 毫秒。上限短于刷新间隔是合法配置，此次空闲可能不发生保温。

通过 DSH 原生 Config/Settings 表单持久化到当前 Profile patch；Loader entry id 保持为 `cache-keepalive`，以会话 ID 分开保存。`sessions` 是原地更新的 volatile 字段，修改设置不重新挂载插件、不丢失已捕获快照。旧 `settings.yaml` 的同名段由 DSH 自动导入，原文件保留为 `settings.yaml.imported`。默认值不需要为每个会话落一条记录。并发设置更新带版本保护，不覆盖其他会话；Host 拒绝的写入不会显示为已保存。

配置 schema 必须保持可序列化：DSH 会把插件的 `Config` 投影成 schema 信封交给浏览器，浏览器用 `new Schema(信封)` 重建后校验服务端下发的 section。带回调的 `Schema.transform` 节点无法在这条链路上往返（回调不是 JSON），重建出的 schema 会拒绝每一个已存 section，控件就永远停在“正在读取保温设置…”。因此严格校验不放在 transform 节点上，而是挂在同一 schema 的 Standard Schema `validate` 面（`~standard`）：Loader 与原生表单写入仍按字段拒绝未知字段与越界值，投影出去的信封则保持纯数据。`0.2.1-rc.1` 修的正是这一处。

只持久化设置，不保存完整请求快照、取消控制器或定时器。重启或重新加载会话后，等待新的成功真实请求；不会从历史自动重发。新会话和新 fork 使用默认设置。

只处理已加载会话，不为保温唤醒未加载或归档会话。单次保温超时为 90 秒；失败不影响正常对话，插件不立即连续重试。

> 限制的是输出预算，不是整个请求只计费 1 token；输入及缓存读取按 Provider 实际规则计费。

## 开发

验证目标为 Node 24，使用 pnpm，依赖版本固定在锁文件中。

```sh
pnpm install --ignore-scripts
pnpm typecheck
pnpm lint
pnpm build
pnpm test
# 或一次运行完整检查
pnpm check
```

项目约束和 Agent Team 写入范围见 [AGENTS.md](AGENTS.md)。

- Host/shared：TypeScript，严格类型检查，原生 Cordis 生命周期和设置接口。
- Client：React TSX，经 tsdown 编译为 DSH 原生模块 factory，复用页面 React。
- 类型检查与打包分离；第三方已发布声明使用 skipLibCheck，项目源码仍保持严格检查。
- 测试使用 Vitest、可控时钟和适配器，不在单元测试中等待真实分钟。
- 不修改 DSH 核心、内置 preset、默认浏览器根节点或安装目录。
- `pnpm check` 在测试之后追加两道发布门禁：`check:build` 证明提交的 `lib/` 就是这批源码的构建结果，`check:pack` 证明 npm 会打出的 tarball 带着 bundle patch、浏览器半体和已构建的 Host，且不含源码、测试与本地取证目录。`lib/` 随包发布，所以陈旧的提交会把与源码不符的产物发给每个安装者。

## 安装

正式安装走 npm，兼容性按 DSH 版本固定在包版本上：

```sh
dsh plugin --profile web add @lolkda/dsh-cache-temperature@next   # 预发布
dsh plugin --profile web add @lolkda/dsh-cache-temperature        # 稳定版
```

从源码或本地改动安装时，改为打成预构建包，再通过当前 DSH 的 `plugin_manager` 安装 `.tgz` 的绝对路径：

```sh
pnpm build
pnpm pack --pack-destination artifacts
```

不要直接链接工作区目录安装。DSH 的真实请求标记依赖同一份模型模块实例；工作区软链接可能绕过 Profile 的模块解析，让插件与 Agent loop 使用两份模块而无法识别请求。安装后的实际请求路径仍须验证。

本包此前在工作区内用占位名 `@local/dsh-cache-temperature`，发布身份是 `@lolkda/dsh-cache-temperature`。若当前 Profile 里装的是旧占位名的副本，切换到 npm 版本前必须先移除它：两份 bundle 的 loader 条目 id 都是 `cache-keepalive`，同时存在会冲突。设置命名空间与包名无关，移除重装不影响已保存的会话设置。

安装影响当前 Profile 的可用插件集合，设置仍按会话独立。

本包无安装脚本。若激活结果为 `restart-required`，需在重启后继续验证；保存成功不等于插件已经运行。禁用或移除本 bundle 可停止其保温工作。

## 发布

发布只由版本 tag 触发，没有别的入口，避免误发（npm 无法撤回已占用的版本号）：

```sh
node -p "require('./package.json').version"   # 确认要发布的版本
git tag v0.2.1-rc.1
git push origin v0.2.1-rc.1
```

`.github/workflows/release.yml` 随后在干净环境里安装依赖、跑完整检查与两道门禁、校验 tag 与 `package.json` 版本一致，再执行 `npm publish --provenance --access public`，最后建一个 GitHub Release。`ci.yml` 在每次 push main 和 PR 时跑同样的检查，但不接触 npm。

dist-tag 跟随版本号：预发布（如 `0.2.1-rc.1`）发到 `next`，不动 `latest`；正式版本才发到 `latest`。因此预发布必须显式安装 `@next`。预发布不覆盖 `latest` 是有意的：本插件的兼容性按 DSH 版本固定，被旧部署装上的 rc 会被版本门禁拒绝。

认证用 npm trusted publishing（OIDC）：仓库里没有 `NPM_TOKEN` secret，也不该有——runner 的 OIDC 凭据被换成短时发布凭据，没有长期有效的写权限 token 可泄露或轮换，npm 还会附上 provenance。工作流里的 `id-token: write` 就是这次交换的前提。

**但 trusted publishing 只能配置在已经存在的包上**，所以它无法覆盖第一次发布。首次发布必须由维护者用 2FA 手工做一次：

```sh
npm login                                             # 浏览器或 OTP
npm publish --access public --tag next                # 在本仓库根目录
```

发布成功后，在 npm 包页配置 trusted publisher，之后 CI 就能在没有任何 secret 的情况下发布：

```
npmjs.com -> @lolkda/dsh-cache-temperature -> Settings -> Trusted Publisher
  Organization or user: lolkda
  Repository:           dsh-cache-temperature
  Workflow filename:    release.yml
  Environment:          (留空)
  Allowed actions:      npm publish
```

配置好之后用 `gh workflow run release.yml -f publish=true` 就能跑一次发布（走 dispatch 不会建 GitHub Release，只有推 tag 才建）。

两条实测记录，供改的人少踩一次：

1. 用 token 发布时失败于 `npm error code EOTP`（run 36012163358）：该账号开了 2FA，而当时 secret 里的 granular token `bypass_2fa: false`，npm 要求一次性口令，runner 无法提供。npm 计划 2027 年 1 月取消 bypass-2FA token 的直接发布权限，这条路迟早要换。
2. 改成 OIDC 后失败于 `npm error code ENEEDAUTH`（run 36016013119）：这不是"没配好 OIDC"，而是包还没有 trusted publisher。npm 的 `oidc()` 交换失败时**不抛错**，随后发现无任何凭据才报 `ENEEDAUTH`（见 npm CLI 的 `lib/commands/publish.js` 与 `lib/utils/oidc.js`）。所以首次发布之前这一步必然失败，属于预期。

## 验证状态

本次 `0.2.1-rc.1` 已通过 `pnpm check`：Host/Client/测试三组类型检查、零告警 lint、产物构建，以及 26 个测试文件中的 198 个测试。包含真实 Loader/ConfigEditor/SettingsForms、真实 AgentLoop 的冻结请求与保温重放、旧设置导入、原地配置更新、会话隔离、取消清理、Retry-After、真实约 1 秒定时器、构建产物加载，以及浏览器表单实际消费的 schema 信封（真实 `settings.describe()` 投影 + 客户端重建校验契约）；模型 IO 使用受控适配器。

供应商实际请求与当前页面交互属于另行执行的安装态验收；自动化测试通过不等于这些项目已经完成。最终状态见随源码交付的验证记录。
