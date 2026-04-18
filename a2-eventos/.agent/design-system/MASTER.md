# A2 Eventos - Design System

**Source of Truth para UI/UX do projeto**
Baseado em: `frontend-design` + `ui-ux-pro-max` skills

---

## 1. Project Overview

- **Nome**: A2 Eventos (SaaS de Gestão de Eventos)
- **Tipo**: Admin Panel / Dashboard B2B
- **Stack**: React + MUI + Recharts
- **Target**: Administradores de eventos, operadores de check-in
- **Plataformas**: Desktop (primário), Tablet, Mobile

---

## 2. Visual Direction

### Direction Choice
**Industrial Tech** - Visual tecnológico profissional, não "generic AI"

### Rationale
- Produto de controle de acesso precisa parecer confiável e preciso
- Usuários são profissionais que usam o sistema por horas
- Contraste alto = legibilidade em ambientes de evento (luz intensa)
- Identidade visual forte = diferenciação de competidories genéricos

### Anti-Patterns to Avoid
- ❌ Purple gradient on white (cliché fintech)
- ❌ Generic card piles without hierarchy
- ❌ Random accent colors without system
- ❌ Placeholder-feeling typography
- ❌ Motion that exists only because animation was easy

---

## 3. Design Tokens

### 3.1 Color Palette

```css
/* Primary - Cyan Tech */
--color-primary: #00D4FF;
--color-primary-light: #66E5FF;
--color-primary-dark: #0099BB;

/* Secondary - Purple Accent */
--color-secondary: #7B2FBE;
--color-secondary-light: #A855F7;
--color-secondary-dark: #5B1F8E;

/* Semantic Colors */
--color-success: #00FF88;
--color-warning: #FFB800;
--color-error: #FF3366;
--color-info: #00D4FF;

/* Backgrounds */
--bg-default: #050B18;
--bg-paper: #0A1628;
--bg-elevated: #0F1E37;

/* Text */
--text-primary: #E8F4FD;
--text-secondary: #7BA7C4;
--text-muted: #4A5A6E;

/* Borders */
--border-subtle: rgba(0, 212, 255, 0.1);
--border-default: rgba(0, 212, 255, 0.2);
--border-strong: rgba(0, 212, 255, 0.3);
```

### 3.2 Typography

```css
/* Font Stack */
--font-display: 'Orbitron', sans-serif;  /* Stats/numbers */
--font-heading: 'Space Grotesk', 'Inter', sans-serif;
--font-body: 'Inter', 'Roboto', sans-serif;

/* Scale */
--text-xs: 0.75rem;    /* 12px - labels */
--text-sm: 0.875rem;   /* 14px - captions */
--text-base: 1rem;     /* 16px - body */
--text-lg: 1.125rem;   /* 18px - subtitle */
--text-xl: 1.25rem;   /* 20px - title */
--text-2xl: 1.5rem;  /* 24px - h4 */
--text-3xl: 1.75rem;   /* 28px - h3 */
--text-4xl: 2rem;      /* 32px - h2 */
--text-5xl: 2.5rem;   /* 40px - h1 */

/* Weights */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
--font-black: 900;

/* Line Heights */
--leading-tight: 1.25;
--leading-normal: 1.5;
--leading-relaxed: 1.75;
```

### 3.3 Spacing

```css
/* 8dp System */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;

/* Component Spacing */
--card-padding: 24px;
--section-gap: 32px;
--page-margin: 32px;
```

### 3.4 Effects

```css
/* Shadows */
--shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.3);
--shadow-md: 0 4px 20px rgba(0, 0, 0, 0.4);
--shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.5);
--shadow-glow-cyan: 0 0 20px rgba(0, 212, 255, 0.3);
--shadow-glow-purple: 0 0 20px rgba(123, 47, 190, 0.3);

/* Borders */
--radius-sm: 8px;
--radius-md: 10px;
--radius-lg: 12px;
--radius-xl: 16px;

/* Transitions */
--transition-fast: 150ms ease;
--transition-normal: 300ms ease;
--transition-slow: 500ms ease;
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

---

## 4. Component Standards

### 4.1 Buttons

| Type | Background | Border | Text | Use Case |
|------|------------|--------|------|---------|
| Primary | gradient(#00D4FF, #0099BB) | none | #000 | CTAs principais |
| Secondary | gradient(#7B2FBE, #5B1F8E) | none | #FFF | Ações alternativas |
| Outlined | transparent | 1px #00D4FF40 | #00D4FF | Secondary actions |
| Ghost | transparent | none | #E8F4FD | Tertiary/actions |
| Danger | #FF3366 | none | #FFF | Destructive |

**Rules:**
- Min-height: 44px (touch target)
- Border-radius: 10px
- Padding: 10px 24px
- Font-weight: 600

### 4.2 Cards (GlassCard)

**Current (keep):**
- Background: linear-gradient with backdropFilter: blur(20px)
- Border: 1px solid rgba(0, 212, 255, 0.12)
- Border-radius: 16px
- Hover: translateY(-2px) + glow increase

**Improvements needed:**
- Add reduced-motion support
- Add focus-visible styles
- Content jumping prevention (reserve space)

### 4.3 Tables (DataTable)

**Requirements:**
- Sticky header
- Row hover highlight
- Alternating row backgrounds (subtle)
- Min row height: 52px
- Horizontal scroll if needed (not vertical overflow)
- Virtualization for 50+ rows

### 4.4 Forms

**Requirements:**
- Labels visible (not placeholder-only)
- Error messages below field
- Helper text persistent
- Input height: 48px minimum
- Border-radius: 10px

---

## 5. Layout Standards

### 5.1 Breakpoints

```css
--breakpoint-sm: 640px;
--breakpoint-md: 768px;
--breakpoint-lg: 1024px;
--breakpoint-xl: 1280px;
--breakpoint-2xl: 1536px;
```

### 5.2 Container Widths

- **Max content**: 1280px (no edge-to-edge)
- **Sidebar**: 280px fixed
- **Cards**: Fluid with max-width logic

### 5.3 Safe Areas

- **Top**: respect notch/status bar
- **Bottom**: avoid gesture area
- **Scroll**: add padding so content not hidden behind fixed bars

---

## 6. Animation Standards

### 6.1 Duration Tokens

```css
--duration-instant: 0ms;        /* Avoid - causes jank */
--duration-fast: 150ms;         /* Micro-interactions */
--duration-normal: 300ms;       /* Standard transitions */
--duration-slow: 500ms;        /* Complex transitions */
--duration-page: 400ms;        /* Page-level */
```

### 6.2 Easing

```css
--ease-in: cubic-bezier(0.4, 0, 1, 1);      /* Entering */
--ease-out: cubic-bezier(0.16, 1, 0.3, 1); /* Exiting */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

### 6.3 Motion Rules

- ✅ Use transform/opacity only (not width/height/top/left)
- ✅ Exit animations shorter than enter (~60%)
- ✅ One well-directed load sequence > scattered hover effects
- ✅ Respect prefers-reduced-motion
- ✅ Animate 1-2 key elements max per view
- ❌ Animate decorative-only elements

---

## 7. Accessibility Requirements

### Critical (Must Have)

- [ ] Color contrast ≥ 4.5:1 (primary text)
- [ ] Focus states visible (2-4px ring)
- [ ] Touch targets ≥ 44×44px
- [ ] All interactive elements keyboard accessible
- [ ] Reduced motion support

### High Priority

- [ ] Form labels visible (not placeholder-only)
- [ ] Error messages near field
- [ ] Empty states with guidance
- [ ] Loading indicators after 300ms

### Medium

- [ ] Skip to main content link
- [ ] Heading hierarchy (h1→h6, no skip)
- [ ] Color not only indicator (add icon/text)

---

## 8. Quality Gates

Before delivering any UI code, verify:

1. **Visual Direction**: Does it have a clear point of view?
2. **Typography**: Intentional hierarchy, not generic defaults?
3. **Color**: Supports product, not decorative?
4. **Motion**: Meaningful, not random?
5. **Accessibility**: Meets WCAG AA?
6. **Responsiveness**: Works on 375px and desktop?
7. **Professional**: Doesn't look "AI-generated"?

---

## 9. File Structure

```
frontend/web-admin/src/
├���─ styles/
│   └── theme.js              ← MUI theme (source of truth)
├── components/
│   └── common/
│       ├── GlassCard.jsx    ← Core card
│       ├── DataTable.jsx    ← Table component
│       ├── NeonButton.jsx  ← Button variants
│       └── ...
└── pages/
    └── ...
```

Updates should flow through `theme.js` as the single source of truth.

---

## 10. Current Issues Identified

### High Priority

- ❌ Animation without reduced-motion check
- ❌ No keyboard focus indicators on some components
- ❌ Touch targets may be too small on mobile
- ❌ Some hover-only interactions (no tap alternative)

### Medium Priority

- ⚠️ Table virtualization not implemented
- ⚠️ No skeleton loaders (blocking spinners only)
- ⚠️ Some hardcoded colors outside design tokens

### Low Priority

- Some text sizes may be too small on mobile

---

**Last Updated**: 2026-04-15
**Based On**: frontend-design skill + UI code analysis