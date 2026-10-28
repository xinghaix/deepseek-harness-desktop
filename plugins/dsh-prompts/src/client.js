window.__ModuleLoader__.load({
  id: "dsh-prompts",
  factory: (require) => {
    const React = require("react");
    const { createSnapshotStore } = require("@deepseek-ai/dsh-client-store");
    const model = __PROMPTS_MODEL__;
    const locales = __PROMPTS_LOCALES__;
    const h = React.createElement;

    const NS = "dsh-prompts";
    const SECTION_ID = "dsh-prompts";
    const PANEL_ID = "dsh-prompts";
    const BUNDLE_KEY = "dsh-prompts";
    const ROW_KEY = "dsh-prompts#dsh-prompts";
    const STATE_PATH = "/api/dsh-prompts/state";
    const ACTION_PATH = "/api/dsh-prompts/action";
    const STYLE_TAG_ID = "dsh-prompts/PromptsManager.v2.css";

    // Official DSH typography & visual design tokens (matching PluginManagerPage & SubagentSettings)
    const CSS_TEXT = `
.dsh-prompts-root {
  display: flex;
  flex-direction: column;
  gap: 24px;
  color: var(--dsw-alias-label-primary, #f9fafb);
  font-size: 13px;
  line-height: 20px;
  box-sizing: border-box;
  width: 100%;
}
.dsh-prompts-root[data-variant="settings"] {
  max-width: 820px;
  padding: 4px 0 36px;
}
.dsh-prompts-root[data-variant="bundle"] {
  max-width: 960px;
  padding: 4px 0 32px;
}
.dsh-prompts-root[data-variant="main"] {
  max-width: 960px;
  margin: 0 auto;
  padding: 28px clamp(24px, 4vw, 48px) 48px;
}
[data-platform="darwin"] .dsh-prompts-root[data-variant="main"] {
  padding-top: calc(28px + var(--dsh-frame-top-clearance, 0px));
}

/* Top Page Heading (used in Settings & Main views; omitted in Bundle view where host already renders header) */
.dsh-prompts-page-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.dsh-prompts-page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 500;
  line-height: 28px;
  color: var(--dsw-alias-label-primary);
}
.dsh-prompts-page-intro {
  margin: 4px 0 0;
  font-size: 13px;
  font-weight: 400;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
}

/* Section Group & Toggle Row (matches Subagent "运行限制" / "模型选择" & toggleRow) */
.dsh-prompts-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dsh-prompts-section-title {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}
.dsh-prompts-toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border-radius: var(--dsw-radius-xl, 12px);
  background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.03)));
  border: 0.5px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l2, rgba(255,255,255,0.08)));
}
.dsh-prompts-toggle-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.dsh-prompts-toggle-label {
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsh-prompts-toggle-hint {
  margin: 0;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-prompts-live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dsw-alias-state-success-primary, #10b981);
  flex: none;
}
.dsh-prompts-live-dot[data-off="true"] {
  background: var(--dsw-alias-label-tertiary, #81858c);
}

/* Official DSH Switch (36x20 pill track, 16x16 thumb) */
.dsh-prompts-switch {
  box-sizing: border-box;
  width: 36px;
  height: 20px;
  border-radius: 999px;
  border: none;
  outline: none;
  padding: 2px;
  cursor: pointer;
  background: var(--dsw-alias-border-l4, rgba(128, 128, 128, 0.38));
  display: inline-flex;
  align-items: center;
  flex: none;
  transition: background 0.14s ease;
}
.dsh-prompts-switch[aria-checked="true"] {
  background: var(--dsw-alias-brand-primary, var(--dsw-alias-state-business-primary, #3b82f6));
}
.dsh-prompts-switch:disabled {
  opacity: 0.45;
  cursor: default;
}
.dsh-prompts-switch-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffffff;
  display: block;
  transition: transform 0.14s ease;
  transform: translateX(0);
}
.dsh-prompts-switch[aria-checked="true"] .dsh-prompts-switch-thumb {
  transform: translateX(16px);
}
.dsh-prompts-switch[data-size="sm"] {
  width: 28px;
  height: 16px;
}
.dsh-prompts-switch[data-size="sm"] .dsh-prompts-switch-thumb {
  width: 12px;
  height: 12px;
}
.dsh-prompts-switch[data-size="sm"][aria-checked="true"] .dsh-prompts-switch-thumb {
  transform: translateX(12px);
}
.dsh-prompts-field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.dsh-prompts-inline-switch-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  user-select: none;
}
.dsh-prompts-field-subhint {
  font-size: 11.5px;
  font-weight: 400;
  color: var(--dsw-alias-label-tertiary);
}

/* Top Navigation Bar: Capsule Segmented Control (matches Official Plugin Page "已安装 | 插件市场 | 发现") */
.dsh-prompts-nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.dsh-prompts-capsule-tabs {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.05));
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.07));
}
.dsh-prompts-capsule-tab {
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  padding: 5px 14px;
  border-radius: 999px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease;
  white-space: nowrap;
}
.dsh-prompts-capsule-tab:hover {
  color: var(--dsw-alias-label-primary);
}
.dsh-prompts-capsule-tab[data-active="true"] {
  background: var(--dsw-alias-bg-layer-4, rgba(255, 255, 255, 0.12));
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}

/* Buttons & Controls */
.dsh-prompts-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.dsh-prompts-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.dsh-prompts-btn {
  box-sizing: border-box;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  height: 32px;
  padding: 0 14px;
  border-radius: 999px;
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.14));
  outline: none;
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.04));
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
  transition: background 0.12s ease, opacity 0.12s ease, border-color 0.12s ease;
}
.dsh-prompts-btn:hover:not(:disabled) {
  background: var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.08));
}
.dsh-prompts-btn:disabled {
  opacity: 0.42;
  cursor: default;
}
.dsh-prompts-btn[data-variant="primary"] {
  background: var(--dsw-alias-brand-primary, var(--dsw-alias-state-business-primary, #3b82f6));
  border-color: transparent;
  color: #ffffff;
}
.dsh-prompts-btn[data-variant="primary"]:hover:not(:disabled) {
  opacity: 0.92;
}
.dsh-prompts-btn[data-variant="danger"] {
  color: var(--dsw-alias-state-error-primary, #ef4444);
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary, #ef4444) 35%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #ef4444) 8%, transparent);
}
.dsh-prompts-btn[data-variant="ghost"] {
  border-color: transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  padding: 0 8px;
  border-radius: var(--dsw-radius-md, 8px);
}
.dsh-prompts-btn[data-variant="ghost"]:hover:not(:disabled) {
  background: var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.06));
  color: var(--dsw-alias-label-primary);
}
.dsh-prompts-btn[data-size="sm"] {
  height: 26px;
  padding: 0 10px;
  font-size: 12px;
  line-height: 18px;
}

/* Rounded Inputs, Selects & Textarea (matches Official Subagent "最大递归深度" input boxes) */
.dsh-prompts-field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
  gap: 14px;
}
.dsh-prompts-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.dsh-prompts-field-label {
  font-size: 12.5px;
  font-weight: 500;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
.dsh-prompts-input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 36px;
  padding: 0 12px;
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  border-radius: var(--dsw-radius-lg, 10px);
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.14));
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.04));
  color: var(--dsw-alias-label-primary);
  outline: none;
  transition: border-color 0.12s ease;
}
.dsh-prompts-input:focus,
.dsh-prompts-textarea:focus {
  border-color: var(--dsw-alias-brand-primary, var(--dsw-alias-state-business-primary, #3b82f6));
}

/* Official DSH Pill Trigger & Floating Scrollable Dropdown Menu */
.dsh-prompts-dropdown {
  position: relative;
  display: inline-flex;
  flex: none;
  min-width: 0;
  max-width: 100%;
}
.dsh-prompts-dropdown[data-full="true"] {
  display: flex;
  width: 100%;
  flex: 1;
}
.dsh-prompts-dropdown-trigger {
  box-sizing: border-box;
  appearance: none;
  -webkit-appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  height: 32px;
  padding: 0 10px 0 12px;
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.08));
  border-radius: 16px;
  outline: none;
  background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.06)));
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  font-weight: 400;
  line-height: 18px;
  cursor: pointer;
  white-space: nowrap;
  min-width: 0;
  max-width: 100%;
  transition: background 0.14s ease, border-color 0.14s ease;
}
.dsh-prompts-dropdown[data-full="true"] .dsh-prompts-dropdown-trigger {
  width: 100%;
}
.dsh-prompts-dropdown[data-size="sm"] .dsh-prompts-dropdown-trigger {
  height: 30px;
  padding: 0 10px 0 12px;
  font-size: 12.5px;
  line-height: 18px;
}
.dsh-prompts-dropdown-trigger:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.1)));
}
.dsh-prompts-dropdown-trigger:disabled {
  cursor: default;
  opacity: 0.4;
}
.dsh-prompts-dropdown-trigger:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #3b82f6);
  outline-offset: 1px;
}
.dsh-prompts-dropdown-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-prompts-dropdown-chevron {
  flex: none;
  display: block;
  width: 13px;
  height: 13px;
  color: var(--dsw-alias-label-secondary);
  transition: transform 0.15s ease;
}
.dsh-prompts-dropdown-chevron[data-open="true"] {
  transform: rotate(180deg);
}
.dsh-prompts-dropdown-menu {
  box-sizing: border-box;
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 80;
  width: max-content;
  min-width: max(100%, 180px);
  max-width: min(360px, 78vw);
  max-height: 240px;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px;
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-3, #25262b);
  border: 0.5px solid var(--dsw-alias-border-l4, rgba(255, 255, 255, 0.14));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
}
.dsh-prompts-dropdown-menu[data-align="right"] {
  left: auto;
  right: 0;
}
.dsh-prompts-dropdown[data-full="true"] .dsh-prompts-dropdown-menu {
  left: 0;
  right: 0;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
.dsh-prompts-dropdown-option {
  box-sizing: border-box;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 10px;
  border: none;
  outline: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12.5px;
  line-height: 17px;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s ease;
}
.dsh-prompts-dropdown-option:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08));
}
.dsh-prompts-dropdown-option-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.dsh-prompts-dropdown-option-title {
  white-space: normal;
  word-break: break-word;
  line-height: 17px;
}
.dsh-prompts-dropdown-option-sub {
  font-size: 11px;
  line-height: 14px;
  color: var(--dsw-alias-label-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-prompts-dropdown-check {
  flex: none;
  font-size: 12px;
  line-height: 1;
  color: var(--dsw-alias-label-primary);
}
.dsh-prompts-textarea {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 140px;
  padding: 10px 12px;
  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12.5px;
  line-height: 19px;
  border-radius: var(--dsw-radius-lg, 10px);
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.14));
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.04));
  color: var(--dsw-alias-label-primary);
  resize: vertical;
  outline: none;
}

/* Segmented Radio Pills for Anchor Selection */
.dsh-prompts-anchor-group {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
  gap: 8px;
}
.dsh-prompts-anchor-option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 12px;
  border-radius: var(--dsw-radius-lg, 10px);
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.12));
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.03));
  cursor: pointer;
  font-size: 12.5px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  transition: border-color 0.12s ease, background 0.12s ease;
}
.dsh-prompts-anchor-option[data-checked="true"] {
  border-color: var(--dsw-alias-brand-primary, var(--dsw-alias-state-business-primary, #3b82f6));
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 10%, transparent);
  color: var(--dsw-alias-label-primary);
}

/* Inline Collapsible Drawer / Editor Panel (No Popup Modal!) */
.dsh-prompts-inline-editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 18px;
  border-radius: var(--dsw-radius-xl, 12px);
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.16));
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.04));
}
.dsh-prompts-inline-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.dsh-prompts-inline-editor-title {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}

/* Official Plugin-Style List & Expandable Row Cards (matches Screenshot 6 "子智能体 / 网页搜索 / 智能体团队") */
.dsh-prompts-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dsh-prompts-row-card {
  border-radius: var(--dsw-radius-xl, 12px);
  border: 0.5px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.08)));
  background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.02)));
  overflow: visible;
  transition: border-color 0.12s ease, background 0.12s ease;
}
.dsh-prompts-row-card:not([data-expanded="true"]):hover {
  border-color: var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.15));
  background: var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.035));
}
.dsh-prompts-row-card[data-expanded="true"] {
  border-color: var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.18));
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.035));
}
.dsh-prompts-row-card[data-disabled="true"] {
  opacity: 0.65;
}
.dsh-prompts-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 14px;
  min-height: 56px;
  box-sizing: border-box;
  border-radius: var(--dsw-radius-xl, 12px);
  outline: none;
}
.dsh-prompts-row-card[data-expanded="true"] .dsh-prompts-row-head {
  border-radius: var(--dsw-radius-xl, 12px) var(--dsw-radius-xl, 12px) 0 0;
}
.dsh-prompts-row-trigger {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  background: transparent;
  border: none;
  border-radius: 8px;
  outline: none;
  padding: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.dsh-prompts-row-trigger:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #3b82f6);
  outline-offset: 2px;
}
.dsh-prompts-row-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.1));
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.04));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
}
.dsh-prompts-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dsh-prompts-row-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}
.dsh-prompts-row-title {
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-prompts-row-desc {
  margin: 0;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-prompts-tag {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 7px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 500;
  line-height: 18px;
  background: var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.08));
  color: var(--dsw-alias-label-secondary);
  flex: none;
}
.dsh-prompts-tag[data-tone="accent"] {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 18%, transparent);
  color: var(--dsw-alias-brand-primary, #60a5fa);
}
.dsh-prompts-tag[data-tone="current"] {
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary, #10b981) 18%, transparent);
  color: var(--dsw-alias-state-success-primary, #34d399);
}
.dsh-prompts-chevron {
  color: var(--dsw-alias-label-tertiary);
  transition: transform 0.14s ease;
  flex: none;
  display: inline-flex;
}
.dsh-prompts-chevron[data-open="true"] {
  transform: rotate(90deg);
}
.dsh-prompts-row-end {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}
.dsh-prompts-row-body {
  border-top: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.08));
  border-radius: 0 0 var(--dsw-radius-xl, 12px) var(--dsw-radius-xl, 12px);
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Workspace Selector Card */
.dsh-prompts-ws-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--dsw-radius-xl, 12px);
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.08));
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.03));
}
.dsh-prompts-pills {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.dsh-prompts-pill {
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.12));
  outline: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.dsh-prompts-pill[data-active="true"] {
  background: var(--dsw-alias-brand-primary, #3b82f6);
  color: #ffffff;
  border-color: transparent;
}

/* Preview & Empty / Error States */
.dsh-prompts-pre {
  margin: 0;
  padding: 12px 14px;
  border-radius: var(--dsw-radius-lg, 10px);
  background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.22));
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.08));
  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--dsw-alias-label-secondary);
  max-height: 360px;
  overflow: auto;
}
.dsh-prompts-empty {
  padding: 24px 18px;
  text-align: center;
  border-radius: var(--dsw-radius-xl, 12px);
  border: 0.5px dashed var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.14));
  color: var(--dsw-alias-label-tertiary);
  margin: 0;
  font-size: 13px;
  line-height: 20px;
}
.dsh-prompts-error {
  padding: 9px 12px;
  border-radius: var(--dsw-radius-md, 8px);
  border: 0.5px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #ef4444) 40%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #ef4444) 10%, transparent);
  color: var(--dsw-alias-state-error-primary, #ef4444);
  margin: 0;
  font-size: 12.5px;
}
`;

    function ensureStyleTag() {
      if (typeof document === "undefined") return;
      if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`)) return;
      const tag = document.createElement("style");
      tag.dataset.plugin = NS;
      tag.dataset.pluginCss = STYLE_TAG_ID;
      tag.textContent = CSS_TEXT;
      (document.head || document.documentElement).appendChild(tag);
    }

    function fillTemplate(text, params) {
      if (!params || typeof text !== "string") return String(text ?? "");
      return text.replace(/\{(\w+)\}/g, (_, key) =>
        params[key] !== undefined && params[key] !== null ? String(params[key]) : `{${key}}`
      );
    }

    function createTranslator(ctx, propT) {
      return (key, params) => {
        if (typeof propT === "function") {
          try {
            const direct = propT(key, params);
            if (direct && direct !== key && direct !== `${NS}.${key}`) {
              return fillTemplate(direct, params);
            }
          } catch {
            // Fall through to ctx.locale or bundled dictionary.
          }
        }
        try {
          if (typeof ctx?.locale?.bind === "function") {
            const bound = ctx.locale.bind(NS);
            const resolved = typeof bound === "function" ? bound(key) : "";
            if (resolved && resolved !== key && resolved !== `${NS}.${key}`) {
              return fillTemplate(resolved, params);
            }
          }
        } catch {
          // Fall through.
        }
        const active = String(ctx?.locale?.getSnapshot?.()?.active || "zh").toLowerCase();
        const langKey = active.startsWith("zh") ? "zh" : active.slice(0, 2);
        const dict = locales[langKey] || locales.en || locales.zh || {};
        const fallback = dict[key] ?? locales.en?.[key] ?? key;
        return fillTemplate(fallback, params);
      };
    }

    function promptsNavIconSVG(className, size = 16) {
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("width", String(size));
      svg.setAttribute("height", String(size));
      svg.setAttribute("viewBox", "0 0 16 16");
      svg.setAttribute("fill", "none");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("class", [className, "dshPromptsNavIcon"].filter(Boolean).join(" "));
      const mk = (tag, attrs) => {
        const el = document.createElementNS(ns, tag);
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        return el;
      };
      svg.appendChild(
        mk("rect", {
          x: "1.75",
          y: "2",
          width: "12.5",
          height: "12",
          rx: "2.2",
          stroke: "currentColor",
          "stroke-width": "1.4",
        })
      );
      svg.appendChild(
        mk("path", {
          d: "M4.5 6L6.4 7.5L4.5 9M7.6 9H11.2M4.5 11.4H11.2",
          stroke: "currentColor",
          "stroke-width": "1.4",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        })
      );
      return svg;
    }

    function SidebarPromptIcon() {
      return h(
        "svg",
        {
          width: 18,
          height: 18,
          viewBox: "0 0 16 16",
          fill: "none",
          "aria-hidden": "true",
        },
        h("rect", {
          x: "1.75",
          y: "2",
          width: "12.5",
          height: "12",
          rx: "2.2",
          stroke: "currentColor",
          strokeWidth: "1.4",
        }),
        h("path", {
          d: "M4.5 6L6.4 7.5L4.5 9M7.6 9H11.2M4.5 11.4H11.2",
          stroke: "currentColor",
          strokeWidth: "1.4",
          strokeLinecap: "round",
          strokeLinejoin: "round",
        })
      );
    }

    function ChevronIcon({ open }) {
      return h(
        "span",
        { className: "dsh-prompts-chevron", "data-open": open ? "true" : "false", "aria-hidden": "true" },
        h(
          "svg",
          { width: 12, height: 12, viewBox: "0 0 12 12", fill: "none" },
          h("path", {
            d: "M4.5 2.75L7.75 6L4.5 9.25",
            stroke: "currentColor",
            strokeWidth: "1.5",
            strokeLinecap: "round",
            strokeLinejoin: "round",
          })
        )
      );
    }

    function Switch({ checked, disabled, onChange, label, size }) {
      return h(
        "button",
        {
          type: "button",
          role: "switch",
          className: "dsh-prompts-switch",
          "data-size": size || undefined,
          "aria-checked": checked ? "true" : "false",
          "aria-label": label,
          disabled: Boolean(disabled),
          onClick: (event) => {
            event.stopPropagation();
            if (!disabled && typeof onChange === "function") {
              onChange(!checked);
            }
          },
        },
        h("span", { className: "dsh-prompts-switch-thumb" })
      );
    }

    function installPromptsNavIcon(getLabels) {
      if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
        return () => {};
      }
      const paint = () => {
        const accepted = new Set(
          [
            ...(typeof getLabels === "function" ? getLabels() : []),
            ...Object.values(locales).map((dict) => dict?.navTitle).filter(Boolean),
          ].map((s) => String(s).trim())
        );
        const candidates = document.querySelectorAll("button, [role='button'], span, div");
        for (const el of candidates) {
          const txt = (el.textContent || "").trim();
          if (!accepted.has(txt)) continue;
          const row = el.closest("button") || el.parentElement;
          if (!row) continue;
          if (row.querySelector("svg.dshPromptsNavIcon")) continue;
          const oldSvg = row.querySelector("svg");
          if (!oldSvg) continue;
          oldSvg.replaceWith(promptsNavIconSVG(oldSvg.getAttribute("class") || "", 16));
        }
      };
      paint();
      const obs = new MutationObserver(() => paint());
      obs.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });
      return () => obs.disconnect();
    }

    async function requestApi(path, body, fetchImpl) {
      const fn = fetchImpl || (typeof fetch === "function" ? fetch : null);
      if (!fn) throw new Error("fetch unavailable");
      const response = await fn(
        path,
        body === undefined
          ? { method: "GET", credentials: "same-origin", cache: "no-store" }
          : {
              method: "POST",
              credentials: "same-origin",
              headers: {
                "content-type": "application/json",
                "x-dsh-prompts-action": "1",
              },
              body: JSON.stringify(body),
            }
      );
      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      if (!response.ok || data?.ok === false) {
        const err = new Error(data?.message || data?.code || `HTTP ${response.status}`);
        err.code = data?.code || "";
        err.payload = data;
        throw err;
      }
      return data;
    }

    function resolveCurrentWorkspacePath(services, hostWorkspaces, clientWorkspaces) {
      try {
        const sessionsSnap = services?.sessions?.list?.getSnapshot?.();
        const activeId =
          sessionsSnap?.activeSessionId ||
          sessionsSnap?.currentSessionId ||
          sessionsSnap?.selectedSessionId ||
          "";
        const allWs = [
          ...(Array.isArray(clientWorkspaces) ? clientWorkspaces : []),
          ...(Array.isArray(hostWorkspaces) ? hostWorkspaces : []),
        ];
        if (activeId) {
          for (const ws of allWs) {
            if (Array.isArray(ws?.sessionIds) && ws.sessionIds.includes(activeId)) {
              return model.normalizePath(ws.path);
            }
          }
        }
        const items = sessionsSnap?.items || [];
        if (items.length > 0) {
          const first = items[0];
          if (first?.cwd) return model.normalizePath(first.cwd);
          const firstId = first?.sessionId || first?.id;
          if (firstId) {
            for (const ws of allWs) {
              if (Array.isArray(ws?.sessionIds) && ws.sessionIds.includes(firstId)) {
                return model.normalizePath(ws.path);
              }
            }
          }
        }
      } catch {
        // Ignore session inspection error.
      }
      return "";
    }

    function createController(options = {}) {
      let services = null;
      let state = model.defaultState();
      let hostWorkspaces = [];
      let loading = false;
      let saving = false;
      let error = "";
      let activeTab = "global";
      let selectedWorkspacePath = "";
      let previewWorkspacePath = "__global__";
      // Inline expandable editor state (replaces secondary Modal dialog)
      let editorDraft = null;
      // Inline expanded item ID (or null)
      let expandedItemId = null;
      // Inline pending confirmation key (e.g. "clear:global", "clear:workspace", "delete:<id>")
      let pendingConfirmKey = "";
      // Currently open floating dropdown ID (or "")
      let openDropdownId = "";
      const listeners = new Set();

      const getClientWorkspaces = () => {
        const snap = services?.workspaces?.list?.getSnapshot?.();
        return Array.isArray(snap?.items) ? snap.items : [];
      };

      const buildSnapshot = () => {
        const clientWs = getClientWorkspaces();
        const combinedDshWs = [...clientWs];
        const seenPaths = new Set(clientWs.map((w) => model.pathKey(model.normalizePath(w?.path))));
        for (const hw of hostWorkspaces) {
          const key = model.pathKey(model.normalizePath(hw?.path));
          if (key && !seenPaths.has(key)) {
            seenPaths.add(key);
            combinedDshWs.push(hw);
          }
        }
        const currentCwd = resolveCurrentWorkspacePath(services, hostWorkspaces, clientWs);
        const workspaceCatalog = model.mergeWorkspaceCatalog(
          combinedDshWs,
          state.workspaces,
          currentCwd
        );

        let effectiveSelectedPath = model.normalizePath(selectedWorkspacePath);
        if (
          !effectiveSelectedPath ||
          !workspaceCatalog.some((w) => model.pathKey(w.path) === model.pathKey(effectiveSelectedPath))
        ) {
          const currentEntry = workspaceCatalog.find((w) => w.isCurrent);
          effectiveSelectedPath = currentEntry?.path || workspaceCatalog[0]?.path || "";
        }

        const selectedWorkspace =
          workspaceCatalog.find((w) => model.pathKey(w.path) === model.pathKey(effectiveSelectedPath)) ||
          null;

        const targetPreviewCwd =
          previewWorkspacePath === "__global__" || !previewWorkspacePath
            ? ""
            : previewWorkspacePath;

        const preview = model.renderEffectivePreview(state, targetPreviewCwd);
        const summary = model.summaryCounts(state);

        return {
          state,
          summary,
          loading,
          saving,
          error,
          activeTab,
          currentCwd,
          workspaceCatalog,
          selectedWorkspacePath: effectiveSelectedPath,
          selectedWorkspace,
          previewWorkspacePath,
          previewTargetCwd: targetPreviewCwd,
          preview,
          editorModal: editorDraft,
          expandedItemId,
          pendingConfirmKey,
          openDropdownId,
        };
      };

      const store = createSnapshotStore(buildSnapshot());

      let docListenersAttached = false;
      const onDocMouseDown = (event) => {
        if (!openDropdownId) return;
        const target = event?.target;
        if (target && typeof target.closest === "function") {
          const host = target.closest("[data-dsh-prompts-dropdown]");
          if (host && host.getAttribute("data-dsh-prompts-dropdown") === openDropdownId) {
            return;
          }
        }
        openDropdownId = "";
        publish();
      };
      const onDocKeyDown = (event) => {
        if (openDropdownId && event?.key === "Escape") {
          openDropdownId = "";
          publish();
        }
      };
      const syncDocListeners = () => {
        if (typeof document === "undefined" || typeof document.addEventListener !== "function") {
          return;
        }
        if (openDropdownId && !docListenersAttached) {
          docListenersAttached = true;
          document.addEventListener("mousedown", onDocMouseDown);
          document.addEventListener("keydown", onDocKeyDown);
        } else if (!openDropdownId && docListenersAttached) {
          docListenersAttached = false;
          document.removeEventListener("mousedown", onDocMouseDown);
          document.removeEventListener("keydown", onDocKeyDown);
        }
      };

      const publish = () => {
        syncDocListeners();
        const next = buildSnapshot();
        store.set(next);
        for (const fn of [...listeners]) {
          try {
            fn(next);
          } catch {
            // Listener isolation.
          }
        }
      };

      const controller = {
        subscribe: store.subscribe.bind(store),
        getSnapshot: store.getSnapshot.bind(store),
        onStateChange(fn) {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
        attach(nextServices) {
          services = { ...(services || {}), ...(nextServices || {}) };
          publish();
        },
        detach(keys) {
          if (!services || !Array.isArray(keys)) {
            services = null;
          } else {
            const copy = { ...services };
            for (const k of keys) delete copy[k];
            services = copy;
          }
          publish();
        },
        sync: publish,
        setTab(tab) {
          activeTab = tab;
          error = "";
          pendingConfirmKey = "";
          openDropdownId = "";
          publish();
        },
        selectWorkspace(wsPath) {
          selectedWorkspacePath = model.normalizePath(wsPath);
          error = "";
          pendingConfirmKey = "";
          openDropdownId = "";
          if (editorDraft && editorDraft.scope === "workspace" && !editorDraft.id) {
            const snap = buildSnapshot();
            editorDraft = {
              ...editorDraft,
              workspacePath: snap.selectedWorkspacePath,
              workspaceTitle: snap.selectedWorkspace?.title || "",
            };
          }
          publish();
        },
        setPreviewWorkspace(wsPath) {
          previewWorkspacePath = wsPath;
          openDropdownId = "";
          publish();
        },
        toggleDropdown(id) {
          const targetId = String(id || "");
          openDropdownId = openDropdownId === targetId ? "" : targetId;
          publish();
        },
        closeDropdown() {
          if (!openDropdownId) return;
          openDropdownId = "";
          publish();
        },
        toggleExpandItem(id) {
          const targetId = String(id || "");
          if (expandedItemId === targetId) {
            expandedItemId = null;
            if (editorDraft?.id === targetId) editorDraft = null;
          } else {
            expandedItemId = targetId;
          }
          pendingConfirmKey = "";
          openDropdownId = "";
          publish();
        },
        openEditor(config) {
          const scope = config?.scope === "workspace" ? "workspace" : "global";
          const item = config?.item || null;
          const snap = store.getSnapshot();
          // Toggle closed if clicking "+ New Prompt" when the blank inline creator is already open
          if (
            !item &&
            !config?.defaultContent &&
            editorDraft &&
            !editorDraft.id &&
            editorDraft.scope === scope
          ) {
            editorDraft = null;
            publish();
            return;
          }
          if (item?.id) {
            expandedItemId = item.id;
          }
          editorDraft = {
            scope,
            workspacePath:
              scope === "workspace"
                ? model.normalizePath(config.workspacePath || snap.selectedWorkspacePath)
                : "",
            workspaceTitle: config?.workspaceTitle || snap.selectedWorkspace?.title || "",
            id: item?.id || "",
            title: item?.title || config?.defaultTitle || "",
            content: item?.content || config?.defaultContent || "",
            includeTitle: item ? item.includeTitle === true : false,
            position: item?.position || config?.defaultPosition || "suffix",
            enabled: item ? item.enabled !== false : true,
            validationError: "",
          };
          pendingConfirmKey = "";
          openDropdownId = "";
          publish();
        },
        updateEditor(patch) {
          if (!editorDraft) return;
          editorDraft = { ...editorDraft, ...patch, validationError: "" };
          publish();
        },
        applyTemplateToEditor(template) {
          if (!editorDraft || !template) return;
          editorDraft = {
            ...editorDraft,
            title: editorDraft.title.trim() ? editorDraft.title : template.title,
            content: template.content,
            position: template.position || "suffix",
            validationError: "",
          };
          openDropdownId = "";
          publish();
        },
        closeEditor() {
          if (editorDraft?.id && expandedItemId === editorDraft.id) {
            expandedItemId = null;
          }
          editorDraft = null;
          openDropdownId = "";
          publish();
        },
        requestConfirm(key) {
          pendingConfirmKey = pendingConfirmKey === key ? "" : String(key || "");
          publish();
        },
        cancelConfirm() {
          pendingConfirmKey = "";
          publish();
        },
        async load() {
          loading = true;
          error = "";
          publish();
          try {
            const data = await requestApi(STATE_PATH, undefined, options.fetch);
            if (data?.state) state = model.normalizeState(data.state);
            if (Array.isArray(data?.workspaces)) hostWorkspaces = data.workspaces;
          } catch (err) {
            error = String(err?.message || err);
          } finally {
            loading = false;
            publish();
          }
        },
        async mutate(action) {
          if (saving) return false;
          const prev = state;
          try {
            state = model.applyMutation(state, action);
          } catch (err) {
            error = String(err?.message || err);
            publish();
            return false;
          }
          saving = true;
          error = "";
          pendingConfirmKey = "";
          publish();
          try {
            const data = await requestApi(ACTION_PATH, action, options.fetch);
            if (data?.state) state = model.normalizeState(data.state);
            if (Array.isArray(data?.workspaces)) hostWorkspaces = data.workspaces;
            saving = false;
            publish();
            return true;
          } catch (err) {
            state = prev;
            saving = false;
            error = String(err?.message || err);
            publish();
            return false;
          }
        },
        async saveEditor(t) {
          if (!editorDraft) return false;
          const title = String(editorDraft.title || "").trim();
          const content = String(editorDraft.content || "").trim();
          if (!title) {
            editorDraft = { ...editorDraft, validationError: t("errorTitleRequired") };
            publish();
            return false;
          }
          if (!content) {
            editorDraft = { ...editorDraft, validationError: t("errorContentRequired") };
            publish();
            return false;
          }
          const itemPayload = {
            ...(editorDraft.id ? { id: editorDraft.id } : {}),
            title,
            content,
            includeTitle: editorDraft.includeTitle === true,
            position: editorDraft.position,
            enabled: editorDraft.enabled !== false,
          };
          const action =
            editorDraft.scope === "workspace"
              ? {
                  type: "upsertWorkspaceItem",
                  workspacePath: editorDraft.workspacePath,
                  workspaceTitle: editorDraft.workspaceTitle,
                  item: itemPayload,
                }
              : {
                  type: "upsertGlobalItem",
                  item: itemPayload,
                };
          const editedId = editorDraft.id;
          editorDraft = null;
          if (editedId && expandedItemId === editedId) {
            expandedItemId = null;
          }
          return controller.mutate(action);
        },
        async pickAndSelectDirectory() {
          const uiWs = services?.uiWorkspace;
          if (!uiWs || typeof uiWs.pickDirectory !== "function") return;
          try {
            const picked = await uiWs.pickDirectory();
            const rawPath = typeof picked === "string" ? picked : picked?.path || "";
            const norm = model.normalizePath(rawPath);
            if (!norm) return;
            if (typeof services?.workspaces?.create === "function") {
              try {
                await services.workspaces.create({ path: norm });
              } catch {
                // Directory can still be configured even if workspace registration is skipped.
              }
            }
            selectedWorkspacePath = norm;
            await controller.mutate({
              type: "setWorkspacePolicy",
              workspacePath: norm,
              workspaceTitle: model.pathBaseName(norm),
              enabled: true,
            });
          } catch {
            // User cancelled picker.
          }
        },
      };

      return controller;
    }

    function useControllerState(controller) {
      return React.useSyncExternalStore(
        controller.subscribe,
        controller.getSnapshot,
        controller.getSnapshot
      );
    }

    function DropdownSelect({
      dropdownId,
      value,
      placeholder,
      options,
      disabled,
      fullWidth = false,
      size,
      align = "left",
      showCheck = true,
      ariaLabel,
      extraProps = {},
      snap,
      controller,
      onChange,
    }) {
      const activeSnap = snap || controller.getSnapshot();
      const open = Boolean(dropdownId && activeSnap.openDropdownId === dropdownId);
      const selected = options.find((opt) => opt.value === value);
      const displayLabel = selected ? selected.triggerLabel || selected.label : placeholder || "";

      return h(
        "div",
        {
          className: "dsh-prompts-dropdown",
          "data-dsh-prompts-dropdown": dropdownId,
          "data-full": fullWidth ? "true" : undefined,
          "data-size": size || undefined,
          ...extraProps,
        },
        h(
          "button",
          {
            type: "button",
            className: "dsh-prompts-dropdown-trigger",
            disabled: Boolean(disabled),
            "aria-haspopup": "listbox",
            "aria-expanded": open ? "true" : "false",
            "aria-label": ariaLabel || displayLabel,
            onClick: (event) => {
              event.stopPropagation();
              if (!disabled) {
                controller.toggleDropdown(dropdownId);
              }
            },
          },
          h("span", { className: "dsh-prompts-dropdown-label" }, displayLabel),
          h(
            "svg",
            {
              className: "dsh-prompts-dropdown-chevron",
              "data-open": open ? "true" : "false",
              viewBox: "0 0 16 16",
              fill: "none",
              "aria-hidden": "true",
            },
            h("path", {
              d: "M4 6.5L8 10.5L12 6.5",
              stroke: "currentColor",
              strokeWidth: "1.5",
              strokeLinecap: "round",
              strokeLinejoin: "round",
            })
          )
        ),
        open
          ? h(
              "div",
              {
                className: "dsh-prompts-dropdown-menu",
                "data-align": align,
                role: "listbox",
              },
              options.map((opt) => {
                const isSelected = showCheck && opt.value === value;
                return h(
                  "button",
                  {
                    key: opt.value === "" ? "__empty__" : opt.value,
                    type: "button",
                    className: "dsh-prompts-dropdown-option",
                    role: "option",
                    "aria-selected": isSelected ? "true" : "false",
                    onClick: (event) => {
                      event.stopPropagation();
                      controller.closeDropdown();
                      if (typeof onChange === "function") {
                        onChange(opt.value);
                      }
                    },
                  },
                  h(
                    "span",
                    { className: "dsh-prompts-dropdown-option-text" },
                    h("span", { className: "dsh-prompts-dropdown-option-title" }, opt.label),
                    opt.subLabel
                      ? h("span", { className: "dsh-prompts-dropdown-option-sub" }, opt.subLabel)
                      : null
                  ),
                  isSelected
                    ? h(
                        "span",
                        { className: "dsh-prompts-dropdown-check", "aria-hidden": "true" },
                        "✓"
                      )
                    : null
                );
              })
            )
          : null
      );
    }

    function InlinePromptEditor({ draft, saving, controller, t, embedded = false }) {
      if (!draft) return null;
      const templates = model.getTemplates(t);
      const isEdit = Boolean(draft.id);
      const heading =
        draft.scope === "workspace"
          ? t(isEdit ? "modalEditWorkspace" : "modalAddWorkspace", {
              workspace: draft.workspaceTitle || model.pathBaseName(draft.workspacePath),
            })
          : t(isEdit ? "modalEditGlobal" : "modalAddGlobal");

      const content = [
        !embedded
          ? h(
              "div",
              { key: "head", className: "dsh-prompts-inline-editor-head" },
              h("h4", { className: "dsh-prompts-inline-editor-title" }, heading),
              h(
                "button",
                {
                  type: "button",
                  className: "dsh-prompts-btn",
                  "data-variant": "ghost",
                  "data-size": "sm",
                  onClick: () => controller.closeEditor(),
                },
                t("cancel")
              )
            )
          : null,
        h(
          "div",
          { key: "title-field", className: "dsh-prompts-field" },
          h(
            "div",
            { className: "dsh-prompts-field-label-row" },
            h(
              "label",
              { className: "dsh-prompts-field-label" },
              t("itemTitleLabel"),
              " ",
              h(
                "span",
                { className: "dsh-prompts-field-subhint" },
                `(${draft.includeTitle === true ? t("includeTitleHintOn") : t("includeTitleHintOff")})`
              )
            ),
            h(
              "span",
              {
                className: "dsh-prompts-inline-switch-label",
                onClick: () =>
                  controller.updateEditor({ includeTitle: !(draft.includeTitle === true) }),
              },
              h("span", null, t("includeTitleToggle")),
              h(Switch, {
                size: "sm",
                checked: draft.includeTitle === true,
                label: t("includeTitleToggle"),
                onChange: (next) => controller.updateEditor({ includeTitle: next }),
              })
            )
          ),
          h("input", {
            type: "text",
            className: "dsh-prompts-input",
            value: draft.title,
            placeholder: t("itemTitlePlaceholder"),
            onChange: (event) => controller.updateEditor({ title: event.target.value }),
          })
        ),
        h(
          "div",
          { key: "grid", className: "dsh-prompts-field-grid" },
          h(
            "div",
            { className: "dsh-prompts-field" },
            h("label", { className: "dsh-prompts-field-label" }, t("positionLabel")),
            h(DropdownSelect, {
              dropdownId: `anchor-editor-${draft.id || "new"}`,
              value: draft.position || "suffix",
              fullWidth: true,
              options: [
                { value: "suffix", label: t("positionSuffix") },
                { value: "prefix", label: t("positionPrefix") },
              ],
              controller,
              onChange: (pos) => controller.updateEditor({ position: pos }),
            })
          ),
          h(
            "div",
            { className: "dsh-prompts-field" },
            h("label", { className: "dsh-prompts-field-label" }, t("templatePickerLabel")),
            h(DropdownSelect, {
              dropdownId: `tpl-editor-${draft.id || "new"}`,
              value: "",
              placeholder: t("templatePickerHint"),
              fullWidth: true,
              showCheck: false,
              options: templates.map((tpl) => ({ value: tpl.id, label: tpl.label })),
              controller,
              onChange: (tplId) => {
                const found = templates.find((tpl) => tpl.id === tplId);
                if (found) controller.applyTemplateToEditor(found);
              },
            })
          )
        ),
        h(
          "div",
          { key: "content", className: "dsh-prompts-field" },
          h("label", { className: "dsh-prompts-field-label" }, t("itemContentLabel")),
          h("textarea", {
            className: "dsh-prompts-textarea",
            value: draft.content,
            placeholder: t("itemContentPlaceholder"),
            onChange: (event) => controller.updateEditor({ content: event.target.value }),
          })
        ),
        draft.validationError
          ? h("p", { key: "err", className: "dsh-prompts-error", role: "alert" }, draft.validationError)
          : null,
        h(
          "div",
          {
            key: "foot",
            style: { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 },
          },
          h(
            "button",
            {
              type: "button",
              className: "dsh-prompts-btn",
              onClick: () => controller.closeEditor(),
            },
            t("cancel")
          ),
          h(
            "button",
            {
              type: "button",
              className: "dsh-prompts-btn",
              "data-variant": "primary",
              disabled: saving,
              onClick: () => void controller.saveEditor(t),
            },
            saving ? t("saving") : t("save")
          )
        ),
      ];

      if (embedded) {
        return h("div", { className: "dsh-prompts-row-body" }, content);
      }
      return h("div", { className: "dsh-prompts-inline-editor", "data-inline-editor": draft.scope }, content);
    }

    function PromptRowCard({ item, index, total, scope, workspacePath, workspaceTitle, snap, controller, t }) {
      const isPrefix = item.position === "prefix";
      const isEditingThis = Boolean(snap.editorModal && snap.editorModal.id === item.id);
      const isExpanded = isEditingThis || snap.expandedItemId === item.id;
      const confirmDeleteKey = `delete:${scope}:${item.id}`;
      const isConfirmingDelete = snap.pendingConfirmKey === confirmDeleteKey;

      const onToggleExpand = () => {
        if (isEditingThis) {
          controller.closeEditor();
        } else {
          controller.openEditor({ scope, workspacePath, workspaceTitle, item });
        }
      };

      const onToggleSwitch = (nextEnabled) => {
        void controller.mutate(
          scope === "workspace"
            ? { type: "toggleWorkspaceItem", workspacePath, id: item.id, enabled: nextEnabled }
            : { type: "toggleGlobalItem", id: item.id, enabled: nextEnabled }
        );
      };

      const onMove = (direction) => {
        void controller.mutate(
          scope === "workspace"
            ? { type: "moveWorkspaceItem", workspacePath, id: item.id, direction }
            : { type: "moveGlobalItem", id: item.id, direction }
        );
      };

      const singleLinePreview = String(item.content || "")
        .replace(/\s+/g, " ")
        .trim();

      return h(
        "div",
        {
          className: "dsh-prompts-row-card",
          "data-expanded": isExpanded ? "true" : "false",
          "data-disabled": item.enabled === false ? "true" : "false",
          "data-prompt-id": item.id,
        },
        h(
          "div",
          { className: "dsh-prompts-row-head" },
          h(
            "button",
            {
              type: "button",
              className: "dsh-prompts-row-trigger",
              "aria-expanded": isExpanded ? "true" : "false",
              onClick: onToggleExpand,
            },
            h("span", { className: "dsh-prompts-row-icon" }, `#${index + 1}`),
            h(
              "div",
              { className: "dsh-prompts-row-main" },
              h(
                "div",
                { className: "dsh-prompts-row-title-line" },
                h("span", { className: "dsh-prompts-row-title" }, item.title),
                h(
                  "span",
                  { className: "dsh-prompts-tag", "data-tone": isPrefix ? "default" : "accent" },
                  isPrefix ? t("positionPrefixBadge") : t("positionSuffixBadge")
                ),
                item.includeTitle === true
                  ? h("span", { className: "dsh-prompts-tag" }, t("includeTitleToggle"))
                  : null,
                h(ChevronIcon, { open: isExpanded })
              ),
              h("p", { className: "dsh-prompts-row-desc" }, singleLinePreview)
            )
          ),
          h(
            "div",
            { className: "dsh-prompts-row-end" },
            isConfirmingDelete
              ? h(
                  React.Fragment,
                  null,
                  h(
                    "button",
                    {
                      type: "button",
                      className: "dsh-prompts-btn",
                      "data-variant": "danger",
                      "data-size": "sm",
                      disabled: snap.saving,
                      onClick: () =>
                        void controller.mutate(
                          scope === "workspace"
                            ? { type: "deleteWorkspaceItem", workspacePath, id: item.id }
                            : { type: "deleteGlobalItem", id: item.id }
                        ),
                    },
                    t("confirmOk")
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      className: "dsh-prompts-btn",
                      "data-variant": "ghost",
                      "data-size": "sm",
                      onClick: () => controller.cancelConfirm(),
                    },
                    t("cancel")
                  )
                )
              : h(
                  React.Fragment,
                  null,
                  h(
                    "button",
                    {
                      type: "button",
                      className: "dsh-prompts-btn",
                      "data-variant": "ghost",
                      "data-size": "sm",
                      disabled: snap.saving || index === 0,
                      onClick: () => onMove("up"),
                      title: t("moveUp"),
                    },
                    "↑"
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      className: "dsh-prompts-btn",
                      "data-variant": "ghost",
                      "data-size": "sm",
                      disabled: snap.saving || index >= total - 1,
                      onClick: () => onMove("down"),
                      title: t("moveDown"),
                    },
                    "↓"
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      className: "dsh-prompts-btn",
                      "data-variant": "ghost",
                      "data-size": "sm",
                      disabled: snap.saving,
                      onClick: onToggleExpand,
                    },
                    isExpanded ? t("cancel") : t("edit")
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      className: "dsh-prompts-btn",
                      "data-variant": "ghost",
                      "data-size": "sm",
                      disabled: snap.saving,
                      onClick: () => controller.requestConfirm(confirmDeleteKey),
                    },
                    t("delete")
                  )
                ),
            h(Switch, {
              checked: item.enabled !== false,
              disabled: snap.saving,
              label: item.title,
              onChange: onToggleSwitch,
            })
          )
        ),
        isExpanded
          ? h(InlinePromptEditor, {
              draft: isEditingThis
                ? snap.editorModal
                : {
                    scope,
                    workspacePath,
                    workspaceTitle,
                    id: item.id,
                    title: item.title,
                    content: item.content,
                    includeTitle: item.includeTitle === true,
                    position: item.position,
                    enabled: item.enabled !== false,
                    validationError: "",
                  },
              saving: snap.saving,
              controller,
              t,
              embedded: true,
            })
          : null
      );
    }

    function ScopeActionControls({ scope, workspace, itemCount, snap, controller, t }) {
      const templates = model.getTemplates(t);
      const workspacePath = workspace?.path || "";
      const workspaceTitle = workspace?.title || "";
      const isAddOpen = Boolean(
        snap.editorModal && !snap.editorModal.id && snap.editorModal.scope === scope
      );
      const clearConfirmKey = `clear:${scope}`;
      const isConfirmingClear = snap.pendingConfirmKey === clearConfirmKey;

      const onToggleAdd = () => {
        if (isAddOpen) {
          controller.closeEditor();
        } else {
          controller.openEditor({ scope, workspacePath, workspaceTitle });
        }
      };

      const onTemplateSelect = (tplId) => {
        const found = templates.find((tpl) => tpl.id === tplId);
        if (!found) return;
        controller.openEditor({
          scope,
          workspacePath,
          workspaceTitle,
          defaultTitle: found.title,
          defaultContent: found.content,
          defaultPosition: found.position,
        });
      };

      return h(
        "div",
        { className: "dsh-prompts-actions" },
        h(
          "button",
          {
            type: "button",
            className: "dsh-prompts-btn",
            "data-variant": isAddOpen ? "default" : "primary",
            "data-action": `add-${scope}`,
            disabled: snap.saving || (scope === "workspace" && !workspacePath),
            onClick: onToggleAdd,
          },
          isAddOpen ? t("cancel") : "+ " + t("addPrompt")
        ),
        h(DropdownSelect, {
          dropdownId: `tpl-toolbar-${scope}`,
          value: "",
          placeholder: t("insertTemplate"),
          size: "sm",
          align: "left",
          showCheck: false,
          ariaLabel: t("insertTemplate"),
          disabled: snap.saving || (scope === "workspace" && !workspacePath),
          options: templates.map((tpl) => ({ value: tpl.id, label: tpl.label })),
          snap,
          controller,
          onChange: onTemplateSelect,
        }),
        itemCount > 0
          ? isConfirmingClear
            ? h(
                React.Fragment,
                null,
                h(
                  "button",
                  {
                    type: "button",
                    className: "dsh-prompts-btn",
                    "data-variant": "danger",
                    "data-size": "sm",
                    disabled: snap.saving,
                    onClick: () =>
                      void controller.mutate(
                        scope === "workspace"
                          ? { type: "clearWorkspaceItems", workspacePath }
                          : { type: "clearGlobalItems" }
                      ),
                  },
                  t("confirmOk")
                ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "dsh-prompts-btn",
                    "data-variant": "ghost",
                    "data-size": "sm",
                    onClick: () => controller.cancelConfirm(),
                  },
                  t("cancel")
                )
              )
            : h(
                "button",
                {
                  type: "button",
                  className: "dsh-prompts-btn",
                  "data-variant": "danger",
                  "data-action": `clear-${scope}`,
                  disabled: snap.saving,
                  onClick: () => controller.requestConfirm(clearConfirmKey),
                },
                t("clearAll")
              )
          : null
      );
    }

    function GlobalTabView({ snap, controller, t }) {
      const items = snap.state.globalItems || [];
      const showNewInline = Boolean(
        snap.editorModal && !snap.editorModal.id && snap.editorModal.scope === "global"
      );

      return h(
        "div",
        { className: "dsh-prompts-section" },
        showNewInline
          ? h(InlinePromptEditor, {
              draft: snap.editorModal,
              saving: snap.saving,
              controller,
              t,
              embedded: false,
            })
          : null,
        items.length === 0 && !showNewInline
          ? h("p", { className: "dsh-prompts-empty" }, t("emptyGlobal"))
          : h(
              "div",
              { className: "dsh-prompts-list" },
              items.map((item, index) =>
                h(PromptRowCard, {
                  key: item.id,
                  item,
                  index,
                  total: items.length,
                  scope: "global",
                  workspacePath: "",
                  workspaceTitle: "",
                  snap,
                  controller,
                  t,
                })
              )
            )
      );
    }

    function WorkspaceTabView({ snap, controller, canPickDir, t }) {
      const catalog = snap.workspaceCatalog || [];
      const selected = snap.selectedWorkspace;
      const configuredList = catalog.filter((w) => w.configuredCount > 0);
      const items = selected?.items || [];
      const showNewInline = Boolean(
        snap.editorModal && !snap.editorModal.id && snap.editorModal.scope === "workspace"
      );

      if (catalog.length === 0) {
        return h(
          "div",
          { className: "dsh-prompts-section" },
          h("p", { className: "dsh-prompts-empty" }, t("noWorkspaces")),
          canPickDir
            ? h(
                "div",
                null,
                h(
                  "button",
                  {
                    type: "button",
                    className: "dsh-prompts-btn",
                    onClick: () => void controller.pickAndSelectDirectory(),
                  },
                  t("pickDirectory")
                )
              )
            : null
        );
      }

      const onToggleWorkspaceEnabled = (nextEnabled) => {
        if (!selected) return;
        void controller.mutate({
          type: "setWorkspacePolicy",
          workspacePath: selected.path,
          workspaceId: selected.workspaceId,
          workspaceTitle: selected.title,
          enabled: nextEnabled,
        });
      };

      const onChangeMergeMode = (nextMode) => {
        if (!selected) return;
        void controller.mutate({
          type: "setWorkspacePolicy",
          workspacePath: selected.path,
          workspaceId: selected.workspaceId,
          workspaceTitle: selected.title,
          mergeMode: nextMode,
        });
      };

      return h(
        "div",
        { className: "dsh-prompts-section" },
        h(
          "div",
          { className: "dsh-prompts-ws-card" },
          h(
            "div",
            { className: "dsh-prompts-field-grid" },
            h(
              "div",
              { className: "dsh-prompts-field" },
              h(
                "div",
                { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 } },
                h("label", { className: "dsh-prompts-field-label" }, t("selectWorkspace")),
                selected?.isCurrent
                  ? h("span", { className: "dsh-prompts-tag", "data-tone": "current" }, t("currentSessionBadge"))
                  : null
              ),
              h(
                "div",
                { style: { display: "flex", alignItems: "center", gap: 8 } },
                h(DropdownSelect, {
                  dropdownId: "workspace-select",
                  value: selected?.path || "",
                  fullWidth: true,
                  extraProps: { "data-workspace-select": "" },
                  options: catalog.map((ws) => ({
                    value: ws.path,
                    triggerLabel: `${ws.isCurrent ? "★ " : ""}${ws.title} (${ws.activeCount}/${ws.configuredCount}) — ${ws.path}`,
                    label: `${ws.isCurrent ? "★ " : ""}${ws.title} (${ws.activeCount}/${ws.configuredCount})`,
                    subLabel: ws.path,
                  })),
                  snap,
                  controller,
                  onChange: (nextPath) => controller.selectWorkspace(nextPath),
                }),
                canPickDir
                  ? h(
                      "button",
                      {
                        type: "button",
                        className: "dsh-prompts-btn",
                        onClick: () => void controller.pickAndSelectDirectory(),
                      },
                      t("pickDirectory")
                    )
                  : null
              )
            ),
            selected
              ? h(
                  "div",
                  { className: "dsh-prompts-field" },
                  h("label", { className: "dsh-prompts-field-label" }, t("mergeModeLabel")),
                  h(DropdownSelect, {
                    dropdownId: "workspace-merge-mode",
                    value: selected.mergeMode || "append",
                    fullWidth: true,
                    disabled: snap.saving,
                    extraProps: { "data-merge-mode": "" },
                    options: [
                      { value: "append", label: t("mergeAppend") },
                      { value: "override", label: t("mergeOverride") },
                    ],
                    snap,
                    controller,
                    onChange: onChangeMergeMode,
                  })
                )
              : null
          ),
          configuredList.length > 0
            ? h(
                "div",
                { className: "dsh-prompts-pills" },
                h(
                  "span",
                  { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary)" } },
                  t("configuredWorkspaces") + ":"
                ),
                configuredList.map((ws) =>
                  h(
                    "button",
                    {
                      key: ws.path,
                      type: "button",
                      className: "dsh-prompts-pill",
                      "data-active": ws.path === selected?.path ? "true" : "false",
                      onClick: () => controller.selectWorkspace(ws.path),
                    },
                    `${ws.title} (${ws.activeCount})`,
                    ws.mergeMode === "override"
                      ? h("span", { style: { opacity: 0.85, fontSize: 11 } }, `[${t("mergeOverrideShort")}]`)
                      : null
                  )
                )
              )
            : null,
          selected
            ? h(
                "div",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    paddingTop: 8,
                    borderTop: "0.5px solid var(--dsw-alias-border-l2)",
                  },
                },
                h("span", { style: { fontSize: 13, fontWeight: 500 } }, t("workspaceEnabled")),
                h(Switch, {
                  checked: selected.enabled !== false,
                  disabled: snap.saving,
                  label: t("workspaceEnabled"),
                  onChange: onToggleWorkspaceEnabled,
                })
              )
            : null
        ),
        showNewInline
          ? h(InlinePromptEditor, {
              draft: snap.editorModal,
              saving: snap.saving,
              controller,
              t,
              embedded: false,
            })
          : null,
        items.length === 0 && !showNewInline
          ? h("p", { className: "dsh-prompts-empty" }, t("emptyWorkspace"))
          : h(
              "div",
              { className: "dsh-prompts-list" },
              items.map((item, index) =>
                h(PromptRowCard, {
                  key: item.id,
                  item,
                  index,
                  total: items.length,
                  scope: "workspace",
                  workspacePath: selected?.path || "",
                  workspaceTitle: selected?.title || "",
                  snap,
                  controller,
                  t,
                })
              )
            )
      );
    }

    function PreviewAndOptionsTabView({ snap, controller, t }) {
      const catalog = [...(snap.workspaceCatalog || [])].sort((a, b) =>
        String(a.title || "").localeCompare(String(b.title || ""), undefined, {
          numeric: true,
          sensitivity: "base",
        })
      );
      const preview = snap.preview;
      const state = snap.state;

      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 20 } },
        h(
          "div",
          { className: "dsh-prompts-section" },
          h(
            "div",
            { className: "dsh-prompts-toolbar" },
            h("h4", { className: "dsh-prompts-section-title" }, t("previewScopeLabel")),
            h(DropdownSelect, {
              dropdownId: "preview-workspace",
              value: snap.previewWorkspacePath || "__global__",
              align: "right",
              options: [
                {
                  value: "__global__",
                  label: t("previewGlobalOnly"),
                },
                ...catalog.map((ws) => ({
                  value: ws.path,
                  triggerLabel: `${ws.title} — ${ws.path}`,
                  label: ws.title,
                  subLabel: ws.path,
                })),
              ],
              snap,
              controller,
              onChange: (nextVal) => controller.setPreviewWorkspace(nextVal),
            })
          ),
          h("p", { className: "dsh-prompts-toggle-hint" }, t("previewHint")),
          preview.hasActive
            ? h("pre", { className: "dsh-prompts-pre", "data-preview-envelope": "" }, preview.combinedText)
            : h("p", { className: "dsh-prompts-empty" }, t("previewEmpty"))
        ),
        h(
          "div",
          { className: "dsh-prompts-section" },
          h("h4", { className: "dsh-prompts-section-title" }, t("optionsHeading")),
          h(
            "div",
            { className: "dsh-prompts-toggle-row" },
            h(
              "div",
              { className: "dsh-prompts-toggle-main" },
              h("span", { className: "dsh-prompts-toggle-label" }, t("optShowInSettings"))
            ),
            h(Switch, {
              checked: state.showInSettings !== false,
              disabled: snap.saving,
              label: t("optShowInSettings"),
              onChange: (next) =>
                void controller.mutate({
                  type: "setOptions",
                  showInSettings: next,
                }),
            })
          ),
          h(
            "div",
            { className: "dsh-prompts-toggle-row" },
            h(
              "div",
              { className: "dsh-prompts-toggle-main" },
              h("span", { className: "dsh-prompts-toggle-label" }, t("optShowInSidebar"))
            ),
            h(Switch, {
              checked: state.showInSidebar === true,
              disabled: snap.saving,
              label: t("optShowInSidebar"),
              onChange: (next) =>
                void controller.mutate({
                  type: "setOptions",
                  showInSidebar: next,
                }),
            })
          )
        )
      );
    }

    function PromptsManagerView({ variant = "settings", controller, ctx, propT, canPickDir }) {
      ensureStyleTag();
      const snap = useControllerState(controller);
      const t = createTranslator(ctx, propT);
      const summary = snap.summary;
      const isBundleView = variant === "bundle";

      return h(
        "section",
        {
          className: "dsh-prompts-root",
          "data-variant": variant,
          "aria-label": t("title"),
        },
        !isBundleView
          ? h(
              "div",
              { className: "dsh-prompts-page-head" },
              h(
                "div",
                { style: { flex: 1, minWidth: 240 } },
                h("h2", { className: "dsh-prompts-page-title" }, t("title")),
                h("p", { className: "dsh-prompts-page-intro" }, t("description"))
              )
            )
          : null,
        h(
          "div",
          { className: "dsh-prompts-toggle-row" },
          h(
            "div",
            { className: "dsh-prompts-toggle-main" },
            h(
              "span",
              { className: "dsh-prompts-toggle-label" },
              h("span", {
                className: "dsh-prompts-live-dot",
                "data-off": snap.state.enabled === false ? "true" : "false",
              }),
              h("span", null, t("masterToggle"))
            ),
            h("p", { className: "dsh-prompts-toggle-hint" }, t("liveBadge"))
          ),
          h(Switch, {
            checked: snap.state.enabled !== false,
            disabled: snap.saving,
            label: t("masterToggle"),
            onChange: (next) =>
              void controller.mutate({
                type: "setOptions",
                enabled: next,
              }),
          })
        ),
        snap.error
          ? h("p", { className: "dsh-prompts-error", role: "alert" }, snap.error)
          : null,
        h(
          "div",
          { className: "dsh-prompts-nav-bar" },
          h(
            "div",
            { className: "dsh-prompts-capsule-tabs", role: "tablist" },
            h(
              "button",
              {
                type: "button",
                role: "tab",
                className: "dsh-prompts-capsule-tab",
                "data-tab": "global",
                "data-active": snap.activeTab === "global" ? "true" : "false",
                "aria-selected": snap.activeTab === "global",
                onClick: () => controller.setTab("global"),
              },
              t("tabGlobal", { count: summary.globalCount })
            ),
            h(
              "button",
              {
                type: "button",
                role: "tab",
                className: "dsh-prompts-capsule-tab",
                "data-tab": "workspace",
                "data-active": snap.activeTab === "workspace" ? "true" : "false",
                "aria-selected": snap.activeTab === "workspace",
                onClick: () => controller.setTab("workspace"),
              },
              t("tabWorkspace", { count: summary.workspaceCount })
            ),
            h(
              "button",
              {
                type: "button",
                role: "tab",
                className: "dsh-prompts-capsule-tab",
                "data-tab": "preview",
                "data-active": snap.activeTab === "preview" ? "true" : "false",
                "aria-selected": snap.activeTab === "preview",
                onClick: () => controller.setTab("preview"),
              },
              t("tabPreview")
            )
          ),
          snap.activeTab === "global"
            ? h(ScopeActionControls, {
                scope: "global",
                workspace: null,
                itemCount: (snap.state.globalItems || []).length,
                snap,
                controller,
                t,
              })
            : snap.activeTab === "workspace"
              ? h(ScopeActionControls, {
                  scope: "workspace",
                  workspace: snap.selectedWorkspace,
                  itemCount: (snap.selectedWorkspace?.items || []).length,
                  snap,
                  controller,
                  t,
                })
              : null
        ),
        snap.activeTab === "global"
          ? h(GlobalTabView, { snap, controller, t })
          : snap.activeTab === "workspace"
            ? h(WorkspaceTabView, { snap, controller, canPickDir, t })
            : h(PreviewAndOptionsTabView, { snap, controller, t })
      );
    }

    function apply(ctx, options = {}) {
      const controller = createController(options);
      let canPickDir = false;

      ctx.effect(
        () => ctx.locale.register(NS, { zh: locales.zh, en: locales.en }),
        "dsh-prompts: zh/en dictionaries"
      );
      for (const id of ["de", "fr", "es", "ja", "ko", "pt"]) {
        ctx.effect(
          () => ctx.locale.register(NS, id, locales[id]),
          `dsh-prompts: ${id} dictionary`
        );
      }

      const t = createTranslator(ctx);

      const renderSummary = (props) => {
        const localT = createTranslator(ctx, props?.t);
        const summary = controller.getSnapshot().summary;
        return localT("bundleSummary", {
          status: localT(summary.enabled ? "statusEnabled" : "statusDisabled"),
          globalCount: summary.globalCount,
          workspaceCount: summary.workspaceCount,
        });
      };

      const BundleSlotComponent = (props) => {
        if (props?.view === "summary") {
          return renderSummary(props);
        }
        return h(PromptsManagerView, {
          variant: "bundle",
          controller,
          ctx,
          propT: props?.t,
          canPickDir,
        });
      };

      const SettingsSlotComponent = (props) =>
        h(PromptsManagerView, {
          variant: "settings",
          controller,
          ctx,
          propT: props?.t,
          canPickDir,
        });

      const MainPanelSlotComponent = (props) =>
        h(PromptsManagerView, {
          variant: "main",
          controller,
          ctx,
          propT: props?.t,
          canPickDir,
        });

      ctx.slots.inject("plugins.bundle.config", () =>
        ctx.slots.register(
          {
            name: "plugins.bundle.config",
            key: BUNDLE_KEY,
            locale: NS,
            inject: () => ({}),
          },
          BundleSlotComponent
        )
      );

      ctx.slots.inject("plugins.row.config", () =>
        ctx.slots.register(
          {
            name: "plugins.row.config",
            key: ROW_KEY,
            locale: NS,
            inject: () => ({}),
          },
          BundleSlotComponent
        )
      );

      ctx.slots.inject("main", () =>
        ctx.slots.register(
          {
            name: "main",
            key: PANEL_ID,
            locale: NS,
            inject: () => ({}),
          },
          MainPanelSlotComponent
        )
      );

      let disposeSettingsSection = null;
      let disposeSidebarPanel = null;

      const syncDynamicSlots = () => {
        const snap = controller.getSnapshot();
        const wantSettings = snap.state.showInSettings !== false;
        const wantSidebar = snap.state.showInSidebar === true;

        if (wantSettings && !disposeSettingsSection) {
          disposeSettingsSection = ctx.slots.inject("settings.section", () =>
            ctx.slots.register(
              {
                name: "settings.section",
                id: SECTION_ID,
                order: 22,
                locale: NS,
                label: () => t("navTitle"),
                inject: () => ({}),
              },
              SettingsSlotComponent
            )
          );
        } else if (!wantSettings && disposeSettingsSection) {
          try {
            disposeSettingsSection();
          } catch {
            // Ignore disposal error.
          }
          disposeSettingsSection = null;
        }

        if (wantSidebar && !disposeSidebarPanel) {
          disposeSidebarPanel = ctx.slots.inject("sidebar.panellist", () =>
            ctx.slots.register(
              {
                name: "sidebar.panellist",
                id: PANEL_ID,
                order: 26,
                locale: NS,
                label: () => t("navTitle"),
              },
              SidebarPromptIcon
            )
          );
        } else if (!wantSidebar && disposeSidebarPanel) {
          try {
            disposeSidebarPanel();
          } catch {
            // Ignore disposal error.
          }
          disposeSidebarPanel = null;
        }
      };

      syncDynamicSlots();
      const offState = controller.onStateChange(() => syncDynamicSlots());

      let activeLocale = ctx.locale?.getSnapshot?.()?.active;
      const offLocale =
        typeof ctx.locale?.subscribe === "function"
          ? ctx.locale.subscribe(() => {
              const next = ctx.locale.getSnapshot()?.active;
              if (next !== activeLocale) {
                activeLocale = next;
                if (disposeSettingsSection) {
                  try {
                    disposeSettingsSection();
                  } catch {
                    // Ignore.
                  }
                  disposeSettingsSection = null;
                }
                if (disposeSidebarPanel) {
                  try {
                    disposeSidebarPanel();
                  } catch {
                    // Ignore.
                  }
                  disposeSidebarPanel = null;
                }
                syncDynamicSlots();
                controller.sync();
              }
            })
          : () => {};

      const offNavIcon = installPromptsNavIcon(() => [t("navTitle")]);

      if (typeof ctx.inject === "function") {
        ctx.inject(["workspaces", "sessions"], (scope) => {
          const offWs =
            typeof scope.workspaces?.list?.subscribe === "function"
              ? scope.workspaces.list.subscribe(() => controller.sync())
              : () => {};
          const offSessions =
            typeof scope.sessions?.list?.subscribe === "function"
              ? scope.sessions.list.subscribe(() => controller.sync())
              : () => {};
          controller.attach({
            workspaces: scope.workspaces,
            sessions: scope.sessions,
          });
          return () => {
            offWs();
            offSessions();
            controller.detach(["workspaces", "sessions"]);
          };
        });

        ctx.inject(["uiWorkspace"], (scope) => {
          canPickDir = typeof scope.uiWorkspace?.pickDirectory === "function";
          controller.attach({
            uiWorkspace: scope.uiWorkspace,
          });
          return () => {
            canPickDir = false;
            controller.detach(["uiWorkspace"]);
          };
        });
      }

      void controller.load();

      ctx.effect(
        () => () => {
          offState();
          offLocale();
          offNavIcon();
          if (disposeSettingsSection) {
            try {
              disposeSettingsSection();
            } catch {
              // Ignore.
            }
            disposeSettingsSection = null;
          }
          if (disposeSidebarPanel) {
            try {
              disposeSidebarPanel();
            } catch {
              // Ignore.
            }
            disposeSidebarPanel = null;
          }
        },
        "dsh-prompts: client lifecycle"
      );

      return controller;
    }

    return {
      apply,
      createController,
      inject: ["slots", "locale"],
    };
  },
});
