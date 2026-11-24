import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../src/renderer/ai', import.meta.url))
const readAiFile = (name: string): string => readFileSync(join(ROOT, name), 'utf8')

describe('Whiteboard AI panel shared design system alignment', () => {
  it('loads shared @genoffice/ui AI stylesheets in the expected override order', () => {
    const dock = readAiFile('AiDock.tsx')
    const queueIdx = dock.indexOf("import '@genoffice/ui/ai-queue-strip.css'")
    const localIdx = dock.indexOf("import './ai-panel.css'")
    const sharedIdx = dock.indexOf("import '@genoffice/ui/ai-panel.css'")
    expect(queueIdx).toBeGreaterThan(-1)
    expect(localIdx).toBeGreaterThan(-1)
    expect(sharedIdx).toBeGreaterThan(localIdx)
    expect(dock).toContain('ai-rail ai-entry')
    expect(dock).toContain("aiSubscriptionText(lang, 'aiAssistant')")
  })

  it('uses shared design tokens and panel chrome classes in ai-panel.css', () => {
    const css = readAiFile('ai-panel.css')
    expect(css).toContain('background: var(--color-bg-page);')
    expect(css).not.toMatch(/var\(--bg\)/)
    expect(css).not.toMatch(/\.wbai-/)
    expect(css).toContain("html:not([data-ai-panel-side='right']) .wb-app > .ai-dock")
    expect(css).toContain('.ai-panel-resizer')
    expect(css).toContain('.ai-chat-empty')
    expect(css).toContain('.ai-attachments')
  })

  it('uses shared AI panel components and class hooks in AiPanel.tsx', () => {
    const panel = readAiFile('AiPanel.tsx')
    expect(panel).not.toMatch(/\bwbai-/)
    expect(panel).not.toContain('className="wb-btn"')
    expect(panel).toContain('className="ai-panel-resizer"')
    expect(panel).toContain("aria-label={aiSubscriptionText(lang, 'aiAssistant')}")
    expect(panel).toContain('<AiPanelHeader')
    expect(panel).toContain('className="ai-header-btn ai-panel-collapse"')
    expect(panel).toContain('className="ai-chat"')
    expect(panel).toContain('className="ai-chat-empty"')
    expect(panel).toContain('className="ai-chat-empty-badge"')
    expect(panel).toContain('className="ai-starter-list"')
    expect(panel).toContain('<AiEmptyHints')
    expect(panel).toContain('<AiReplyProgress')
    expect(panel).toContain('<AiReplyFooter')
    expect(panel).toContain('<AiScrollToBottom')
    expect(panel).toContain('<AiQueueStrip')
    expect(panel).toContain('<AiToolsUnsupportedNotice')
    expect(panel).toContain('<AiUsageChip')
    expect(panel).toContain('useProjectPanel')
    expect(panel).toContain('<AiFirstConnectionNotice')
    expect(panel).toMatch(/<AiFirstConnectionNotice[\s\S]*?\bcodexKeepsHistory\b/)
    expect(panel).toContain('<AiChangesCard')
  })
})
