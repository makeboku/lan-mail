<div align="center">
  
# 🚀 秒邮（Myou Mail） | 永久匿名邮箱服务
  
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Built with Cloudflare Workers](https://img.shields.io/badge/Built%20with-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Hono](https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=white)](https://hono.dev/)

[简体中文](./README.md) | [English](./README.en.md)

  <p>如果这个项目对您有帮助，请考虑给它一个 ⭐️ Star ⭐️，这将是对我最大的鼓励！</p>

  <img src="frontend/public/favicon.svg" alt="秒邮 Logo" width="120" height="120" style="background-color: #4f46e5; padding: 20px; border-radius: 12px; margin: 20px 0;">

  <h3>💌 安全、简单、永久有效的匿名邮箱服务</h3>

  <p>
    <a href="#features"><strong>✨ 功能特点</strong></a> •
    <a href="#screenshots"><strong>📸 界面预览</strong></a> •
    <a href="#deployment"><strong>🚀 快速部署</strong></a> •
    <a href="#env-vars"><strong>🔧 环境变量</strong></a> •
    <a href="#development"><strong>💻 本地开发</strong></a> •
    <a href="#tech-stack"><strong>🔧 技术栈</strong></a> •
    <a href="#project-structure"><strong>📁 项目结构</strong></a>
  </p>

</div>
---

## 🚀 核心特性

- **一键部署 Worker** - 支持 `deploy.workers.cloudflare.com` 一键部署后端
- **统一域名管理** - 邮箱后缀由 Worker 环境变量 `ALLOWED_EMAIL_DOMAINS` 控制，前端动态获取
- **安全加固** - 收紧 CORS、仅接收已创建邮箱、HTML 邮件沙箱渲染
- **实时收信** - 基于 Cloudflare Email Routing，邮件秒收
- **多域名支持** - 可同时配置多个邮箱后缀
- **多账号切换** - 登录过的邮箱自动保存在本地，可一键切换
- **暗色/亮色主题** - 自适应主题切换
- **多语言支持** - 中英文切换
- **响应式设计** - 完美适配 PC、平板、手机
- **附件支持** - 支持查看、预览及下载邮件附件
---

## <a id="screenshots"></a>📸 界面预览

> 截图待补充

| 页面 | 说明 |
|------|------|
| 🏠 **首页** | 引导用户创建或登录邮箱，展示功能介绍、使用场景、FAQ |
| 📬 **收件箱** | 登录后显示邮件列表，支持查看邮件详情、附件 |
| 🔄 **多账号切换** | 顶部下拉菜单，在多个已保存邮箱间快速切换 |

---

## <a id="deployment"></a>🚀 快速部署

Myou-mail 现在采用全新的一体化部署方式，前端和后端整合为一个 Cloudflare Worker，部署更加简单！

### 🎯 部署方式选择

#### 方式一：一键部署（推荐新手）

<div align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/makeboku/myou" target="_blank">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" />
  </a>
</div>

<div style="background-color: #2d2d2d; color: #ffffff; padding: 15px; border-radius: 5px; margin: 15px 0;">
  <ul>
    <li>部署简单，一键完成</li>
    <li>无需修改配置文件</li>
    <li>适合快速体验</li>
  </ul>
  
  <h4>📋 部署步骤：</h4>
  <ol>
    <li>点击上方 "Deploy to Cloudflare" 按钮</li>
    <li>按照页面提示连接您的 GitHub 账户</li>
    <li>填写应用名称和数据库名称</li>
    <li>在高级设置 -> 环境变量中设置：

## 🔧 环境变量

| 变量名 | 填什么 | 示例或填在哪里 |
| --- | --- | --- |
| `VITE_EMAIL_DOMAIN` | 你的收信域名，多个用英文逗号分隔。必须与 Cloudflare Email Routing 中配置的域名一致 | `mail.example.com,example.org` |
| `MAIL_ENCRYPTION_KEY` | D1 敏感字段加密主密钥，至少 16 字符，建议 32 字符以上。**丢了已加密数据无法恢复** | 网页一键部署：部署页提示填写 |
| `MIGRATION_SECRET` | 历史数据加密迁移接口密钥，至少 16 字符。留空则 `/api/admin/encryption/*` 接口禁用 | 同上 |
| `VITE_EXTERNAL_LINKS` | 顶部「工具」外链，格式 `标签|URL`，多个用逗号分隔；不需要可留空 | `临时Gmail邮箱1|https://smailpro.com/temporary-email,临时Gmail邮箱2|https://temp.tf` |

    <li>点击"创建和部署"</li>
    <li>部署完成后，在 Cloudflare Workers 控制面板中绑定自定义域名</li>
    <li>配置 Cloudflare Email 路由，将邮件转发到您的 Worker</li>
  </ol>
</div>


### 📧 配置邮件路由

无论选择哪种部署方式，都需要配置 Cloudflare Email 路由：

<div style="background-color: #2d2d2d; color: #ffffff; padding: 15px; border-radius: 5px; margin: 15px 0;">
  <ol>
    <li>在 Cloudflare 控制面板中找到您的域名</li>
    <li>进入 "Email" -> "Email Routing"</li>
    <li>启用 Email Routing</li>
    <li>添加路由规则：
      <ul>
        <li>匹配类型："Catch-all address"</li>
        <li>操作："Send to a Worker"</li>
        <li>选择您部署的 Worker</li>
      </ul>
    </li>
    <li>如果有多个域名，请为每个域名重复上述步骤</li>
  </ol>
</div>


---
## 🔧 技术栈

### 🎨 前端
- **React 18** - 用户界面库
- **TypeScript** - 类型安全的 JavaScript 超集
- **Tailwind CSS** - 实用优先的 CSS 框架
- **Vite** - 现代前端构建工具
- **React Router v6** - 前端路由
- **i18next** - 国际化解决方案
- **Font Awesome** - 图标库

### ⚙️ 后端
- **Cloudflare Workers** - 边缘计算平台
- **Hono** - 轻量级 Web 框架
- **Cloudflare D1** - 边缘 SQL 数据库（SQLite）
- **Cloudflare Email Workers** - 邮件处理服务



## <a id="project-structure"></a>📁 项目结构

```
Miaoyou/
├── frontend/                    # 前端 React 应用
│   ├── i18n/locales/            # 国际化翻译文件
│   │   ├── zh-CN.json           #   中文翻译
│   │   └── en.json              #   英文翻译
│   ├── public/                  # 静态资源
│   └── src/
│       ├── components/          # 通用组件
│       │   ├── Header.tsx       #   页面顶部导航栏
│       │   ├── HeaderMailbox.tsx #   邮箱操作栏（复制、切换、注销）
│       │   ├── MailboxSwitcher.tsx #   多账号切换下拉菜单
│       │   ├── CreateLoginDialog.tsx #   创建/登录弹窗
│       │   ├── EmailList.tsx    #   邮件列表
│       │   ├── EmailDetail.tsx  #   邮件详情
│       │   ├── Layout.tsx       #   页面布局
│       │   └── ...
│       ├── contexts/
│       │   └── MailboxContext.tsx #   全局邮箱状态管理
│       ├── pages/
│       │   ├── HomePage.tsx     #   首页
│       │   ├── MailboxPage.tsx  #   邮箱详情页
│       │   └── ...
│       ├── utils/
│       │   ├── api.ts           #   后端 API 调用封装
│       │   └── helpers.ts       #   工具函数（生成地址/密码）
│       ├── config.ts            #   前端配置
│       ├── types.d.ts           #   TypeScript 类型定义
│       └── App.tsx              #   应用入口
├── worker/                      # 后端 Cloudflare Worker
│   └── src/
│       ├── index.ts             #   Worker 入口
│       ├── routes.ts            #   API 路由处理
│       ├── database.ts          #   D1 数据库操作
│       ├── email-handler.ts     #   邮件接收处理
│       ├── types.ts             #   类型定义
│       └── utils.ts             #   工具函数
├── wrangler.toml                # Cloudflare Worker 配置
├── package.json                 # 项目根配置
└── README.md                    # 项目说明
```

## 🔑 核心功能详解

### 邮箱创建
- **随机创建**：系统自动生成12位随机用户名和30+位高强度密码
- **自定义创建**：用户可自定义用户名和密码
- **多域名支持**：支持配置多个邮箱域名供用户选择

### 邮箱登录
- 通过完整邮箱地址和密码登录
- 登录信息保存到浏览器 localStorage，下次自动恢复会话

### 多账号管理（v2 新增）
- 所有登录过的邮箱自动保存在浏览器本地
- 顶部导航栏显示切换按钮（至少2个账号时出现）
- 下拉列表展示所有已保存账号，当前账号高亮显示
- 支持单个删除或一键清空所有已保存账号（保留当前账号）

### 邮件功能
- 实时接收邮件（自动刷新每10秒）
- 查看邮件详情（发件人、主题、正文、附件）
- 邮件缓存机制，减少重复请求
- 24小时后自动清理邮件

---

## 👥 贡献指南

欢迎提交Pull Request或Issue来改进这个项目！

## 📄 许可证

[MIT License](./LICENSE)
