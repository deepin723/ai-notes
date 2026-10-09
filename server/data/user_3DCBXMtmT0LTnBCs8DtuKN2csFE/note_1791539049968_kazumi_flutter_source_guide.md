---
id: note_1791539049968_kazumi_flutter_source_guide
type: summary
title: "Kazumi 源码导读：一个 Flutter 番剧应用怎样从启动走到播放"
tags:
  - Kazumi
  - Flutter
  - Dart
  - 源码学习
  - 架构
links: []
space: Kazumi 项目学习
created: '2026-10-09T17:44:09+08:00'
updated: '2026-10-09T17:44:09+08:00'
---

> **阅读基准**：本机源码 `/Users/dengpeng/Documents/AI与开发工具/学习资料/Kazumi`，`main` 分支提交 [`4e821e48`](https://github.com/Predidit/Kazumi/tree/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02)，`pubspec.yaml` 标记为 2.3.8。已安装的 macOS 应用来自 2.3.7 发布包，因此本文解读的是**当前源码**，不把新代码当成已安装版本的运行证据。本文依据静态源码；没有运行 Flutter 构建、测试，也没有验证具体视频源的播放结果。

## 先建立一张脑内地图

Kazumi 不是“一个页面直接抓网站并播放”的小程序。它把工作拆成三条链：

| 链 | 要解决的问题 | 主要入口 |
| --- | --- | --- |
| 番剧元数据 | 首页、搜索、详情中的名称、封面、评分、日历从哪里来 | `pages/popular/` → `request/apis/bangumi_api.dart` → `request/clients/bangumi_client.dart` |
| 视频站点规则 | 某部番剧在哪些站点有资源、每个站点有哪些播放线路与集数 | `pages/info/source_sheet.dart` → `services/plugin/` |
| 播放 | 集数页面怎样变成最终媒体地址，再交给播放器 | `pages/video/video_controller.dart` → `services/video_source/` → `pages/player/` |

**关键理解**：Bangumi 元数据和第三方视频站点不是同一个服务。看到番剧封面只能说明元数据链通了，不能推断某条播放规则可用。源码入口可从 [`lib/main.dart`](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/lib/main.dart) 顺着读。

## 1. Flutter 外壳是怎样立起来的

`main()` 先调用 `WidgetsFlutterBinding.ensureInitialized()`，初始化 `media_kit`；然后在应用支持目录初始化 Hive 并调用 `GStorage.init()` 打开本地数据盒。桌面系统再配置窗口大小与标题栏，最后用 `runApp(ModularApp(... child: AppWidget()))` 启动 UI。存储初始化失败时，代码会改为展示错误页。这一顺序说明：**存储是进入主界面前的基础依赖**。[看 `main.dart` 25–109 行](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/lib/main.dart#L25-L109)

`AppWidget` 负责 Material 主题、系统明暗色、桌面托盘与窗口关闭等应用级行为，不是业务首页。`appModule` 把 `coreModule` 和 `indexModule` 接起来；前者注册全局仓库、服务和跨页面控制器，后者声明页面路由。[看 `app_widget.dart`](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/lib/app_widget.dart)、[`app_module.dart`](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/lib/app_module.dart)、[`core_module.dart`](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/lib/core_module.dart)

第一次进入 `/` 实际是 `InitPage`。它加载规则、下载管理和若干同步服务；如果规则列表为空，会进入 `/onboarding`，否则跳转到默认页面。所以“启动 → 首页”之间还隔着一次业务初始化。[看 `index_module.dart` 70–123 行](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/lib/pages/index_module.dart#L70-L123)、[`init_page.dart` 53–98 行](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/lib/pages/init_page.dart#L53-L98)

### 学 Flutter 时要认出的三个概念

1. **Widget 树**：`AppWidget`、`IndexPage`、`PopularPage` 是界面组件；`build()` 根据状态产出 UI。
2. **路由与依赖注入**：`flutter_modular` 的 `createModule` 决定“URL 对应哪个页面”和“页面拿到哪个控制器”。全局对象注册在 `coreModule`，详情页和播放页的控制器由各自路由创建，生命周期更短。
3. **响应式状态**：控制器用 MobX 的 `@observable`、`@action`；界面用 `Observer` 订阅变化。例如首页滚动到末端，`PopularPage` 调用 `queryBangumiByTrend()`，列表变化后 `Observer` 重建相应区域。[看 `popular_controller.dart` 16–69 行](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/lib/pages/popular/popular_controller.dart#L16-L69)、[`popular_page.dart` 52–89 行](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/lib/pages/popular/popular_page.dart#L52-L89)

## 2. 首页数据怎样到屏幕上

读这条链就能认识“UI → 状态 → API → HTTP → 模型”的分层：

```text
PopularPage 滚动或首次加载
  → PopularController.queryBangumiByTrend()
  → BangumiApi.getBangumiTrendsList()（镜像模式走另一分支）
  → BangumiClient / DioFactory.bangumiDio
  → JSON 转成 BangumiItem
  → trendList 变化，Observer 更新卡片
```

`DioFactory` 分别建立 Bangumi、规则仓库、插件站点、下载等 HTTP 客户端，统一处理超时、请求头和拦截器。它们看起来都是“请求网络”，但服务对象和配置不同，学习时不要混为一个接口。[看 `dio_factory.dart` 10–101 行](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/lib/request/core/dio_factory.dart#L10-L101)、[`bangumi_api.dart`](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/lib/request/apis/bangumi_api.dart)

**小练习**：在 `PopularPage` 找到首次请求与滚动加载的调用位置，再在 `PopularController` 找到 `isLoadingMore` 的赋值。解释加载条为什么会出现、请求完成后为什么会消失。

## 3. 最有项目特色的部分：规则引擎

一个 `Plugin` 是视频站点规则的**数据对象**：它存站点名、搜索 URL、XPath 选择器、线路与集数选择器，也支持 API 模式配置。`Plugin.fromJson()` 把 JSON 规则变成对象；`PluginsController` 从应用支持目录载入规则，并管理安装、更新、持久化。[看 `plugins.dart` 19–115 行](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/lib/plugins/plugins.dart#L19-L115)、[`plugins_controller.dart` 110–180 行](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/lib/plugins/plugins_controller.dart#L110-L180)

`RuleEngine.search()` 根据规则的 `searchMode` 选择 XPath 或 API 策略：先构造请求，再取回 HTML/JSON，最后解析成统一的 `PluginSearchResponse`。`queryChapters()` 对播放线路和集数做同样的分派。XPath 策略处理 HTML 节点，API 策略处理 JSONPath；它们都把不同站点的结果转换为应用统一的数据结构。[看 `rule_engine.dart` 36–96、130–180 行](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/lib/services/plugin/rule_engine.dart#L36-L96)、[`xpath_rule_strategy.dart`](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/lib/services/plugin/xpath_rule_strategy.dart)、[`api_rule_strategy.dart`](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/lib/services/plugin/api_rule_strategy.dart)

详情页的 `SourceSheet` 会按番剧名调用 `PluginSearchService.queryAllSource()`，并行查询已安装规则。点一个结果后，它用 `plugin.queryChapterRoads()` 取得线路，再把 `OnlineVideoPlaybackArgs` 交给 `/video/` 路由。`PluginSearchService` 还用会话标记阻止旧请求覆盖新结果；这是异步界面里值得学的细节。[看 `source_sheet.dart` 53–66、121–143 行](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/lib/pages/info/source_sheet.dart#L53-L66)、[`plugin_search_service.dart` 59–94 行](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/lib/services/plugin/plugin_search_service.dart#L59-L94)

**小练习**：拿 `assets/plugins/` 中的一份 JSON，对照 `Plugin.fromJson()` 标出搜索 URL、搜索结果列表、名称、详情地址、线路、集数这六个字段；再画出这些字段分别在哪一步被使用。先读规则，不必访问或改动第三方站点。

## 4. 从“集数页面”到“真正的视频”

规则引擎给出的集数 URL 往往还是网页，不一定是 `.m3u8` 或 `.mp4`。`VideoPageController` 在换集时先取消旧会话和旧解析，规范化集数 URL，然后调用 `WebViewVideoSourceService.resolve()`。该服务复用 WebView，等待页面解析事件返回媒体 URL；macOS/iOS 选择 Apple 的 WebView 实现。解析成功后组装 `PlaybackInitParams`（URL、偏移、请求头、集数等）交给 `PlayerController.init()`。[看 `video_controller.dart` 420–473、589–650 行](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/lib/pages/video/video_controller.dart#L420-L473)、[`webview_video_source_service.dart` 24–100 行](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/lib/services/video_source/webview_video_source_service.dart#L24-L100)、[`video_webview_controller.dart` 96–112 行](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/lib/webview/video/video_webview_controller.dart#L96-L112)

`PlayerController` 再把播放、弹幕、进度拖动、一起看、截图拆给各自子控制器。真正打开媒体的是 `PlayerPlaybackController` 中的 `media_kit` `Player.open(Media(...))`。因此这里至少有两种“播放器相关对象”：**WebView 负责从网页解析媒体地址，media_kit 负责播放媒体文件/流**。[看 `player_controller.dart` 28–75 行](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/lib/pages/player/player_controller.dart#L28-L75)、[`player_playback_controller.dart` 270–305、452–463 行](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/lib/pages/player/controller/player_playback_controller.dart#L270-L305)

换集时的 `AsyncSessionOwner` 与 `isStale` 检查防止“上一集较慢的解析结果晚到，反而覆盖当前集”。这是本项目比一般 Flutter 入门例子复杂、也更值得学习的地方。

## 5. 本地数据和跨平台代码怎么读

`GStorage` 用 Hive 盒保存设置、收藏、历史、搜索历史、下载记录等；`Hive.registerAdapters()` 注册对象序列化器。部分模型旁边的 `.g.dart` 是生成代码，初学时先看原始模型与 `GStorage` 的调用，暂时跳过生成文件。[看 `storage.dart` 147–165 行](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/lib/services/storage/storage.dart#L147-L165)

`android/`、`ios/`、`macos/`、`windows/`、`linux/` 是平台工程；多数业务逻辑在 `lib/`。平台差异通过 `Platform.is...` 和不同 WebView 实现处理。`pubspec.yaml` 列出 Flutter/Dart 版本约束、依赖与资源；当前源码指定 Flutter 3.47.6、Dart `>=3.10.0 <4.0.0`，并使用项目作者固定提交的 `media_kit` Git 依赖。[看 `pubspec.yaml` 1–25、73–105 行](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/pubspec.yaml#L1-L25)

## 建议的四轮学习顺序

1. **第一轮：只追启动和页面**。读 `main.dart` → `app_module.dart` → `core_module.dart` → `pages/index_module.dart` → `pages/init_page.dart`。自己画出“启动、初始化、首页”三步。
2. **第二轮：只追一个首页请求**。读 `popular_page.dart` → `popular_controller.dart` → `bangumi_api.dart` → `bangumi_client.dart` → `dio_factory.dart`，理解 `Future`、JSON 模型和 `Observer`。
3. **第三轮：只追一次站点搜索**。读 `source_sheet.dart` → `plugin_search_service.dart` → `plugins.dart` → `rule_engine.dart` → XPath/API 策略。回答“为什么增加站点主要靠 JSON 规则，而不必每个站点都写一套页面”。
4. **第四轮：只追一次换集**。读 `video_playback_args.dart` → `video_controller.dart` → `webview_video_source_service.dart` → `player_controller.dart` → `player_playback_controller.dart`。画出网页地址、媒体地址、播放状态三者的区别。

每轮结束后，把“谁调用谁、输入是什么、输出是什么、失败会怎样”写成五行摘要，比逐行通读 396 个 `lib/` 文件更有效。

## 动手前的边界

- 本机目前未检测到 `flutter`/`dart` 命令，所以这里没有声称本地编译或测试通过。以后配置 Flutter SDK 时，应按**正在阅读的源码版本**核对 `pubspec.yaml` 的 Flutter 版本，再运行 `flutter pub get`、`flutter test`、`flutter analyze`；仓库的 CI 也把测试与分析作为构建前置步骤。[看发布工作流](https://github.com/Predidit/Kazumi/blob/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/.github/workflows/release.yaml)
- 仓库的 `.g.dart` 多由代码生成维护，练习时改原始 Dart 文件，不直接手改生成文件。`test/rule_engine_test.dart` 和 `test/async_session_test.dart` 是理解规则解析与异步竞态的好入口。[看测试目录](https://github.com/Predidit/Kazumi/tree/4e821e48282d0e8e3753fd6266bb1d15e4dc0f02/test)
- 规则和视频源可能依赖外部站点，站点变化、验证码、地区或网络条件会影响实际可用性。本文只解释源码结构；使用素材与视频时仍应遵守权利和当地法律。

**一句话复盘**：Kazumi 的 Flutter 页面展示 Bangumi 元数据；规则引擎把不同站点的搜索结果统一成线路和集数；WebView 从集数页解析最终媒体地址；`media_kit` 播放它；Hive 记住用户状态。
