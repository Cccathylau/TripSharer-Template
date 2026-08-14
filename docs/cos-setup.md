# 腾讯云 COS 香港部署指引

## 概览

TripSharer 使用腾讯云 COS 香港 bucket 托管静态文件，国内直连无需 ICP 备案。  
完成本指引后你会得到一个可访问的 URL（`https://xxx.cos.ap-hongkong.myqcloud.com`），把它填进 `trips.config.js` 的 `siteUrl` 字段，然后跑 `npm run deploy` 即可上线。

---

## 第一步：注册账号 + 实名认证

1. 打开 [cloud.tencent.com](https://cloud.tencent.com)，右上角「注册」，用**微信扫码**最方便
2. 登录后右上角头像 → **账号信息** → **基本信息** → 实名认证（选「个人认证」，上传身份证正反面）
3. 认证审核通常 1–5 分钟，认证成功后继续下一步

---

## 第二步：开通 COS 服务

1. 顶部菜单「产品」→ 搜索「对象存储 COS」→ 点击进入
2. 点击「**立即使用**」，同意服务协议，完成开通
3. 预期结果：左侧出现「存储桶列表」菜单

---

## 第三步：创建 Bucket

1. 左侧「存储桶列表」→ 「**创建存储桶**」
2. 填写参数：
   - **名称**：`tripsharer-au2026`（后面会自动拼接 APPID，完整名类似 `tripsharer-au2026-1312345678`）
   - **所属地域**：**香港**（`ap-hongkong`）
   - **访问权限**：**公有读私有写**
3. 其他选项保持默认，点击「**下一步**」→「**创建**」
4. 创建成功后点进 bucket，复制页面上的**访问域名**（格式：`tripsharer-au2026-1312345678.cos.ap-hongkong.myqcloud.com`）→ 这就是你的 `siteUrl`

---

## 第四步：配置 CORS（允许前端跨域请求 JSON）

1. 在 bucket 页面左侧「**安全管理**」→「**跨域访问 CORS**」
2. 点击「**添加规则**」，填写：
   - 来源 Origin：`*`
   - 操作 Methods：勾选 `GET`、`HEAD`
   - Allow-Headers：`*`
   - Expose-Headers：留空
   - Max Age：600
3. 保存

---

## 第五步：配置静态网站托管（SPA 支持）

1. 左侧「**基础配置**」→「**静态网站**」
2. 开启静态网站，填写：
   - 索引文档：`index.html`
   - 错误文档：`index.html`（重要：SPA 路由兜底，404 时也返回首页）
3. 保存
4. 页面会显示一个「静态网站域名」（格式类似 `tripsharer-au2026-xxx.cos-website.ap-hongkong.myqcloud.com`）

   > ⚠️ **注意**：cos-website 域名**不支持 HTTPS**，在微信/iOS 场景下会触发文件下载而非渲染。  
   > **对外分享请用直连域名 + `/index.html`**：  
   > `https://[bucket].cos.ap-hongkong.myqcloud.com/index.html`  
   > 静态网站托管配置仍有保留价值（未来绑定自定义域名时需要）。

---

## 第六步：配置流量上限（防超支）

1. 顶部「**控制台**」→「**用量告警**」→「**带宽封顶**」
2. 找到对应 bucket，设置：
   - 日下行带宽上限：**5 GB**（超过自动封断访问，防刷流量）
3. 保存

---

## 第七步：设置费用预警

1. 顶部右上角「费用」→「**预算与告警**」
2. 「**新建预算**」：
   - 预算类型：月度
   - 预算金额：**30 元**
   - 告警阈值：80%（即 24 元时告警）
   - 告警接收方式：短信（绑定手机号）
3. 可选：再建一个「每日费用 >5 元」的自定义告警（费用分析 → 每日告警）

---

## 第八步：创建子账号 + 生成 API 密钥

> **不要用主账号 root key 做 CI**。子账号只授 bucket 写权限，泄露风险可控。

1. 左上角「**访问管理 CAM**」（或搜索 CAM）→「**用户**」→「**新建用户**」
2. 选择「**编程访问**（API 密钥）」，填用户名如 `tripsharer-ci`
3. 权限策略：直接搜索并勾选 `QcloudCOSDataWriteOnly`（或手动建策略，只允许 `cos:PutObject` + `cos:DeleteObject` 对应 bucket）
4. 完成创建后，**立即复制 SecretId 和 SecretKey**（页面关闭后 Key 不再显示）

---

## 完成后操作

1. 把第三步拿到的 `siteUrl` 填进 `trips.config.js`：
   ```js
   siteUrl: "https://tripsharer-au2026-1312345678.cos.ap-hongkong.myqcloud.com",
   ```

2. 本地 `.env` 填入密钥（测试本地 deploy 用）：
   ```
   TENCENT_SECRET_ID=AKIDxxxxxxx
   TENCENT_SECRET_KEY=xxxxxxx
   ```

3. GitHub 仓库 Settings → Secrets and variables → Actions，添加：
   - `TENCENT_SECRET_ID`
   - `TENCENT_SECRET_KEY`
   - `NOTION_TOKEN`（抓 Notion 数据用）

4. 跑本地部署测试：
   ```bash
   npm run deploy
   ```
   控制台显示访问 URL 后，浏览器打开确认正常。

---

## 常见问题

| 问题 | 原因 | 解决 |
|---|---|---|
| 上传报 403 | SecretId/Key 无写权限 | 检查 CAM 子账号权限，确认包含 bucket 写权限 |
| 浏览器访问报 403 | bucket 不是公有读 | 存储桶权限 → 改为「公有读私有写」 |
| fetch data/*.json 报 CORS | CORS 规则未配置 | 按第四步添加 CORS 规则 |
| 切城市后地图不加载 | JSON 未上传或 CORS 有误 | Network 面板看 data/*.json 请求头，检查 Content-Encoding: gzip 是否正确 |
| 静态网站域名和访问域名不同 | 设计如此 | 分享用静态网站域名（支持 SPA），直接访问用访问域名均可 |
