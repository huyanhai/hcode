# @hcode/web-annotation

网页批注子包。`@hcode/web-annotation` 提供批注数据、URL 规范化和发送文本格式；`@hcode/web-annotation/page-agent` 提供可序列化注入 Electron `<webview>` 的元素选择、样式预览和批注卡片脚本。

## 当前流程

1. 客户端网页组件管理地址导航、浏览历史和当前 `<webview>`。
2. 页面脚本选取元素，记录选择器、文本、矩形区域和计算样式，并在网页内显示批注卡片。
3. 用户输入批注或编辑样式；样式会在网页中预览，取消时恢复原值。
4. 确认时，卡片移除后组件调用 `<webview>.capturePage()` 截取当前可见视口。
5. 客户端把截图作为图片附件上传，并将批注与定位数据发送到当前会话。

Electron 默认 session 拒绝网页权限请求。页面文字作为不可信定位数据发送。当前支持主文档和开放的 Shadow DOM；跨域 iframe 内的元素选取尚未支持。截图仅覆盖当前可见视口，不生成整页长图。
