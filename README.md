<div align="center">

# ImageVibe

### AI Image Generation Desktop App

<p>
  <img src="build/icon.svg" width="120" alt="ImageVibe Logo" />
</p>

<p>
  <strong>13 AI models</strong> &bull; <strong>Aurora dark UI</strong> &bull; <strong>Cost tracking</strong> &bull; <strong>Batch generation</strong>
</p>

<p>
  <a href="#features">Features</a> &bull;
  <a href="#models">Models</a> &bull;
  <a href="#installation">Installation</a> &bull;
  <a href="#usage">Usage</a> &bull;
  <a href="#shortcuts">Shortcuts</a> &bull;
  <a href="#tech-stack">Tech Stack</a>
</p>

</div>

---

## What is ImageVibe?

ImageVibe is a desktop application for AI image generation powered by [OpenRouter](https://openrouter.ai). Write a prompt in Russian or English, pick a model, and generate stunning images — all from a beautiful Aurora-themed interface.

**Key differentiators:**
- **Multi-model access** — 13 image models from 5 providers in one app
- **Cost intelligence** — real-time spending tracking, budget limits, per-model analytics
- **Progressive disclosure** — simple mode for beginners, advanced mode for power users
- **PNG metadata** — every image embeds its full generation parameters
- **Auto-translate** — write prompts in Russian, they're automatically translated to English

## Features

### Generation
- Text-to-image, image-to-image, inpainting, upscale modes
- 36 style tags across 4 categories (style, quality, lighting, mood)
- Negative prompt templates (6 built-in presets)
- AI prompt assistant: generate, enhance, rephrase prompts
- Live auto-translation RU → EN with preview
- Batch generation (x2 / x4 / x8 variations)
- Prompt history with undo/redo

### Gallery
- Image grid with search and filtering
- Sort by date, cost, or file size
- Filter by model, favorites
- Fullscreen viewer with metadata panel
- Arrow key navigation, keyboard shortcuts
- Collections for organizing images
- Auto-tagging with 27 extraction rules

### Cost Tracking
- Real-time spending counter in sidebar
- Budget limits (daily / weekly / monthly) with alerts
- Analytics dashboard with model breakdown charts
- Cost estimation before generation
- Tracks image generation + prompt AI + translation costs separately

### UI/UX
- Aurora dark theme with animated gradient blobs
- Glass morphism panels with backdrop blur
- Command Palette (Ctrl+K) with fuzzy search
- 8 built-in generation presets
- Progressive disclosure: simple / advanced mode toggle
- First-run onboarding with API key setup
- Toast notifications

## Models

| Category | Model | Provider | Best For |
|----------|-------|----------|----------|
| **Fast** | FLUX.2 Klein | Black Forest Labs | Quick drafts |
| | Riverflow V2 Fast | Sourceful | Fast with fonts |
| | Gemini 3.1 Flash | Google | Pro quality at flash speed |
| | Gemini 2.5 Flash | Google | Budget option |
| **Quality** | FLUX.2 Pro | Black Forest Labs | Production balance |
| | FLUX.2 Max | Black Forest Labs | Maximum quality |
| | FLUX.2 Flex | Black Forest Labs | Typography, multi-reference |
| | Seedream 4.5 | ByteDance | Portraits, fine text |
| | Riverflow V2 Pro | Sourceful | SOTA, fonts, super resolution |
| | Riverflow V2 Max | Sourceful | Preview max quality |
| **Smart** | Gemini 3 Pro | Google | 2K/4K, local edits |
| | GPT-5 Image | OpenAI | Reasoning + generation |
| | GPT-5 Image Mini | OpenAI | Fast smart generation |

## Installation

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- [OpenRouter API key](https://openrouter.ai/keys)

### Setup

```bash
# Clone
git clone https://github.com/Vento741/ImageVibe.git
cd ImageVibe

# Install dependencies
npm install

# Run in development mode
npm run dev
```

### Build

```bash
# Build for production
npm run build

# Build executable (.exe / .dmg / .AppImage)
npm run build:exe
```

## Usage

1. **First launch** — enter your OpenRouter API key in the onboarding dialog
2. **Write a prompt** — type in Russian or English (auto-translated)
3. **Choose a style** — click style tags or select a preset
4. **Generate** — press `Ctrl+Enter` or click the button
5. **Browse results** — view in Canvas, switch to 2x2 grid for variations

### Simple Mode (default)
Prompt + style tags + aspect ratio + generate button. That's it.

### Advanced Mode (Ctrl+Shift+M)
Full control: model selection, negative prompts, batch generation, presets, queue, img2img mode, seed control.

## Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Generate |
| `Ctrl+K` | Command Palette |
| `Ctrl+Shift+M` | Toggle simple/advanced mode |
| `Ctrl+G` | Go to Generation |
| `Ctrl+L` | Go to Gallery |
| `Ctrl+,` | Settings |
| `Ctrl+R` | Random seed |
| `Ctrl+D` | Duplicate generation |
| `?` | Show all shortcuts |
| `Esc` | Close viewer/palette |
| `←` `→` | Navigate gallery |
| `I` | Toggle image info |
| `F` | Toggle favorite |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Electron 41 |
| Frontend | React 19 + TypeScript 5.9 |
| Build | Vite 8 |
| Styles | Tailwind CSS v4 |
| Animations | Framer Motion |
| State | Zustand |
| Database | SQLite (better-sqlite3) |
| Search | Fuse.js |
| API | OpenRouter |
| Packaging | electron-builder |

## Project Structure

```
src/
  modules/
    generate/        # Image generation (10 components)
    gallery/         # Image grid, filters, viewer
    collections/     # User collections
    cost/            # Cost tracking widget
    queue/           # Generation queue
    compare/         # A/B slider, variations grid
    presets/         # Preset selector
    analytics/       # Spending dashboard
    settings/        # API keys, budget, preferences
    command-palette/ # Ctrl+K search
  shared/
    components/      # UI components (Aurora, Glass, Toast, Sidebar)
    lib/             # IPC bridge, utilities
    types/           # TypeScript type definitions
    hooks/           # Keyboard shortcuts
    stores/          # Toast store

electron/
  main.ts            # Electron main process
  preload.ts         # Context bridge
  services/          # Backend services (9 files)
  ipc/               # IPC handlers
```

## License

ISC
