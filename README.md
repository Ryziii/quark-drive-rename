# 夸克网盘智能重命名

夸克网盘批量重命名工具，基于 AI 提取剧名 + TMDB 匹配剧集信息，将混乱的文件名自动整理为规范格式。同时支持单文件夹一键 AI 重命名。

- 🤖 AI 识别剧名 → 🎯 TMDB 匹配剧集 → 📂 Jellyfin / Emby / Plex 标准格式
- ⚡ 单文件一键 AI 重命名，即出按钮点击识别，只需确认修改。
- 🎨 TMDB 自动 / 手动剧集名 / 正则替换，三种模式随心切换
- 💾 AI + TMDB 双缓存，省额提效

## 演示

### 批量重命名

<video src="https://raw.githubusercontent.com/Ryziii/quark-drive-rename/main/screenshots/sample.mp4" controls width="100%"></video>

### 单文件 AI 重命名

<video src="https://raw.githubusercontent.com/Ryziii/quark-drive-rename/main/screenshots/Single_sample.mp4" controls width="100%"></video>

## 功能

### 批量重命名

1. 在夸克网盘目录下点击工具栏「重命名」按钮，弹出主界面
2. 自动读取当前目录下所有视频文件，AI 自动识别剧名并搜索 TMDB
3. 自动匹配剧集，选择季数后显示全部集数及其标题
4. 点击「使用 TMDB 文件名」或手动使用剧集名/正则生成新文件名
5. 左侧文件列表实时预览目标文件名，确认后点击「开始重命名」

> 批量重命名支持三种方式：TMDB 自动匹配、手动输入剧集名生成、正则替换。

### 单文件夹 AI 重命名

1. 鼠标移到文件夹行，hover 操作栏出现金色 ✦ AI 按钮
2. 点击按钮弹出重命名弹窗，自动调用 AI 识别并搜索 TMDB
3. 搜索结果自动选中第一条，目标文件名自动填入 `剧名 (年份)`
4. 确认无误后点击「应用修改」即可

> 适用于影视剧根目录下的剧集文件夹整理，或季文件夹命名的规范化。

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 前往 [GreasyFork](https://greasyfork.org/zh-CN/scripts/577125-夸克网盘智能重命名) 安装本脚本
3. 在 Tampermonkey 菜单中配置 **TMDB API Key**（在 [TMDB 设置页](https://www.themoviedb.org/settings/api) 免费申请）
4. （可选）在 Tampermonkey 菜单中配置 **AI 接口**，支持 OpenAI 兼容 API（如 OpenRouter 等）

## 缓存机制

脚本对 AI 识别结果和 TMDB API 响应均做了本地缓存：

- **AI 缓存**：以面包屑路径为 key，缓存 AI 提取的剧名和季数，相同目录无需重复调用 AI
- **TMDB 缓存**：搜索结果、剧集详情、季集列表均以 search/tv/season key 缓存，减少 API 调用
- 缓存持久化到 `GM_setValue`，跨页面刷新保留
- 点击「重置缓存」或手动搜索可清除对应缓存重新请求

## 技术栈

- TMDB API：搜索剧集、获取季集信息
- OpenAI 兼容 API：智能提取剧名与季数
- 纯 JavaScript 用户脚本，无框架依赖

## 致谢

本项目参考并重写了 [a1mersnow/drive-rename](https://github.com/a1mersnow/drive-rename) 的设计思路，感谢原作者的开源贡献。

## 许可

[MIT License](LICENSE)
