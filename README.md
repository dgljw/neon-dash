# NEON DASH · 霓虹疾走

一个纯 Web 的 **3D 霓虹无尽跑酷**。三车道、跳跃、滑铲、磁铁、护盾、加速，
全部用 Three.js 手写，**零外部素材**——所有贴图、音效都是运行时程序化生成的。

支持手机触屏（滑动 + 屏幕按钮）与桌面键盘，直接打开网页就能玩，无需安装。

![genre](https://img.shields.io/badge/genre-3D%20endless%20runner-27f4ff)
![stack](https://img.shields.io/badge/stack-Three.js%20r169-ff2fd0)
![deps](https://img.shields.io/badge/runtime%20deps-0-4dffa1)

---

## 玩法

| 障碍 | 应对 |
| --- | --- |
| 青色矮栏 | **跳过**（↑ / 空格 / 上滑） |
| 金色横杆 | **滑铲**（↓ / 下滑） |
| 品红立柱 | **换道绕开**（← → / 左右滑动） |

- 收集金币累积连击，连击越高得分倍率越高（最高 x8）
- 三种道具：**磁铁**（吸金币 8 秒）、**护盾**（抵挡一次撞击）、**加速**（5 秒极速，可直接撞碎障碍）
- 速度随距离不断提升（16 → 54 m/s），障碍密度与图案复杂度同步上升
- 成绩存在浏览器 localStorage，刷新不丢

## 操作

**键盘**：`←` `→` / `A` `D` 换道 · `↑` / `空格` 跳跃 · `↓` 滑铲 · `P` 暂停 · `R` 重开 · `M` 静音

**触屏**：左右滑动换道 · 上滑或点击跳跃 · 下滑滑铲 · 也可用屏幕四角按钮

## 本地运行

需要一个静态服务器（ES Module 不能从 `file://` 加载）：

```bash
npm run dev          # 内置零依赖服务器 → http://127.0.0.1:5173
# 或
python3 -m http.server 5173
```

## 测试

仓库带一个**无头玩法测试**：用最小 DOM 垫片在 Node 里跑真实的
`World` / `Player` / `ParticleSystem`，再让一个"预言机机器人"按正确的
时机跳跃、滑铲、换道，验证关卡生成是**可通关的**，而不仅仅是"能跑起来"。

```bash
npm test
```

机器人只要撞一次就算失败——它跑满全程说明生成的赛道对人类也是公平的。
这个测试在开发中抓到了一个真实的设计缺陷：跳跃滞空 0.545 秒，但当障碍行
按固定**距离**排布时，高速下两行间隔只有 0.28–0.42 秒，连续两次跳跃在物理
上不可能完成。现在行距按**最小时间**（0.80 秒）计算，速度再快也留有反应余量。

## 结构

```
index.html            页面与所有 UI 层
css/style.css         霓虹风样式、HUD、响应式布局
js/config.js          全部手感/数值调参集中在此
js/utils.js           数学工具 + 程序化 Canvas 贴图
js/audio.js           Web Audio 合成器：音效 + synthwave 循环 BGM（无音频文件）
js/input.js           键盘 + 触屏滑动 + 屏幕按钮
js/particles.js       GPU 粒子池（单次 draw call，自定义 ShaderMaterial）
js/entities.js        障碍 / 金币 / 道具的几何与材质工厂 + 对象池
js/world.js           赛道、天空、侧景、速度线、行生成器与碰撞
js/player.js          悬浮机车外观、跳跃/滑铲物理、驾驶表现
js/ui.js              DOM 层：HUD、开始/暂停/结算界面
js/main.js            渲染器、状态机、计分、道具、相机、主循环
vendor/three.module.min.js   Three.js r169（本地内置，不依赖 CDN）
tools/serve.mjs       零依赖本地静态服务器
tools/gameplay-test.mjs      无头玩法测试 + 预言机机器人
```

## 设计要点

- **世界滚动而非玩家前进**：玩家永远在 `z = 0`，所有物体朝 +Z 移动。
  碰撞判定因此变得平凡，也彻底避免了长距离跑动时的浮点精度漂移。
- **按车道判定碰撞**：障碍占据整条车道，玩家用实际 x 位置映射到最近车道
  （`laneAt`）。子车道级的抖动永远不会导致"看起来没撞上却判定撞击"。
- **扫掠式碰撞**：障碍每帧移动 `speed * dt`，高速下单帧位移可能超过障碍厚度，
  因此判定用的是"这一帧是否扫过碰撞窗口"，而不是单点重叠。
- **自适应画质**：连续 90 帧平均帧时间超过 26ms 时自动把 devicePixelRatio 降到 1。

## 部署

纯静态站点，`vercel.json` 已配置好：

```bash
vercel --prod
```

或直接连 GitHub 仓库，Vercel 会自动识别为静态站点并部署。

## License

MIT
