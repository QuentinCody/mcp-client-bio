# Tool Invocation & Code Execution UI Redesign

## Overview

This redesign transforms the tool calling and code execution UI with a **"Laboratory Precision"** aesthetic - inspired by scientific instruments, oscilloscopes, and premium developer tools. The design emphasizes clarity, scannability, and refined visual feedback while maintaining simplicity.

## Design Philosophy

### Core Principles

1. **Clinical Clarity**: Information presented with precision, like scientific instruments
2. **Semantic Color System**: Colors that communicate meaning, not decoration
3. **Refined Minimalism**: Clean design with intentional details
4. **Smooth Interactions**: Responsive micro-interactions that delight
5. **Progressive Disclosure**: Collapsible sections prevent information overload

### Color Palette

The redesign uses a semantic color system that avoids generic AI aesthetics:

| State | Color | Usage |
|-------|-------|-------|
| Running | Amber (HSL: 38, 92%, 55%) | Active processes, loading states |
| Success | Emerald (HSL: 142, 76%, 45%) | Completed operations |
| Error | Rose (HSL: 0, 84%, 60%) | Failures, exceptions |
| Waiting | Slate | Pending, awaiting approval |
| Code Execution | Violet/Fuchsia | Special treatment for sandbox |

### Typography

- **Monospace**: IBM Plex Mono (already in project)
  - Technical content: code, JSON, IDs
  - Metrics: execution time, log counts
- **Sans-serif**: Inter (system)
  - Labels, descriptions, UI text
- **Weights**: Strategic use of font weights for hierarchy
  - Bold (700) for tool names and section headers
  - Semibold (600) for labels
  - Medium (500) for metrics
  - Regular (400) for body text

## Components

### ToolInvocation (Redesigned)

**Location**: `/components/tool-invocation-redesign.tsx`

#### Features

- **Animated Accent Bar**: Left edge glows with state color, pulses when active
- **Icon Feedback**: State-specific icons (Loader2, CheckCircle2, AlertCircle, Clock)
- **Compact Preview**: Truncated argument/result preview in collapsed state
- **Smooth Expansion**: Chevron animation, height transitions
- **Hover Effects**: Subtle scale on icon, brightness increase

#### States

```typescript
type ToolState =
  | "call" | "input-streaming"        // Running (Amber)
  | "input-available" | "approval-requested"  // Waiting (Slate)
  | "output-available" | "approval-responded" // Success (Emerald)
  | "output-error" | "output-denied"          // Error (Rose)
```

#### Usage Example

```tsx
<ToolInvocation
  toolName="mcp__entrez__search_pubmed"
  state="output-available"
  args={{ query: "CRISPR", retmax: 10 }}
  result={{ count: 1247, idlist: [...] }}
  callId="call_abc123"
  isLatestMessage={false}
  status="ready"
/>
```

### CodeExecutionDisplay (Redesigned)

**Location**: `/components/code-execution-display-redesign.tsx`

#### Features

- **Gradient Accent**: Animated gradient bar (violet → fuchsia) for completed, amber for running
- **Tabbed Interface**: Organized tabs for Code, Logs, and Result/Error
- **Syntax Highlighting**: Markdown code blocks with JavaScript highlighting
- **Console Output**: Numbered log entries with monospace formatting
- **Execution Metrics**: Time and log count in header
- **Special Badge**: "Sandbox" badge with gradient background

#### Tabs

1. **Code Tab**: Shows the generated JavaScript with syntax highlighting
2. **Logs Tab**: Console output with line numbers, scrollable
3. **Result/Error Tab**: Success result or error message with semantic coloring

#### Usage Example

```tsx
<CodeExecutionDisplay
  code="const results = await helpers.entrez.invoke(...);"
  result={{ totalVariants: 847, variantSummary: {...} }}
  logs={["Found 847 variants", "Processing..."]}
  executionTime={1247}
  state="output-available"
/>
```

## Visual Design Details

### Gradients

- **Background Gradients**: Subtle, from lighter to more transparent
  - Success: `from-emerald-50/40 to-emerald-50/20`
  - Error: `from-rose-50/40 to-rose-50/20`
  - Running: `from-amber-50/40 to-amber-50/20`
  - Code: `from-violet-50/50 to-violet-50/20`

- **Dark Mode**: More saturated, deeper backgrounds
  - Success: `dark:from-emerald-950/30 dark:to-emerald-950/10`

### Shadows

- **Resting State**: Subtle border, minimal shadow
- **Hover State**: `shadow-lg` for elevation
- **Icon Shadows**: Colored shadows matching state
  - Example: `shadow-lg shadow-violet-500/20`

### Borders

- **Container Borders**: Semi-transparent, colored per state
  - `border-emerald-200/60` (light)
  - `dark:border-emerald-900/40` (dark)

- **Inner Borders**: Lighter, for separation
  - `border-border/30` for tab separators
  - `border-border/20` for section dividers

### Animations

- **Pulse**: Accent bars and running state icons
- **Spin**: Loader icons
- **Rotate**: Icon hover (3deg rotation on code execution icon)
- **Scale**: Icon hover (1.05x - 1.10x scale)
- **Chevron**: Smooth 90deg rotation on expand

### Spacing

- **Padding**: Generous but not wasteful
  - Container: `px-4 py-3`
  - Tabs: `px-4 py-2.5`
  - Content sections: `p-4`

- **Gaps**: Consistent spacing between elements
  - Header elements: `gap-3`
  - Inline items: `gap-2`
  - Tabs: `gap-4`

## Accessibility

- **Keyboard Navigation**: All interactive elements are keyboard accessible
- **Focus States**: Ring utilities from Tailwind
- **Color Contrast**: WCAG AA compliant
- **Screen Readers**: Semantic HTML with proper ARIA labels
- **Reduced Motion**: Respects `prefers-reduced-motion`

## Performance

- **CSS Transitions**: Hardware-accelerated transforms
- **Conditional Rendering**: Tabs render only when selected
- **Lazy Loading**: Expanded content loads on interaction
- **Optimized Animations**: 60fps via GPU acceleration

## Migration Guide

### From Old to New

1. **Update Import**:
```tsx
// Old
import { ToolInvocation } from "./tool-invocation";

// New
import { ToolInvocation } from "./tool-invocation-redesign";
```

2. **Props Are Compatible**: No changes needed to existing props

3. **Code Execution**: Automatic - handled via `toolName === "codemode_sandbox"` check

### Testing

Visit `/tool-demo` to see all states and variations in action:

```bash
pnpm dev
# Navigate to http://localhost:3000/tool-demo
```

## Dark Mode Support

All components fully support dark mode with:

- Adjusted color values (higher luminance, deeper backgrounds)
- Enhanced shadows with color tints
- Proper contrast ratios
- Smooth transitions between themes

## Future Enhancements

Potential improvements for future iterations:

- [ ] Copy buttons for code blocks
- [ ] Syntax highlighting with `react-syntax-highlighter`
- [ ] Diff view for before/after states
- [ ] Timeline view for multi-step executions
- [ ] Export logs as file
- [ ] Search/filter within logs
- [ ] Collapsible log groups
- [ ] Performance metrics graphs

## Credits

Design influenced by:

- **Linear**: Clean, minimal UI with intentional details
- **Raycast**: Precision and speed in developer tools
- **Arc Browser**: Refined brutalism and color usage
- **Scientific Instruments**: Oscilloscopes, lab equipment displays
- **VS Code**: Terminal and debugging UI patterns

---

**Designed with Laboratory Precision** • Avoiding Generic AI Aesthetics • Built for Developers
