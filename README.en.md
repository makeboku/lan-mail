# <div align="center">🚀 Miaoyou - Permanent Anonymous Email Service</div>

<div align="center">
  <p>
    <strong>English</strong> | <a href="./README.md">中文</a>
  </p>

  <p>If you find this project helpful, please consider giving it a ⭐️ Star ⭐️. Your support is greatly appreciated!</p>

  <img src="frontend/public/favicon.svg" alt="Miaoyou Logo" width="120" height="120" style="background-color: #4f46e5; padding: 20px; border-radius: 12px; margin: 20px 0;">

  <h3>💌 Secure, Simple, Permanent Anonymous Email Service</h3>

  <p>
    <a href="#features"><strong>✨ Features</strong></a> •
    <a href="#screenshots"><strong>📸 Screenshots</strong></a> •
    <a href="#deployment"><strong>🚀 Deployment</strong></a> •
    <a href="#development"><strong>💻 Development</strong></a> •
    <a href="#tech-stack"><strong>🔧 Tech Stack</strong></a> •
    <a href="#project-structure"><strong>📁 Project Structure</strong></a>
  </p>

  <div style="display: flex; gap: 10px; justify-content: center; margin: 25px 0;">
    <a href="https://dash.cloudflare.com/" target="_blank">
      <img src="https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Cloudflare" />
    </a>
  </div>
</div>

---

## <a id="features"></a>✨ Features

<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 20px 0;">
  <div>
    <h4>✨ Instant Creation</h4>
    <p>Create a permanent anonymous mailbox with one click, no registration required</p>
  </div>
  <div>
    <h4>🔒 Privacy Protection</h4>
    <p>Protect your real email from spam and data leaks, completely anonymous</p>
  </div>
  <div>
    <h4>🔐 Password Login</h4>
    <p>Each mailbox has an independent high-strength password, recoverable across devices</p>
  </div>
  <div>
    <h4>🔄 Multi-Account Switching</h4>
    <p>Logged-in mailboxes are auto-saved, switch between them from the header dropdown</p>
  </div>
  <div>
    <h4>⚡ Real-time Reception</h4>
    <p>Receive emails in real-time with auto-refresh (10s interval)</p>
  </div>
  <div>
    <h4>🌐 Global Availability</h4>
    <p>Built on Cloudflare's global edge network for fast access worldwide</p>
  </div>
  <div>
    <h4>🌙 Dark Mode</h4>
    <p>Support dark/light theme toggle</p>
  </div>
  <div>
    <h4>🌍 Multi-language</h4>
    <p>Chinese and English UI supported</p>
  </div>
  <div>
    <h4>📱 Responsive Design</h4>
    <p>Perfect fit for all devices, from mobile to desktop</p>
  </div>
</div>

---

## <a id="screenshots"></a>📸 Screenshots

> Coming soon

| Page | Description |
|------|-------------|
| 🏠 **Home** | Landing page with create/login, features, FAQ |
| 📬 **Inbox** | Email list and detail view after login |
| 🔄 **Account Switcher** | Dropdown menu to switch between saved mailboxes |

---

## <a id="deployment"></a>🚀 Quick Deployment

Miaoyou now adopts a brand new integrated deployment approach, with frontend and backend integrated into a single Cloudflare Worker, making deployment even simpler!

### 🎯 Deployment

#### Option 1: One-Click Deployment (Recommended for Beginners)

> **Before you start**: the GitHub repository behind the button must already contain the code in `修改后的代码/`.
> If it still contains the old code, push this directory first; otherwise the deployed Worker will not include D1 encryption.
> See `网页一键部署说明.md` in the project root for details.

<div align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/makeboku/myou" target="_blank">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" />
  </a>
</div>

<div style="background-color: #2d2d2d; color: #ffffff; padding: 15px; border-radius: 5px; margin: 15px 0;">
  <h4>✅ Advantages:</h4>
  <ul>
    <li>Simple deployment, one-click completion</li>
    <li>No need to modify configuration files</li>
    <li>Perfect for quick testing</li>
  </ul>

  <h4>📋 Deployment Steps:</h4>
  <ol>
    <li>Click the "Deploy to Cloudflare" button above</li>
    <li>Follow the page instructions to connect your GitHub account</li>
    <li>Fill in the Worker name and D1 database name</li>
    <li>In Advanced Settings -> Environment Variables, set:
      <ul>
        <li><code>VITE_EMAIL_DOMAIN</code>: Your domain list, separated by ',' (e.g., example.com,another.com)</li>
      </ul>
    </li>
    <li>Fill in <code>MAIL_ENCRYPTION_KEY</code> and <code>MIGRATION_SECRET</code> when prompted; generate them with <code>openssl rand -base64 32</code></li>
    <li>Click "Create and Deploy"</li>
    <li>After deployment, bind a custom domain in the Cloudflare Workers dashboard</li>
    <li>Configure Cloudflare Email Routing to forward emails to your Worker</li>
  </ol>
</div>

#### Option 2: Local CLI Deployment

```bash
cd 修改后的代码
pnpm install
pnpm exec wrangler login
pnpm run deploy:all
```

This is equivalent to the one-click button but works with private repositories. See `加密部署说明.md` for details.

### 📧 Configure Email Routing

Regardless of which deployment method you choose, you need to configure Cloudflare Email routing:

<div style="background-color: #2d2d2d; color: #ffffff; padding: 15px; border-radius: 5px; margin: 15px 0;">
  <ol>
    <li>Find your domain in the Cloudflare dashboard</li>
    <li>Go to "Email" -> "Email Routing"</li>
    <li>Enable Email Routing</li>
    <li>Add routing rules:
      <ul>
        <li>Match type: "Catch-all address"</li>
        <li>Action: "Send to a Worker"</li>
        <li>Select your deployed Worker</li>
      </ul>
    </li>
    <li>If you have multiple domains, repeat the above steps for each domain</li>
  </ol>
</div>

---

## <a id="env-vars"></a>🔧 Environment Variables

The Worker reads variables via `c.env` and exposes them to the frontend through `/api/config`. Configure them in:

- `[vars]` in `wrangler.toml`, or
- Cloudflare Dashboard → Workers & Pages → your Worker → Settings → Variables and Secrets.

> `VITE_*` only acts as a frontend build-time fallback. In the integrated deployment, the runtime `/api/config` response is authoritative.

### VITE_EMAIL_DOMAIN (Email Domains, required)

Format: `domain1.com,domain2.com,domain3.com`

```toml
[vars]
VITE_EMAIL_DOMAIN = "example.com,another.com"
```

Must match the domains configured in Cloudflare Email Routing.

### VITE_EXTERNAL_LINKS (Custom Tool Links in Navbar, optional)

Format: `label|URL,label|URL`

```toml
VITE_EXTERNAL_LINKS = "Temp Mail|https://temp-mail.org,IP Lookup|https://ip.sb"
```

Leave empty or remove the entry if you do not need it.

### MAIL_ENCRYPTION_KEY / MIGRATION_SECRET (Secrets)

Do not put these in `wrangler.toml`; inject them as Secrets:

```bash
wrangler secret put MAIL_ENCRYPTION_KEY   # at least 16 characters
wrangler secret put MIGRATION_SECRET      # migration admin endpoint secret
```

Generate with `openssl rand -base64 32`. Without `MAIL_ENCRYPTION_KEY`, sensitive fields are stored as plaintext.

---

## <a id="development"></a>💻 Local Development

### Prerequisites

- **Node.js** >= 18
- **pnpm** >= 8 (install via `npm install -g pnpm`)
- **Cloudflare account** (for backend development and deployment)

### Environment Variables

Create `.env` in `frontend/` (see `.env.example`):

```bash
# Email domains (comma-separated for multiple)
VITE_EMAIL_DOMAIN=example.com,abc.com,def.com

# API base URL (use /api for local proxy)
VITE_API_BASE_URL=/api
```

### 🚀 Start Development

```bash
# 1. Install all dependencies
pnpm install

# 2. Start frontend dev server (port 5173)
pnpm dev:frontend

# 3. Start backend dev server (port 8787, requires wrangler)
pnpm dev:backend

# /api requests are auto-proxied to the backend
```

### Build Frontend

```bash
# Production build
pnpm run build

# Preview build
pnpm run preview
```

### ⚙️ Deploy to Cloudflare

```bash
# Deploy Worker (requires wrangler.toml config)
pnpm run deploy
```

### URLs

| Environment | URL |
|-------------|-----|
| Local Dev   | http://localhost:5173 |
| API Proxy   | /api (via Vite proxy) |

> **Note**: Email receiving requires Cloudflare Email Routing and only works in production.

---

## <a id="tech-stack"></a>🔧 Tech Stack

<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin: 20px 0;">
  <div>
    <h3>🎨 Frontend</h3>
    <ul>
      <li><strong>React 18</strong> - UI library</li>
      <li><strong>TypeScript</strong> - Type-safe JavaScript</li>
      <li><strong>Tailwind CSS</strong> - Utility-first CSS framework</li>
      <li><strong>Vite</strong> - Modern frontend build tool</li>
      <li><strong>React Router v6</strong> - Client-side routing</li>
      <li><strong>i18next</strong> - Internationalization</li>
      <li><strong>Font Awesome</strong> - Icon library</li>
    </ul>
  </div>
  <div>
    <h3>⚙️ Backend</h3>
    <ul>
      <li><strong>Cloudflare Workers</strong> - Edge computing platform</li>
      <li><strong>Hono</strong> - Lightweight web framework</li>
      <li><strong>Cloudflare D1</strong> - Edge SQL database (SQLite)</li>
      <li><strong>Cloudflare Email Workers</strong> - Email processing</li>
    </ul>
  </div>
</div>

## <a id="project-structure"></a>📁 Project Structure

```
Miaoyou/
├── frontend/                    # React frontend
│   ├── i18n/locales/            # Translation files
│   │   ├── zh-CN.json           #   Chinese
│   │   └── en.json              #   English
│   ├── public/                  # Static assets
│   └── src/
│       ├── components/          # UI components
│       │   ├── Header.tsx       #   Navigation bar
│       │   ├── HeaderMailbox.tsx #   Mailbox actions (copy, switch, logout)
│       │   ├── MailboxSwitcher.tsx #   Account switcher dropdown
│       │   ├── CreateLoginDialog.tsx #   Create/Login dialog
│       │   ├── EmailList.tsx    #   Email list
│       │   ├── EmailDetail.tsx  #   Email detail view
│       │   ├── Layout.tsx       #   Page layout
│       │   └── ...
│       ├── contexts/
│       │   └── MailboxContext.tsx #   Global mailbox state
│       ├── pages/
│       │   ├── HomePage.tsx     #   Home page
│       │   ├── MailboxPage.tsx  #   Mailbox detail page
│       │   └── ...
│       ├── utils/
│       │   ├── api.ts           #   API client
│       │   └── helpers.ts       #   Utility functions
│       ├── config.ts            #   App config
│       ├── types.d.ts           #   TypeScript types
│       └── App.tsx              #   App entry
├── worker/                      # Cloudflare Worker backend
│   └── src/
│       ├── index.ts             #   Worker entry
│       ├── routes.ts            #   API routes
│       ├── database.ts          #   D1 database operations
│       ├── email-handler.ts     #   Email processing
│       ├── types.ts             #   Type definitions
│       └── utils.ts             #   Utilities
├── wrangler.toml                # Cloudflare config
├── package.json                 # Root package config
└── README.md                    # Documentation
```

## 🔑 Core Features

### Mailbox Creation
- **Random generation**: 12-char random username + 30+ char strong password
- **Custom creation**: Custom username and password
- **Multi-domain**: Multiple email domains for user selection

### Mailbox Login
- Login with full email address and password
- Credentials saved to localStorage, auto-restored on return

### Multi-Account Management (v2)
- All logged-in mailboxes auto-saved in browser
- Switcher button appears in header when 2+ accounts detected
- Dropdown shows all accounts, current one highlighted
- Delete individual saved accounts or clear all (keeps current)

### Email Features
- Real-time email reception (auto-refresh every 10s)
- Email detail view (sender, subject, content, attachments)
- Email caching to reduce redundant API calls
- Automatic email cleanup after 24 hours

---

## 👥 Contributing

Contributions via Pull Requests or Issues are welcome!

## 📄 License

[MIT License](./LICENSE)
