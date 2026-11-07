# mygo-ximalaya

面向 [MyGo Music](https://github.com/egoist/mygo-music) 的独立喜马拉雅插件，无需额外服务。

需要 **MyGo Music 0.1.20 或更新版本**。当前为 `0.1.1` 开发版。

## 功能

- 在 MyGo 搜索的「歌曲」标签搜索声音，「播客」标签搜索节目专辑。
- 在搜索框粘贴喜马拉雅专辑/单集链接；也支持 `album:专辑ID`、`sound:单集ID`。
- 浏览专辑，按正序分页播放单集。
- 打开喜马拉雅官方网页登录窗口，使用手机 App 扫码确认；会话保存在本机。
- 「我的订阅」分页读取账号订阅，不修改喜马拉雅订阅。
- 「最近收听」保存此设备最近 50 集；首页保存浏览过的最近 20 个专辑。
- 通过官方网页播放器接口取得音频地址，交给 MyGo 原生播放器播放。

已完成公开接口实测：声音和专辑搜索、专辑两页、单集链接解析、免费 M4A 音频 Range 读取。
**真实账号扫码登录、订阅列表及已购/VIP完整播放仍需在 MyGo 内验收。**

实现会检查取流响应的授权状态，拒绝已知试听地址。付费专辑中的免费单集可按服务端权限播放；账号拥有的付费/VIP内容是否能播放，以实际接口响应为准。

## 安装

当前仓库是私有的，请使用本地文件夹或 ZIP 安装。MyGo 从 GitHub 安装时不会使用你的 `gh` 登录状态。

1. 打开 MyGo Music → 设置 → 插件 → `+`。
2. 从本地文件夹选择本仓库根目录，或从 ZIP 选择 `dist/mygo-ximalaya-0.1.1.zip`。
3. 在来源选择器切换到「喜马拉雅」，点击登录，在弹出的官方网页中扫码。

仓库已包含构建后的 `index.js`，使用插件不需要安装 Node、Python 或依赖。

`0.1.1` 修复登录窗口二维码空白：改用 `passport.ximalaya.com` 登录入口。
`www.ximalaya.com/page/web/login` 虽然能显示页面，其相对路径二维码接口却返回 404。

## 开发

需要 Node.js 22 或更新版本；ZIP 打包另需 Python 3。

```sh
npm ci
npm run build
npm run check
npm test
npm run smoke
npm run pack
```

`npm test` 使用模拟接口验证错误处理、会话并发、分页、授权、地址校验，并在 QuickJS 中验证打包模块与 AES 解码。它不访问网络。

`npm run smoke` 是手动运行的公开接口检查：不读取真实用户会话、不登录、不修改服务端数据，只读取少量音频字节。它不覆盖真实账号或 VIP 权限测试。

```text
src/index.js       MyGo 导出和首页
src/auth.js        官方网页登录、账号验证
src/session.js     Cookie 保存、更新及失效
src/client.js      请求、超时、业务错误
src/catalog.js     搜索、节目分页、订阅、本地历史
src/models.js      MyGo 数据模型转换
src/playback.js    播放权限、地址解码和格式选择
scripts/          构建、公开接口检查、ZIP 打包
tests/            Node 和 QuickJS 测试
index.js          构建生成的独立插件入口
plugin.json       MyGo 插件清单
```

修改 `src/` 后运行构建；同步提交生成的 `index.js`。运行时没有 npm 模块加载需求。

## 当前边界

- 网络验证或接口变更可能导致功能暂不可用。出现验证提示时，重新登录并在官方网页确认访问正常。
- 只向喜马拉雅 API 发送会话 Cookie，不把 Cookie 附加给音频 CDN。
- 会话使用 MyGo 的本地 JSON 存储，不是系统钥匙串；请勿上传会话、日志中的凭证或 Cookie。
- 退出只清除本插件的会话，不注销其他客户端；本地浏览和收听记录保留。
- 不支持云端播放进度同步、在线订阅修改、评论写入、购买或离线批量下载。
- 标准/高音质按实际返回格式选择；请求无损但没有 FLAC 时会明确报错。
- 首版以 macOS 为验收目标；Windows/Linux 的网页登录窗口仍需分别验证。

## 许可

AGPL-3.0-only。依赖和协议参考见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
