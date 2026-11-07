# mygo-ximalaya

面向 [MyGo Music](https://github.com/egoist/mygo-music) 的独立喜马拉雅插件。

当前处于开发准备阶段，尚未实现登录或播放。

## 首版目标

- 登录喜马拉雅账号，保存会话并处理登录过期。
- 搜索专辑和声音，分页浏览专辑单集。
- 获取当前账号有权限播放的音频，交给 MyGo Music 原生播放器播放。

已购和 VIP 内容的播放能力需要实测确认。

## 开发方向

采用 `plugin.json` 和 JavaScript 入口的插件形式，不修改 MyGo Music 本体。
参考 [mygo-music-netease](https://github.com/sogud/mygo-music-netease) 的插件组织方式，喜马拉雅登录、请求及播放接口独立实现。
