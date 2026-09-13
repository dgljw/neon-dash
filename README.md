# jianguo18.top · 游戏厅

一个小游戏发布页。每个游戏是独立的自包含静态站点，放在各自的子目录里，
首页是统一的入口。

**在线：[jianguo18.top](https://jianguo18.top)**

---

## 目录里的游戏

| 路径 | 游戏 | 说明 |
| --- | --- | --- |
| `/neon-dash/` | **NEON DASH · 霓虹疾走** | Three.js r169 手写的三车道 3D 霓虹无尽跑酷 |
| `/life-simulator/` | **人生模拟器** | 从出生到终老的文字人生模拟 |

## 加一个新游戏

1. 在仓库根目录建一个文件夹，放一个 `index.html`（纯静态即可，不需要构建）
2. 在 `js/games.js` 的 `GAMES` 数组里加一条：

```js
{
  id: 'my-game',
  title: 'MY GAME',
  subtitle: '中文副标题',
  href: '/my-game/',
  desc: '一两句话介绍玩法。',
  tags: ['标签', '标签'],
  accent: '#27f4ff',        // 卡片主色
  accent2: '#ff2fd0',       // 渐变副色
  art: 'neon',              // 卡片插画：'neon' 或 'life'
  badge: 'NEW',             // 可为空
}
```

3. `npm test` 会校验「目录里的游戏」和「磁盘上的文件夹」一一对应，不会漏。

卡片插画由 `js/card-art.js` 生成（纯函数返回 SVG 字符串），加新样式就在那里加一个函数并登记到 `ART`。

## 本地运行

ES Module 需要 HTTP 环境，不能直接 `file://` 打开：

```bash
npm run dev          # 内置零依赖静态服务器 → http://127.0.0.1:5173
```

首页是 `/`，游戏在 `/neon-dash/`、`/life-simulator/`。

## 测试

三套测试，都不需要浏览器：

```bash
npm install --no-save jsdom @napi-rs/canvas   # 只有启动/渲染测试需要，部署不需要
npm test
```

| 命令 | 覆盖内容 |
| --- | --- |
| `npm run test:gameplay` | 玩法公平性：无头跑真实 `World`/`Player`，由预言机机器人按正确时机操作。撞一次就算失败。固定随机种子，可复现 |
| `npm run test:boot` | NEON DASH 客户端启动：jsdom 里跑真实 `main.js`，覆盖启动→菜单→键盘→触屏→暂停→撞车→重开→缩放，断言零运行时报错 |
| `npm run test:portal` | 首页渲染 + 目录一致性：每张卡片都渲染出来，且指向的游戏文件夹真实存在 |

`test:gameplay` 在开发中抓到一个真实的设计缺陷：跳跃滞空 0.545s，但障碍行按固定
**距离**排布时，高速下两行只隔 0.28–0.42s，连续两次跳跃在物理上不可能完成。
现在行距按最小**时间**（0.80s）计算，并且机器人会**实测**跳跃弧线而不是写死常数
——以后改重力/跳跃力，测试会自动跟上。

## 离线渲染预览

这个环境没有浏览器也没有 GPU，所以仓库带了两套「离线看一眼」的工具：

```bash
npm run preview:portal     # 用 resvg 把首页版式渲染成 PNG（复用真实卡片插画与目录）
npm run preview:game       # 用光线投射把 NEON DASH 的真实场景图渲染成 PNG
```

`tools/preview-render.mjs` 会在 jsdom 里启动真实的客户端，然后用 `Raycaster`
对真实场景图逐像素着色（近似还原光照、雾、色调映射、加法混合，并采样真实的
程序化贴图），输出 PNG。它不跑 GPU shader，但足够看清构图、配色和版式。

## 结构

```
index.html                 首页（游戏厅）
css/portal.css             首页样式
js/portal.js               首页逻辑：卡片渲染、动态背景
js/games.js                游戏目录（加游戏改这里）
js/card-art.js             卡片插画（纯函数 → SVG）

neon-dash/                 NEON DASH
  index.html
  css/style.css
  js/config.js             全部手感数值集中在此
  js/utils.js              数学工具 + 程序化 Canvas 贴图
  js/audio.js              Web Audio 合成器：音效 + synthwave BGM（无音频文件）
  js/input.js              键盘 + 触屏滑动 + 屏幕按钮
  js/particles.js          GPU 粒子池（单次 draw call，自定义 ShaderMaterial）
  js/entities.js           障碍/金币/道具的几何与材质工厂 + 对象池
  js/world.js              赛道、天空、城市天际线、行生成器与碰撞
  js/player.js             悬浮机车外观、跳跃/滑铲物理
  js/ui.js                 HUD 与各界面
  js/main.js               渲染器、状态机、计分、道具、相机、主循环

life-simulator/            人生模拟器（独立静态站点）

vendor/three.module.min.js Three.js r169（本地内置，各游戏共用，不依赖 CDN）

tools/serve.mjs            零依赖本地静态服务器
tools/gameplay-test.mjs    无头玩法测试 + 预言机机器人
tools/boot-test.mjs        jsdom 客户端启动测试
tools/portal-test.mjs      首页渲染 + 目录一致性测试
tools/portal-mock.mjs      首页版式离线渲染（resvg）
tools/preview-render.mjs   游戏场景离线渲染（Raycaster 软渲染）
tools/client-harness.mjs   在 jsdom 里启动真实客户端的公共代码
tools/png.mjs              极简 PNG 编码器
```

## NEON DASH 玩法

| 障碍 | 应对 |
| --- | --- |
| 青色矮栏 | **跳过**（↑ / 空格 / 上滑） |
| 金色横杆 | **滑铲**（↓ / 下滑） |
| 品红立柱 | **换道绕开**（← → / 左右滑动） |

金币叠连击最高 x8；三种道具：磁铁、护盾、加速（加速期间可直接撞碎障碍）。
键盘 `P` 暂停 · `R` 重开 · `M` 静音；手机可用滑动或屏幕四角按钮。

## 设计要点

- **世界滚动而非玩家前进**：玩家固定在 `z = 0`，所有物体朝 +Z 移动，
  碰撞判定因此变得平凡，也避免了长距离跑动的浮点精度漂移。
- **按车道判定 + 扫掠式碰撞**：障碍占据整条车道；障碍每帧移动 `speed * dt`，
  高速下单帧位移可能超过障碍厚度，所以判定用的是「这一帧是否扫过碰撞窗口」。
- **跳跃容错**：0.12s 输入缓冲 + 0.09s 土狼时间；上升与下降用不同重力，
  同样的最高点但手感更利落。
- **零素材**：所有贴图 Canvas 运行时生成，所有音效与 BGM 用 Web Audio 合成。
- **自适应画质**：连续 90 帧平均帧时间超过 26ms 时自动把 devicePixelRatio 降到 1。

## 部署

纯静态，`vercel.json` 已配好。连上 GitHub 仓库后，推送到 `main` 即自动部署。

## License

MIT
