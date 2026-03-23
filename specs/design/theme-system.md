# Design System -- 主题系统规格

> 本文档是设计系统的唯一真相源（Single Source of Truth）。
> 修改 CSS 变量、Tailwind 映射或新增主题前，必须先更新此文档。

## 1. 架构决策

### 为什么用 CSS Custom Properties + `data-theme` 而不是 Tailwind `dark:` modifier

| 维度 | CSS Variables 方案 | Tailwind dark: 方案 |
|------|-------------------|-------------------|
| CSS 体积 | 变量定义一次，工具类不重复 | 每个颜色类都会生成 `dark:` 变体 |
| 切换成本 | 修改 `html[data-theme]` 属性即可，零 JS 重渲染 | 需要切换 class/media query |
| 多主题扩展 | 新增 `[data-theme="xxx"]` 选择器即可 | 仅支持 light/dark 二选一 |
| 自定义主题 | 运行时可通过 JS 覆盖 CSS 变量 | 需要重新编译 Tailwind |

**结论**：选择 CSS Variables 方案，支持未来自定义主题和多主题扩展。

### 主题切换机制

```
用户操作 → Jotai atom (themePreferenceAtom) → useEffect → document.documentElement.dataset.theme = "light" | "dark"
                                                         ↓
                                              CSS 变量自动切换，组件无感知
```

- `themePreferenceAtom`：持久化到 `localStorage["codex-theme"]`，值为 `"light" | "dark" | "system"`
- `resolvedThemeAtom`：派生 atom，将 `"system"` 解析为实际的 `"light" | "dark"`
- `ThemeSync` 组件（`app.tsx`）：监听 resolved 值，同步到 DOM

## 2. 主题 JSON Schema

所有主题遵循以下 JSON 结构（源自 Codex theme v1 格式）：

```typescript
interface CodexTheme {
  codeThemeId: string;          // 代码高亮主题标识，如 "linear"
  theme: {
    accent: string;             // 主强调色（HEX）-- 按钮、链接、选中态
    contrast: number;           // 对比度系数（0-100）-- 控制 surface 层级分离程度
    fonts: {
      code: string | null;      // 代码字体，null 则用默认 monospace
      ui: string;               // UI 字体，如 "Inter"
    };
    ink: string;                // 前景色/文字色（HEX）
    opaqueWindows: boolean;     // 窗口是否不透明
    semanticColors: {
      diffAdded: string;        // diff 新增行颜色（HEX）
      diffRemoved: string;      // diff 删除行颜色（HEX）
      skill: string;            // 技能/能力标签颜色（HEX）
    };
    surface: string;            // 背景色/表面色（HEX）
  };
  variant: "light" | "dark";    // 主题变体标识
}
```

## 3. 当前已注册主题

### 3.1 Light（默认）

```json
{
  "codeThemeId": "linear",
  "theme": {
    "accent": "#5e6ad2",
    "contrast": 45,
    "fonts": { "code": null, "ui": "Inter" },
    "ink": "#1b1b1b",
    "opaqueWindows": true,
    "semanticColors": {
      "diffAdded": "#52a450",
      "diffRemoved": "#c94446",
      "skill": "#8160d8"
    },
    "surface": "#fcfcfd"
  },
  "variant": "light"
}
```

### 3.2 Dark

```json
{
  "codeThemeId": "linear",
  "theme": {
    "accent": "#606acc",
    "contrast": 60,
    "fonts": { "code": null, "ui": "Inter" },
    "ink": "#e3e4e6",
    "opaqueWindows": true,
    "semanticColors": {
      "diffAdded": "#69c967",
      "diffRemoved": "#ff7e78",
      "skill": "#c2a1ff"
    },
    "surface": "#0f0f11"
  },
  "variant": "dark"
}
```

## 4. CSS 变量清单

> 实现文件：`client/src/styles/tokens.css`
> Tailwind 映射：`client/tailwind.config.ts`

### 4.1 核心变量（直接从主题 JSON 提取）

| CSS 变量 | 来源字段 | Light 值 | Dark 值 | Tailwind 类 |
|----------|---------|----------|---------|-------------|
| `--color-accent` | `theme.accent` | `#5e6ad2` | `#606acc` | `bg-accent` / `text-accent` |
| `--color-ink` | `theme.ink` | `#1b1b1b` | `#e3e4e6` | `bg-ink` / `text-ink` |
| `--color-surface` | `theme.surface` | `#fcfcfd` | `#0f0f11` | `bg-surface` / `text-surface` |
| `--color-diff-added` | `theme.semanticColors.diffAdded` | `#52a450` | `#69c967` | `text-diff-added` |
| `--color-diff-removed` | `theme.semanticColors.diffRemoved` | `#c94446` | `#ff7e78` | `text-diff-removed` |
| `--color-skill` | `theme.semanticColors.skill` | `#8160d8` | `#c2a1ff` | `text-skill` |
| `--font-ui` | `theme.fonts.ui` | `"Inter", ...sans-serif` | 同左 | `font-ui` |
| `--font-code` | `theme.fonts.code` (fallback) | `"JetBrains Mono", ...monospace` | 同左 | `font-code` |

### 4.2 派生变量（基于核心值 + contrast 系数推算）

| CSS 变量 | 推导逻辑 | Light 值 | Dark 值 | Tailwind 类 |
|----------|---------|----------|---------|-------------|
| `--color-surface-raised` | surface 上浮一级（卡片、弹窗） | `#f5f5f7` | `#1a1a1f` | `bg-surface-raised` |
| `--color-surface-overlay` | surface 上浮二级（模态框、下拉） | `#ededf0` | `#222228` | `bg-surface-overlay` |
| `--color-surface-sunken` | surface 下沉（输入框、凹槽） | `#e8e8ec` | `#0a0a0c` | `bg-surface-sunken` |
| `--color-ink-muted` | ink 降低对比度（次要文字） | `#6b6f76` | `#8e9099` | `text-ink-muted` |
| `--color-ink-faint` | ink 大幅降低（占位符、禁用态） | `#9ea2a9` | `#5c5e66` | `text-ink-faint` |
| `--color-accent-hover` | accent 加深/加亮（hover 态） | `#4f5bc3` | `#7178db` | `bg-accent-hover` |
| `--color-accent-muted` | accent 低透明度（选中背景） | `rgba(..., 0.12)` | `rgba(..., 0.15)` | `bg-accent-muted` |
| `--color-accent-text` | accent 用于文字时的对比安全色 | `#4a54b8` | `#8b93e6` | `text-accent-text` |
| `--color-diff-added-bg` | diffAdded 低透明度背景 | `rgba(..., 0.1)` | `rgba(..., 0.1)` | `bg-diff-added-bg` |
| `--color-diff-removed-bg` | diffRemoved 低透明度背景 | `rgba(..., 0.1)` | `rgba(..., 0.1)` | `bg-diff-removed-bg` |
| `--color-border` | ink 极低透明度（分割线） | `rgba(ink, 0.1)` | `rgba(ink, 0.08)` | `border-border` |
| `--color-border-strong` | ink 低透明度（强调分割线） | `rgba(ink, 0.2)` | `rgba(ink, 0.16)` | `border-border-strong` |
| `--color-panel-handle` | 拖拽手柄默认色 | `rgba(ink, 0.08)` | `rgba(ink, 0.06)` | `bg-panel-handle` |
| `--color-panel-handle-hover` | 拖拽手柄 hover 色 | `rgba(ink, 0.16)` | `rgba(ink, 0.14)` | `bg-panel-handle-hover` |

### 4.3 contrast 系数说明

`contrast` 字段（当前 light=45, dark=60）控制 surface 层级之间的色差幅度。
当前的派生值是人工调校的，未来如果需要程序化生成，推荐公式：

```
surface-raised = mix(surface, ink, contrast * 0.03)
surface-overlay = mix(surface, ink, contrast * 0.06)
surface-sunken = mix(surface, ink 的反方向, contrast * 0.03)
```

## 5. 新增自定义主题指南（未来）

当用户需要自定义主题时，流程如下：

1. 提供符合第 2 节 JSON Schema 的主题数据
2. 从 JSON 中提取第 4.1 节的核心变量值
3. 根据 `contrast` 系数和 `variant` 推导第 4.2 节的派生变量
4. 在 `tokens.css` 中新增 `[data-theme="自定义名"]` 选择器块
5. 在 `themePreferenceAtom` 的类型中增加对应值

**无需修改任何组件代码** -- 这是 CSS 变量方案的核心优势。

## 6. 注意事项

- **CSS 变量不支持 Tailwind opacity modifier**：`bg-accent/50` 不会生效（因为变量是 HEX 不是 RGB）。需要透明度时，使用预定义的 `-muted` 变量。
- **字体加载**：Inter 和 JetBrains Mono 通过 Google Fonts CDN 在 `index.html` 中加载。如果主题 JSON 的 `fonts.code` 不为 null，需要额外加载对应字体。
- **过渡动画**：主题切换时，全局不做 `transition`，避免首次加载时的闪烁。组件级别可按需添加 `transition-colors`。
