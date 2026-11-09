# DeepSeek Harness 用量预览浮窗

Web GUI 壳层叠上的可拖动、可调整大小、可折叠的浮窗，一眼查看：

- **账户余额**：按发现到的 API Key 分别显示，顶部下拉框可切换（DeepSeek 官方、Kimi Coding，以及以后新增的任意 `*_API_KEY`）；
- **Token 用量**：三个窗口——本次会话、今日、全部累计，从会话事件日志与持久化投影缓存折叠而来。

## 目录结构

```
lib/index.js        宿主半区：/usage-preview RPC 面（自包含，不导入任何 @deepseek-ai 包）
lib/client.js       浏览器 bundle：shell.overlay 浮窗（纯 loader-factory 格式）
src/client/index.js 浏览器 bundle 源码
tests/              无密钥冒烟测试（仅需 node）
tools/              针对运行中桌面应用的诊断工具
```

## 为什么是自包含的

打包后的桌面运行时通过自己的双锚点解析插件依赖。因此本插件运行时不导入任何
`@deepseek-ai/*`：所有能力都从 Cordis Context（`ctx.get(...)`）获取，浏览器
bundle 只依赖 `react`，从而跨桌面版本保持可用。

## 安装（桌面应用）

1. 将本包复制到
   `%DSH_HOME%\profiles\<profile>\node_modules\@deepseek-ai\dsh-usage-preview`。
2. 在 `%DSH_HOME%\profiles\<profile>\cordis.patch.yml` 加入：

```yaml
- insert:
    - id: usage-preview
      name: '@deepseek-ai/dsh-usage-preview'
```

3. 重启应用，浮窗出现在右下角。

宿主半区延迟注册路由：`apply` 通过 `ctx.inject(['webServer'], …)` 等待
webServer 服务（loader 在宿主服务就绪前就会挂载本行）。优先尝试 Connection RPC
通道，失败时回退为直连 webServer 的同协议前缀路由。

## 测试

```sh
node tests/smoke-host.mjs     # 用量折叠、两个余额适配器、端点分发
node tests/smoke-client.cjs   # 用假 React 执行 loader factory 并渲染面板
```

两者都不需要密钥、不访问网络。

## 诊断工具（`tools/`）

针对**运行中**的桌面应用执行；读取 `$DSH_HOME/usage-preview-debug.log` 和应用
的认证 API（浏览器会话 cookie 由本地凭据记录生成，仅本机、只读）：

| 脚本 | 用途 |
|---|---|
| `check-resolve.mjs` | 验证 profile 能解析插件包 |
| `check-patch.mjs` | 校验 profile 的 `cordis.patch.yml` |
| `diag-inventory.mjs <port>` | 列出插件条目及其 fiber 状态 |
| `diag-enable.mjs <port>` | 通过插件管理器启用/禁用条目 |
| `diag-boot.mjs <port>` | 读取浏览器引导图并查找条目 |
| `import-probe.cjs` | 复现 loader 的内部 import（从 profile 基准） |
