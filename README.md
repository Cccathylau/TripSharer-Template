# TripSharer

🌏 [English](README.en.md)

旅游回来，总被问攻略？在Notion简单录入地点信息和心得分享，一键生成精美攻略地图网站，即刻分享。

[查看示例 →](https://au2026.cathylau.com/index.html)

## 功能

- **风格化城市地图**：有设计感的手绘风格地图，清晰展示你去过的每个地方
- **一条链接发出去**：手机即开，无需登录，国内直连
- **城市攻略**：具体攻略心得直接来自你的 Notion 页面
- **地点与路线**：点开查看评分、备注详情

## 适用 Agent

| 平台 | 状态 | 说明 |
|------|------|------|
| Claude Code | 支持 | Skill 开发中 |
| 其余能执行 shell 命令且可访问外部网络的本地 Agent | 支持 | 按本文档操作即可 |
| 普通 Chatbot | 不推荐 | 无法运行 npm 命令，难以完成部署 |

## 使用步骤

你需要亲自完成三件事，其余交给 Agent：

**1. 创建 Notion Integration**

前往 [notion.so/my-integrations](https://www.notion.so/my-integrations) 新建 Integration，拿到 Token。

**2. 复制 Notion 模板，按指引填写内容，并在每个页面右上角 Connections 中添加你的 Integration**

[→ 打开 Notion 模板](https://www.notion.so/cccathylau/TripSharer-Template-17a0c7ad070a82de8cbb01e252863fee)

填写完成后，记下以下页面的 ID（打开页面 → 复制链接 → 末尾 32 位字符串）：Places 数据库、总览页、各城市 Notes 页。

**3. 准备 API Key 并选择部署路径**

地理编码（地址自动转坐标）：
- 国际城市 → [Google Maps API Key](https://console.cloud.google.com/)（推荐）
- 中国大陆城市 → [高德 API Key](https://lbs.amap.com/)（必填）

部署路径：
- 需要国内稳定访问 → 腾讯云 COS（见下方「部署」一节，需提前完成配置）
- 海外或技术用户 → GitHub Pages（免费，零额外配置）

---

准备好以上信息后，Fork 仓库并告诉你的 Agent：

> 「帮我按 README 配置并部署 TripSharer，我的 Notion Token 是 xxx，页面 ID 是 xxx」

Agent 会读取本文档完成其余所有配置和部署。

<details>
<summary>没有 Agent？手动配置步骤</summary>

1. Fork 并 clone 仓库，`npm install && cp .env.example .env`，填入 Token 和 API Key
2. 编辑 `trips.config.js`，填入 Notion 各页面 ID 和城市信息
3. `npm run fetch my-trip-2026`（首次约 5–10 分钟）
4. `npm run build my-trip-2026`
5. 按下方「部署」一节完成发布

</details>

---

## 技术配置参考

### 环境变量

| 变量名 | 用途 | 必填 |
|--------|------|------|
| `NOTION_TOKEN` | Notion Integration Token | 是 |
| `GOOGLE_MAPS_KEY` | Google 地理编码，国际城市精度更高 | 推荐 |
| `GAODE_KEY` | 高德地图 API Key，中国大陆城市 | 国内城市必填 |
| `TENCENT_SECRET_ID` | 腾讯云 COS 上传凭证 | 仅 COS 部署需要 |
| `TENCENT_SECRET_KEY` | 腾讯云 COS 上传凭证 | 仅 COS 部署需要 |

### trips.config.js 配置

```js
"my-trip-2026": {
  databaseId: "",          // Notion Places 数据库 ID
  overviewPageId: "",      // 行程总览 Page ID
  cityPageIds: {           // 城市 key → 城市 Notes Page ID
    city1: "",
  },
  citySearchTerms: {       // 城市 key → 城市边界搜索词（用于抓取地图轮廓）
    city1: "City Name, Country",
  },
  cityColors: {            // 可选，城市主题色；未指定时自动从调色板分配
    city1: "#E85D4A",
  },
  cityUrbanBBox: {         // 可选，城区 bbox [南, 西, 北, 东]，限定路网抓取范围
    city1: [lat_s, lng_w, lat_n, lng_e],
  },
  cityZhNames: {           // 城市中文名，用于百度地图导航链接
    city1: "城市名",
  },
  region: "international", // "international" 或 "domestic"（中国大陆，使用高德地理编码）
  theme: { primary: "#E85D4A" },
  siteUrl: "https://your-username.github.io/TripSharer-Template",
}
```

**Notion ID 获取方式**：打开页面或数据库，URL 格式为 `notion.so/[workspace]/[32位ID]?v=...`，取 `?v=` 前的 32 位字符串（去掉连字符）。

### Notion 数据库结构

### Places Database

| 字段名 | 类型 | 说明 |
|--------|------|------|
| Name | Title | 地点名称 |
| City | Select | 城市 key，需与 `trips.config.js` 的城市 key 一致 |
| Category | Select | 分类（景点 / 餐厅 / 购物等） |
| Address | Rich Text | 地址，留空时自动地理编码 |
| Lat | Number | 纬度，留空时自动抓取 |
| Lng | Number | 经度，留空时自动抓取 |
| Rating | Number | 评分 0–5 |
| Description | Rich Text | 详细描述，显示在地图弹窗 |
| Short Note | Rich Text | 一行概括，显示在弹窗评分下方 |
| Day | Number | 所属天数（1/2/3…），用于路线视图分组 |
| Route Order | Number | 当天内顺序 |

### Overview Page 和城市 Notes Page

- **Overview Page**：出发前信息（SIM 卡、货币、打包清单等），支持段落、H1 标题、有序 / 无序列表
- **城市 Notes Page**：每个城市一个页面，交通 / 贴士 / 购物等内容，页面标题作为城市显示名
- **城市主题色**：在页面任意位置加一个含 🎨 emoji 的 Callout，填 hex 色值（`#E85D4A`）或颜色名（`coral`），fetch 时自动读取

### 部署

### GitHub Pages（默认）

1. 仓库 Settings → Pages → Source 选 **GitHub Actions**
2. Settings → Secrets → Actions 添加 `NOTION_TOKEN`（以及 `GOOGLE_MAPS_KEY` 或 `GAODE_KEY`）
3. 修改 `.github/workflows/deploy-gh-pages.yml` 中的 `my-trip-2026` 为你的行程 ID
4. Push → 自动构建部署，URL 格式为 `https://[username].github.io/[repo-name]`

### 腾讯云 COS（适合国内访问）

COS 香港节点国内直连，无需 ICP 备案。配置步骤见 [`docs/cos-setup.md`](docs/cos-setup.md)，完成后运行：

```bash
npm run deploy my-trip-2026
```

### 内容更新

- **改了代码**：push main → GitHub Actions 自动 fetch + build + 部署
- **只改了 Notion 内容**：仓库 Actions 页面 → Fetch Notion Data → Run workflow

### 常见问题

**地理编码失败**：检查 Notion 地址字段是否填写；中国大陆城市需设置 `GAODE_KEY`

**fetch 很慢**：首次抓取城市路网和水域数据需要 5–10 分钟；重跑会继续使用已缓存的部分

**GitHub Actions 失败**：确认 Secrets 已添加，并确认 Pages Source 已设为 GitHub Actions

**COS 跨域报错**：COS bucket 需配置 CORS，参考 `docs/cos-setup.md`
