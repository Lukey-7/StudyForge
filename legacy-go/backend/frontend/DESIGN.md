# StudyForge — Design System

> Source of truth for all frontend visual decisions.
> Read this file completely before writing ANY frontend code.

## Brand & Style

Dark glassmorphism aesthetic inspired by Linear.app — a high-focus academic productivity environment.
Frosted glass cards over a near-black background with violet accent and Inter typography.

**NO Three.js. NO starfield. NO particle animations.**

---

## Colour Tokens

### CSS Custom Properties

```css
:root {
  /* Backgrounds */
  --bg-primary: #09090B;
  --bg-secondary: rgba(24, 24, 27, 0.80);
  --bg-tertiary: rgba(39, 39, 42, 0.60);
  --bg-hover: rgba(255, 255, 255, 0.03);
  --bg-card: rgba(24, 24, 27, 0.80);

  /* Text */
  --text-primary: #FAFAFA;
  --text-secondary: #A1A1AA;
  --text-muted: #52525B;
  --text-light: #3F3F46;

  /* Accent */
  --accent-primary: #8B5CF6;
  --accent-secondary: #7C3AED;
  --accent-gradient: linear-gradient(135deg, #8B5CF6, #7C3AED);
  --accent-light: rgba(139, 92, 246, 0.12);
  --accent-glow: rgba(139, 92, 246, 0.20);

  /* Semantic */
  --accent-green: #34D399;
  --accent-red: #F87171;
  --accent-amber: #FBBF24;

  /* Borders */
  --border-color: rgba(255, 255, 255, 0.06);
  --border-hover: rgba(139, 92, 246, 0.30);
  --border-thin: 1px solid rgba(255, 255, 255, 0.06);

  /* Shadows */
  --shadow-glow: 0 0 24px rgba(139, 92, 246, 0.10);
}
```

### Body Background

```css
body {
  background-color: #09090B;
  background-image:
    radial-gradient(ellipse at top left, rgba(139, 92, 246, 0.12), transparent 50%),
    radial-gradient(ellipse at bottom right, rgba(96, 165, 250, 0.08), transparent 50%);
  background-attachment: fixed;
  background-repeat: no-repeat;
  color: #FAFAFA;
}
```

---

## Typography

| Role       | Font            | Size  | Weight | Line-Height | Letter-Spacing |
|-----------|-----------------|-------|--------|-------------|----------------|
| Display    | Inter           | 48px  | 700    | 1.1         | -0.02em        |
| H1         | Inter           | 32px  | 600    | 1.2         | -0.02em        |
| H2         | Inter           | 24px  | 600    | 1.3         | -0.01em        |
| H3         | Inter           | 18px  | 600    | 1.4         | 0              |
| Body LG    | Inter           | 16px  | 400    | 1.6         | 0              |
| Body MD    | Inter           | 14px  | 400    | 1.5         | 0              |
| Body SM    | Inter           | 12px  | 400    | 1.5         | 0              |
| Mono Label | JetBrains Mono  | 12px  | 500    | 1           | 0.05em         |

**Google Fonts import:**
```
Inter:wght@400;500;600;700
JetBrains+Mono:wght@400;500;600
```

---

## Component Specs

### Glass Card

```css
.glass-card {
  background: rgba(24, 24, 27, 0.80);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  transition: all 200ms ease;
}
.glass-card:hover {
  border-color: rgba(139, 92, 246, 0.30);
  box-shadow: 0 0 24px rgba(139, 92, 246, 0.10);
}
```

### Primary Button

```css
.btn-primary {
  background: linear-gradient(135deg, #8B5CF6, #7C3AED);
  color: #FAFAFA;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  transition: all 200ms ease;
}
.btn-primary:hover {
  filter: brightness(1.1);
}
```

### Secondary Button

```css
.btn-secondary {
  background: rgba(39, 39, 42, 0.80);
  color: #FAFAFA;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  transition: all 200ms ease;
}
.btn-secondary:hover {
  border-color: rgba(139, 92, 246, 0.40);
}
```

### Input

```css
.input {
  background: rgba(24, 24, 27, 0.60);
  color: #FAFAFA;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  transition: all 200ms ease;
}
.input:focus {
  border-color: #8B5CF6;
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.20);
}
```

### Sidebar

```css
.sidebar {
  background: rgba(9, 9, 11, 0.95);
  border-right: 1px solid rgba(255, 255, 255, 0.05);
  width: 240px;
}
```

---

## Spacing

| Token  | Value   |
|--------|---------|
| xs     | 4px     |
| sm     | 8px     |
| md     | 12px    |
| lg     | 16px    |
| xl     | 24px    |
| 2xl    | 32px    |

---

## Radii

| Element         | Radius |
|----------------|--------|
| Card           | 12px   |
| Button         | 8px    |
| Input          | 8px    |
| Small element  | 6px    |
| Pill/Badge     | 9999px |

---

## Elevation & Depth

- **Base layer**: `#09090B` background
- **Glass cards**: `backdrop-filter: blur(16px)` + 80% opaque zinc
- **Floating elements** (modals/tooltips): `blur(20px)` + lighter surface
- **All glass elements**: 1px solid border at 6% white opacity

---

## Stitch Project Reference

Stitch Project ID: `4870257180990223976`
Screens designed:
- **Dashboard** — stats cards, upload zone, recent activity
- **Documents** — grid of files with status badges
- **Document Detail** — extracted text + AI insights + mode tabs
- **Notebooks** — grid of notebook cards with stats
- **AI Chat** — sidebar conversations + main chat area

Navigation: Dashboard → Documents → Notebooks → AI Chat → Settings (sidebar)
