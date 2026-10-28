#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkillCatalog } from "../lib/catalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, "..");
const CLIENT_JS_PATH = join(PLUGIN_ROOT, "lib", "client.js");

const ZH_SUMMARIES = {
  // engineering (20)
  "ask-matt": "技能路由器：根据当前场景推荐最匹配的技能组合与阶段边界决策",
  "code-review": "双子代理并发审查：沿「编码规范与坏味道」与「规格符合度」双轴独立出报告",
  "codebase-design": "深模块架构设计词汇表：基于 module、interface、seam、leverage 设计模块边界",
  "diagnosing-bugs": "紧反馈闭环 Bug 诊断：先建立稳定复现红灯命令，再定位根因并补回归测试",
  "domain-modeling": "领域建模与通用语言：提炼 Glossary 术语表并将不可逆架构决策沉淀为 ADR",
  "grill-with-docs": "结合 grilling 与领域建模对方案进行极限采访，并将决策树结论落盘至文档",
  implement: "单票或规格实施：在预定接缝处驱动 /tdd 开发，并在完成后执行 /code-review",
  "implement-spec": "多票规格并发实施：将 Tickets 视为任务图，沿就绪 Frontier 推进并合入集成干线",
  "improve-codebase-architecture": "扫描代码库浅模块摩擦点，生成可视化 HTML 架构深化报告并逐项采访",
  pr: "高信噪比 PR 描述生成：最小可视化证明、前后对比证据与单向/双向门风险标注",
  prototype: "低成本抛弃型原型：用独立 HTML 状态机或 UI 原型快速验证业务与交互假设",
  research: "一手信源深度调研：派发后台代理核查官方文档、源码与标准并输出带引用的报告",
  retro: "会话复盘与环境改进：将会话中的机械性失误转化为确定性检查或审查规则",
  "setup-matt-pocock-skills": "初始化仓库技能配置：引导配置 Issue Tracker、Triage 标签词表与领域文档结构",
  tdd: "基于深模块接缝 (Seam) 的红-绿-重构测试驱动开发（含 mocking.md、tests.md）",
  "to-spec": "将采访与设计结论收敛为结构化、无歧义的技术规格书 (Spec)",
  "to-tickets": "将技术规格拆解为带阻塞依赖边的 Tracer-Bullet 纵向切片工单",
  triage: "Issue 与 PR 五态分诊流水线：复现核验、按需采访并输出 Agent Brief 或超纲归档",
  wayfinder: "超大型模糊工程领航：在 Issue Tracker 上维护共享决策地图，逐票消除战争迷雾",
  wizard: "人工操作交互式向导生成：将第三方后台配置与密钥录入生成为交互式 Bash 脚本",
  // productivity (7)
  "grill-me": "无状态极限采访入口：调用 grilling 沿决策树逐轮追问，适合无仓库纯方案推演",
  grilling: "核心采访引擎：沿 Design Tree 决策树逐轮消除假设，代码库事实由代理自行查证",
  handoff: "跨会话/跨目录交接文档生成：输出高密度上下文指针，零损耗迁移当前进展",
  teach: "多会话苏格拉底式渐进教学：维护学习档案、术语表与实战任务卡",
  "to-questionnaire": "反向结构化问卷生成：针对外部协作者或业务方生成高信噪比待确认问题单",
  "wait-what": "实时反问与术语纠偏：用平实语言与项目 Glossary 重新解释刚才未讲清的上下文",
  "writing-for-agents": "面向 Agent 的文档与技能写作指南：指针优先、精简上下文负载与调用机制拆分",
  // in-progress (7)
  "chief-of-staff": "多线作战幕僚长：在长周期会话中统筹子代理、定时调度与持久化 Wiki 知识库",
  "claude-handoff": "一键后台交接：生成当前会话摘要并立即唤醒后台子代理继续推进",
  "loop-me": "个人与团队循环工作流采访：识别高频重复事务并沉淀为自动化 Workflow 规格",
  "setup-ts-deep-modules": "TypeScript 深模块架构门禁：接入 dependency-cruiser 强制包入口边界并禁止深层导入",
  "writing-beats": "长文写作第一阶段（Beats）：采访确立论点节拍与叙事骨架",
  "writing-fragments": "长文写作第二阶段（Fragments）：将节拍扩展为高信息密度的段落碎片",
  "writing-shape": "长文写作第三阶段（Shape）：收束结构、打磨节奏并消除 AI 腔调",
  // misc (4)
  "git-guardrails-claude-code": "危险 Git 命令拦截护栏：拦截 push、reset --hard、clean -f 等破坏性操作",
  "migrate-to-shoehorn": "测试断言迁移：将测试中的 as any 类型强转平滑迁移至 @total-typescript/shoehorn",
  "scaffold-exercises": "教程练习题脚手架：将完整示例代码自动拆分为 problem 与 solution 练习对",
  "setup-pre-commit": "代码提交门禁配置：一键配置 Husky + lint-staged + TypeScript 类型检查钩子",
};

const SKILL_SUBCATEGORY = {
  // 1. interview-domain (采访与建模 - 6)
  "grill-with-docs": "interview-domain",
  "domain-modeling": "interview-domain",
  "grill-me": "interview-domain",
  grilling: "interview-domain",
  "to-questionnaire": "interview-domain",
  "wait-what": "interview-domain",
  // 2. arch-prototype (架构与原型 - 5)
  "codebase-design": "arch-prototype",
  "improve-codebase-architecture": "arch-prototype",
  prototype: "arch-prototype",
  research: "arch-prototype",
  "setup-ts-deep-modules": "arch-prototype",
  // 3. spec-planning (规格与领航 - 5)
  "ask-matt": "spec-planning",
  "to-spec": "spec-planning",
  "to-tickets": "spec-planning",
  triage: "spec-planning",
  wayfinder: "spec-planning",
  // 4. tdd-impl (TDD 与实施 - 5)
  tdd: "tdd-impl",
  implement: "tdd-impl",
  "implement-spec": "tdd-impl",
  "diagnosing-bugs": "tdd-impl",
  "migrate-to-shoehorn": "tdd-impl",
  // 5. review-quality (审查与门禁 - 5)
  "code-review": "review-quality",
  pr: "review-quality",
  retro: "review-quality",
  "git-guardrails-claude-code": "review-quality",
  "setup-pre-commit": "review-quality",
  // 6. handoff-ops (交接与自动化 - 6)
  handoff: "handoff-ops",
  "claude-handoff": "handoff-ops",
  "chief-of-staff": "handoff-ops",
  "loop-me": "handoff-ops",
  wizard: "handoff-ops",
  "setup-matt-pocock-skills": "handoff-ops",
  // 7. teach-writing (教学与写作 - 6)
  teach: "teach-writing",
  "writing-for-agents": "teach-writing",
  "scaffold-exercises": "teach-writing",
  "writing-beats": "teach-writing",
  "writing-fragments": "teach-writing",
  "writing-shape": "teach-writing",
};

const SUBCATEGORY_META = {
  "interview-domain": { zh: "采访与建模", en: "Interview & Domain" },
  "arch-prototype": { zh: "架构与原型", en: "Arch & Prototype" },
  "spec-planning": { zh: "规格与领航", en: "Specs & Planning" },
  "tdd-impl": { zh: "TDD 与实施", en: "TDD & Build" },
  "review-quality": { zh: "审查与门禁", en: "Review & Guardrails" },
  "handoff-ops": { zh: "交接与自动化", en: "Handoff & Ops" },
  "teach-writing": { zh: "教学与写作", en: "Teach & Writing" },
};

const LEADING_WORDS = {
  "ask-matt": ["main flow", "on-ramps", "phase boundary", "smart zone"],
  "code-review": ["two-axis review", "Standards", "Spec", "Fowler code smells"],
  "codebase-design": ["deep module", "interface", "seam", "adapter", "leverage", "locality"],
  "diagnosing-bugs": ["tight feedback loop", "reproducer", "regression test", "bisect"],
  "domain-modeling": ["ubiquitous language", "GLOSSARY.md", "ADR", "bounded context"],
  "grill-with-docs": ["design tree", "ubiquitous language", "grilling", "domain-modeling"],
  implement: ["pre-agreed seams", "tdd", "code-review"],
  "implement-spec": ["task graph", "frontier", "integration branch", "implementer subagents"],
  "improve-codebase-architecture": ["deepening opportunities", "deletion test", "shallow modules", "locality"],
  pr: ["one-way door", "two-way door", "before/after evidence"],
  prototype: ["throwaway program", "shareable demo", "pure reducer", "state machine"],
  research: ["primary sources", "background agent", "citations"],
  retro: ["context pressure", "navigation pointer", "guardrail", "mechanical vs judgement"],
  "setup-matt-pocock-skills": ["issue tracker", "triage labels", "GLOSSARY.md", "docs/adr"],
  tdd: ["red-green-refactor", "seam", "tracer bullet", "boundary mocking"],
  "to-spec": ["specification", "ubiquitous language", "seam", "acceptance criteria"],
  "to-tickets": ["tracer-bullet tickets", "blocking edges", "vertical slices"],
  triage: ["needs-triage", "ready-for-agent", "agent brief", ".out-of-scope"],
  wayfinder: ["fog of war", "decision tickets", "frontier", "wayfinder:map"],
  wizard: ["human-in-the-loop", "interactive bash script", "provisioning"],
  "grill-me": ["relentless interview", "grilling", "design tree"],
  grilling: ["design tree", "frontier", "rounds", "recommended answer"],
  handoff: ["context pointers", "primary source", "portable markdown"],
  teach: ["Socratic", "mission", "learning record", "glossary"],
  "to-questionnaire": ["questionnaire", "information gap", "stakeholder"],
  "wait-what": ["plain English", "GLOSSARY.md", "re-pitch"],
  "writing-for-agents": ["context pointer", "leading words", "context load", "router skill"],
  "chief-of-staff": ["tactical vs strategic", "context pointers", "wiki", "pit of success"],
  "claude-handoff": ["handoff summary", "background agent", "suggested skills"],
  "loop-me": ["loop lens", "workflow spec", "trigger", "checkpoint", "push right"],
  "setup-ts-deep-modules": ["deep module", "entry-point boundary", "dependency-cruiser"],
  "writing-beats": ["beats", "argument spine", "narrative arc"],
  "writing-fragments": ["fragments", "raw material", "voice"],
  "writing-shape": ["shape", "rhythm", "transitions"],
  "git-guardrails-claude-code": ["PreToolUse", "block-dangerous-git.sh", "guardrails"],
  "migrate-to-shoehorn": ["shoehorn", "fromPartial", "type-safe test data"],
  "scaffold-exercises": ["problem", "solution", "exercise pairs"],
  "setup-pre-commit": ["husky", "lint-staged", "pre-commit"],
};

const catalog = loadSkillCatalog().map((s) => {
  const subCategory = SKILL_SUBCATEGORY[s.name] || "spec-planning";
  const subMeta = SUBCATEGORY_META[subCategory];
  return {
    name: s.name,
    bucket: s.bucket,
    subCategory,
    subCategoryZh: subMeta.zh,
    subCategoryEn: subMeta.en,
    userOnly: !s.invocation.modelInvocable,
    descriptionEn: s.description,
    descriptionZh: ZH_SUMMARIES[s.name] || s.description,
    supportingFiles: s.supportingFiles,
    leadingWords: LEADING_WORDS[s.name] || [],
    content: s.content,
  };
});

const clientSource = `// Generated by scripts/build-client.mjs — do not edit embedded catalog by hand.
window.__ModuleLoader__.load({
  id: "dsh-mattpocock-skills",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");
    const { jsx, jsxs } = require("react/jsx-runtime");

    function createSnapshotStore(initialValue) {
      let current = initialValue;
      const listeners = new Set();
      return {
        getSnapshot() {
          return current;
        },
        set(next) {
          current = next;
          for (const listener of Array.from(listeners)) {
            listener();
          }
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
    }

    const SETTINGS_NS = "mattpocock-skills";
    const LOCALE_NS = "settings.mattpocock-skills";
    const inject = ["slots", "locale", "configForms"];

    const SKILL_CATALOG = ${JSON.stringify(catalog, null, 2)};

    const BUCKETS = [
      {
        id: "engineering",
        field: "enableEngineering",
        count: 20,
        titleZh: "Engineering · 核心工程",
        titleEn: "Engineering · Core",
        descZh: "覆盖需求对齐 (/grill-with-docs)、领域建模、深模块架构、接缝驱动 TDD、双轴代码审查、Bug 诊断与拆单实施全链路。",
        descEn: "Covers requirement grilling (/grill-with-docs), domain modeling, deep modules, seam TDD, two-axis code review, bug diagnosis, and ticketed delivery.",
      },
      {
        id: "productivity",
        field: "enableProductivity",
        count: 7,
        titleZh: "Productivity · 通用生产力",
        titleEn: "Productivity · General",
        descZh: "覆盖极限采访 (/grill-me)、跨会话交接 (/handoff)、苏格拉底教学 (/teach)、结构化问卷、反问纠偏 (/wait-what) 与 Agent 文档写作。",
        descEn: "Covers relentless interviewing (/grill-me), session handoffs (/handoff), Socratic teaching (/teach), questionnaires, /wait-what, and writing for agents.",
      },
      {
        id: "in-progress",
        field: "enableInProgress",
        count: 7,
        titleZh: "In-Progress · 演进实验",
        titleEn: "In-Progress · Experimental",
        descZh: "包含多线幕僚长 (/chief-of-staff)、双轨循环对撞 (/loop-me)、TS 深模块门禁 (/setup-ts-deep-modules) 与三阶段长文写作。",
        descEn: "Includes /chief-of-staff, /loop-me workflow design, /setup-ts-deep-modules boundary linting, and three-stage writing skills.",
      },
      {
        id: "misc",
        field: "enableMisc",
        count: 4,
        titleZh: "Misc · 工具栈扩展",
        titleEn: "Misc · Stack Extensions",
        descZh: "包含危险 Git 命令拦截脚本、Husky Pre-commit 配置、测试断言 Shoehorn 迁移与练习题挖空脚手架生成。",
        descEn: "Includes destructive Git command guardrails, Husky pre-commit setup, Shoehorn test migration, and exercise scaffolding.",
      },
    ];

    const SUBCATEGORIES = [
      { id: "interview-domain", labelZh: "采访与建模", labelEn: "Interview & Domain" },
      { id: "arch-prototype", labelZh: "架构与原型", labelEn: "Arch & Prototype" },
      { id: "spec-planning", labelZh: "规格与领航", labelEn: "Specs & Planning" },
      { id: "tdd-impl", labelZh: "TDD 与实施", labelEn: "TDD & Build" },
      { id: "review-quality", labelZh: "审查与门禁", labelEn: "Review & Guardrails" },
      { id: "handoff-ops", labelZh: "交接与自动化", labelEn: "Handoff & Ops" },
      { id: "teach-writing", labelZh: "教学与写作", labelEn: "Teach & Writing" },
    ];

    const DEFAULT_VALUES = {
      enableEngineering: true,
      enableProductivity: true,
      enableInProgress: false,
      enableMisc: false,
      linkToDshSkills: true,
      disabledSkills: [],
    };

    const zh = {
      title: "Matt Pocock 工程与生产力技能集",
      description: "移植 27 个核心工程与生产力技能与 11 个可选扩展技能，支持自动同步软链至 ~/.dsh/skills。",
      statusLinked: "已同步 ~/.dsh/skills",
      statusBundledOnly: "仅内置模式",
      overriddenTag: "已自定义",
      resetDefaults: "恢复默认",
      syncSectionTitle: "全局目录同步",
      syncTitle: "同步软链接至 ~/.dsh/skills",
      syncDesc: "开启后，自动在 ~/.dsh/skills 下维护已启用技能的受管软链，绝不触碰你自有的技能目录。",
      bucketSectionTitle: "技能分桶开关",
      bucketSectionHint: "默认开启 27 个核心技能，11 个演进与扩展技能可按需开启",
      skillCountSuffix: " 技能",
      directorySectionTitle: "技能明细与原版指令预览",
      tabAll: "全部 (38)",
      tabEngineering: "核心工程 (20)",
      tabProductivity: "生产力 (7)",
      tabExtensions: "扩展 (11)",
      searchPlaceholder: "搜索技能名称、/命令、触发方式（如：自动加载）或场景标签...",
      filterTriggerLabel: "触发与状态",
      filterSubcatLabel: "二级场景（多选）",
      filterClear: "清空筛选",
      badgeUserCommand: "用户命令",
      badgeAutoLoad: "自动加载",
      badgeEnabled: "已启用",
      badgeDisabled: "未启用",
      badgeExperimental: "演进实验",
      badgeMisc: "工具扩展",
      previewOpen: "预览 ▾",
      previewClose: "收起 ▴",
      promptLabel: "English Original Prompt",
      supportingFilesLabel: "附属文件",
      leadingWordsLabel: "Leading Words",
      emptySearch: "没有匹配的技能，请尝试清空多选标签或更换搜索关键词。",
      readOnly: "当前部署下设置只读。",
      bucketDisabledHint: "（开启上方所属分桶后生效）",
    };

    const en = {
      title: "Matt Pocock Engineering & Productivity Skills",
      description: "Port of 27 core engineering & productivity skills and 11 optional extensions, with automatic ~/.dsh/skills symlink sync.",
      statusLinked: "Synced to ~/.dsh/skills",
      statusBundledOnly: "Bundled mode only",
      overriddenTag: "Customized",
      resetDefaults: "Reset defaults",
      syncSectionTitle: "Global Directory Sync",
      syncTitle: "Sync symlinks to ~/.dsh/skills",
      syncDesc: "When enabled, automatically maintains managed symlinks for active skills under ~/.dsh/skills without touching user-owned skills.",
      bucketSectionTitle: "Skill Buckets",
      bucketSectionHint: "27 core skills enabled by default; 11 experimental & stack skills available on demand",
      skillCountSuffix: " skills",
      directorySectionTitle: "Skill Directory & Original Prompt Preview",
      tabAll: "All (38)",
      tabEngineering: "Engineering (20)",
      tabProductivity: "Productivity (7)",
      tabExtensions: "Extensions (11)",
      searchPlaceholder: "Search skill name, /command, trigger mode, or sub-category...",
      filterTriggerLabel: "Trigger & State",
      filterSubcatLabel: "Sub-categories (Multi)",
      filterClear: "Clear filters",
      badgeUserCommand: "User command",
      badgeAutoLoad: "Auto-loaded",
      badgeEnabled: "Enabled",
      badgeDisabled: "Disabled",
      badgeExperimental: "In-Progress",
      badgeMisc: "Misc",
      previewOpen: "Preview ▾",
      previewClose: "Hide ▴",
      promptLabel: "English Original Prompt",
      supportingFilesLabel: "Supporting files",
      leadingWordsLabel: "Leading Words",
      emptySearch: "No matching skills found. Try clearing multi-select tags or changing the search keyword.",
      readOnly: "Settings are read-only in this deployment.",
      bucketDisabledHint: " (enable its bucket above to activate)",
    };

    function readValues(scope) {
      const v = scope.getSnapshot().value;
      return {
        enableEngineering:
          typeof v?.enableEngineering === "boolean"
            ? v.enableEngineering
            : DEFAULT_VALUES.enableEngineering,
        enableProductivity:
          typeof v?.enableProductivity === "boolean"
            ? v.enableProductivity
            : DEFAULT_VALUES.enableProductivity,
        enableInProgress:
          typeof v?.enableInProgress === "boolean"
            ? v.enableInProgress
            : DEFAULT_VALUES.enableInProgress,
        enableMisc:
          typeof v?.enableMisc === "boolean" ? v.enableMisc : DEFAULT_VALUES.enableMisc,
        linkToDshSkills:
          typeof v?.linkToDshSkills === "boolean"
            ? v.linkToDshSkills
            : DEFAULT_VALUES.linkToDshSkills,
        disabledSkills: Array.isArray(v?.disabledSkills)
          ? v.disabledSkills.filter((x) => typeof x === "string")
          : DEFAULT_VALUES.disabledSkills,
      };
    }

    function isCustomizedValues(values) {
      return (
        values.enableEngineering !== DEFAULT_VALUES.enableEngineering ||
        values.enableProductivity !== DEFAULT_VALUES.enableProductivity ||
        values.enableInProgress !== DEFAULT_VALUES.enableInProgress ||
        values.enableMisc !== DEFAULT_VALUES.enableMisc ||
        values.linkToDshSkills !== DEFAULT_VALUES.linkToDshSkills ||
        values.disabledSkills.length > 0
      );
    }

    function computeEnabledCount(values) {
      const disabledSet = new Set(values.disabledSkills);
      let count = 0;
      for (const skill of SKILL_CATALOG) {
        const bucketOn =
          (skill.bucket === "engineering" && values.enableEngineering) ||
          (skill.bucket === "productivity" && values.enableProductivity) ||
          (skill.bucket === "in-progress" && values.enableInProgress) ||
          (skill.bucket === "misc" && values.enableMisc);
        if (bucketOn && !disabledSet.has(skill.name)) {
          count += 1;
        }
      }
      return count;
    }

    class MattPocockSkillsController {
      constructor(scope) {
        this.scope = scope;
        this.optimistic = {};
        this.saving = false;
        this.store = createSnapshotStore(this.projection());
        this.unsubscribe = this.scope.subscribe(() => {
          this.optimistic = {};
          this.publish();
        });
      }

      currentValues() {
        return {
          ...readValues(this.scope),
          ...this.optimistic,
        };
      }

      projection() {
        const snap = this.scope.getSnapshot();
        const values = this.currentValues();
        return {
          available: snap.status === "ready",
          writable: snap.writable,
          saving: this.saving,
          values,
          customized: isCustomizedValues(values),
          enabledCount: computeEnabledCount(values),
          totalCount: SKILL_CATALOG.length,
        };
      }

      publish() {
        this.store.set(this.projection());
      }

      async setField(field, value) {
        this.optimistic = { ...this.optimistic, [field]: value };
        this.saving = true;
        this.publish();
        try {
          await this.scope.set(field, value);
        } finally {
          this.saving = false;
          this.publish();
        }
      }

      async toggleSkill(skillName) {
        const values = this.currentValues();
        const current = new Set(values.disabledSkills);
        if (current.has(skillName)) {
          current.delete(skillName);
        } else {
          current.add(skillName);
        }
        await this.setField("disabledSkills", Array.from(current));
      }

      async resetDefaults() {
        this.optimistic = { ...DEFAULT_VALUES };
        this.saving = true;
        this.publish();
        try {
          for (const key of Object.keys(DEFAULT_VALUES)) {
            await this.scope.set(key, DEFAULT_VALUES[key]);
          }
        } finally {
          this.saving = false;
          this.publish();
        }
      }

      inject() {
        return {
          setField: (field, value) => this.setField(field, value),
          toggleSkill: (skillName) => this.toggleSkill(skillName),
          resetDefaults: () => this.resetDefaults(),
          hooks: { mpSkillsCard: this.store },
        };
      }
    }

    // Official DSH Switch sizing (36x20) & 3-Color Palette
    function Switch({ checked, disabled, onChange, ariaLabel }) {
      return jsx("button", {
        type: "button",
        role: "switch",
        "aria-checked": Boolean(checked),
        "aria-label": ariaLabel,
        disabled: Boolean(disabled),
        onClick: () => {
          if (!disabled && typeof onChange === "function") {
            onChange(!checked);
          }
        },
        style: {
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          width: 36,
          height: 20,
          padding: 2,
          borderRadius: 10,
          border: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.45 : 1,
          background: checked
            ? "var(--dsw-alias-brand-primary, var(--dsw-alias-state-business-primary, #4D6BFE))"
            : "var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l2, #2F3440))",
          transition: "background 0.16s ease",
          flexShrink: 0,
        },
        children: jsx("span", {
          style: {
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "#FFFFFF",
            transform: checked ? "translateX(16px)" : "translateX(0px)",
            transition: "transform 0.16s ease",
          },
        }),
      });
    }

    function SearchGlyph() {
      return jsx("svg", {
        width: 14,
        height: 14,
        viewBox: "0 0 16 16",
        fill: "none",
        "aria-hidden": true,
        style: { flexShrink: 0, color: "var(--dsw-alias-label-tertiary, #78808F)" },
        children: jsx("path", {
          d: "M7.25 2.5a4.75 4.75 0 1 0 3.016 8.423l2.655 2.656a.625.625 0 1 0 .884-.884l-2.656-2.655A4.75 4.75 0 0 0 7.25 2.5ZM3.75 7.25a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0Z",
          fill: "currentColor",
        }),
      });
    }

    function MattPocockSkillsConfig(props) {
      const state = props.useMpSkillsCard((s) => s);
      const t = props.t;
      if (props.view === "summary") {
        const syncText = state.values.linkToDshSkills ? t("statusLinked") : t("statusBundledOnly");
        return \`\${state.enabledCount} / \${state.totalCount}\${t("skillCountSuffix")} · \${syncText}\`;
      }
      return jsx(MattPocockSkillsPanel, { ...props, state });
    }

    function toggleInArray(arr, item) {
      return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
    }

    function MattPocockSkillsPanel(props) {
      const { t, state } = props;
      const [activeTab, setActiveTab] = React.useState("all");
      const [searchQuery, setSearchQuery] = React.useState("");
      const [selectedTriggers, setSelectedTriggers] = React.useState([]);
      const [selectedStates, setSelectedStates] = React.useState([]);
      const [selectedSubcats, setSelectedSubcats] = React.useState([]);
      const [expandedSkill, setExpandedSkill] = React.useState(null);
      const sectionRef = React.useRef(null);

      // Reset outer [data-plugin-panel] scroll container to top on mount so entering from a scrolled plugin list starts at the top
      React.useLayoutEffect(() => {
        const el = sectionRef.current;
        if (!el) return;
        const resetScroll = () => {
          const panel = el.closest("[data-plugin-panel]");
          if (panel && typeof panel.scrollTop === "number") {
            panel.scrollTop = 0;
          }
          let node = el.parentElement;
          while (node) {
            if (node.scrollTop > 0) {
              node.scrollTop = 0;
            }
            node = node.parentElement;
          }
        };
        resetScroll();
        const rafId = window.requestAnimationFrame(resetScroll);
        return () => window.cancelAnimationFrame(rafId);
      }, []);

      const isZh = t("resetDefaults") === "恢复默认";
      const disabled = !state.writable || state.saving;
      const values = state.values;
      const disabledSet = new Set(values.disabledSkills);

      // Official DSH Theme & Typography Tokens (matching subagent / schedule / plugin-manager):
      // 1. Neutral Surfaces & 0.5px Hairline Borders
      const surfaceCard = "var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1, #171A21))";
      const surfaceSubtle = "var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-2, #12141A))";
      const surfaceHover = "var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.07))";
      const borderHairline = "0.5px solid var(--dsw-alias-border-l3, var(--dsw-alias-border-l2, #2A2F3A))";
      const borderDivider = "0.5px solid var(--dsw-alias-border-l2, #232730)";
      // 2. Official Typography Colors (Primary / Secondary / Tertiary)
      const textPrimary = "var(--dsw-alias-label-primary, #F1F5F9)";
      const textSecondary = "var(--dsw-alias-label-secondary, #9BA3B0)";
      const textTertiary = "var(--dsw-alias-label-tertiary, #78808F)";
      // 3. Single Brand Accent (#4D6BFE)
      const brandAccent = "var(--dsw-alias-brand-primary, var(--dsw-alias-state-business-primary, #4D6BFE))";

      // Official DSH Section Heading (.AZSXYW_heading in dsh-client-ui-settings-subagent):
      // font-size: 13px; font-weight: 600; line-height: 1.5 (20px)
      const sectionHeadingStyle = {
        margin: 0,
        fontSize: 13,
        fontWeight: 600,
        lineHeight: "20px",
        color: textPrimary,
      };

      const isBucketEnabled = (bucket) => {
        if (bucket === "engineering") return values.enableEngineering;
        if (bucket === "productivity") return values.enableProductivity;
        if (bucket === "in-progress") return values.enableInProgress;
        if (bucket === "misc") return values.enableMisc;
        return false;
      };

      const isSkillEnabled = (skill) =>
        isBucketEnabled(skill.bucket) && !disabledSet.has(skill.name);

      const bucketScopedSkills = React.useMemo(() => {
        return SKILL_CATALOG.filter((skill) => {
          if (activeTab === "engineering" && skill.bucket !== "engineering") return false;
          if (activeTab === "productivity" && skill.bucket !== "productivity") return false;
          if (
            activeTab === "extensions" &&
            skill.bucket !== "in-progress" &&
            skill.bucket !== "misc"
          ) {
            return false;
          }
          return true;
        });
      }, [activeTab]);

      const facetCounts = React.useMemo(() => {
        const counts = {
          user: 0,
          auto: 0,
          enabled: 0,
          disabled: 0,
          subcats: {},
        };
        for (const sc of SUBCATEGORIES) counts.subcats[sc.id] = 0;
        for (const skill of bucketScopedSkills) {
          if (skill.userOnly) counts.user += 1;
          else counts.auto += 1;
          if (isSkillEnabled(skill)) counts.enabled += 1;
          else counts.disabled += 1;
          counts.subcats[skill.subCategory] = (counts.subcats[skill.subCategory] || 0) + 1;
        }
        return counts;
      }, [bucketScopedSkills, values]);

      const filteredSkills = React.useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return bucketScopedSkills.filter((skill) => {
          if (selectedTriggers.length > 0) {
            const triggerKey = skill.userOnly ? "user" : "auto";
            if (!selectedTriggers.includes(triggerKey)) return false;
          }
          if (selectedStates.length > 0) {
            const stateKey = isSkillEnabled(skill) ? "enabled" : "disabled";
            if (!selectedStates.includes(stateKey)) return false;
          }
          if (selectedSubcats.length > 0) {
            if (!selectedSubcats.includes(skill.subCategory)) return false;
          }
          if (!q) return true;
          const triggerLabelZh = skill.userOnly ? "用户命令" : "自动加载";
          const triggerLabelEn = skill.userOnly ? "user command" : "auto-loaded";
          const haystack = [
            skill.name,
            \`/\${skill.name}\`,
            triggerLabelZh,
            triggerLabelEn,
            skill.subCategoryZh,
            skill.subCategoryEn,
            skill.bucket,
            skill.descriptionZh,
            skill.descriptionEn,
            ...skill.leadingWords,
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        });
      }, [
        bucketScopedSkills,
        selectedTriggers,
        selectedStates,
        selectedSubcats,
        searchQuery,
        values,
      ]);

      const activeFilterCount =
        selectedTriggers.length +
        selectedStates.length +
        selectedSubcats.length +
        (searchQuery.trim() ? 1 : 0);

      const clearAllFilters = () => {
        setSelectedTriggers([]);
        setSelectedStates([]);
        setSelectedSubcats([]);
        setSearchQuery("");
      };

      // Multi-select filter chip (compact 24px height, 11.5px font)
      const renderFilterChip = ({ key, label, count, selected, onClick }) =>
        jsx(
          "button",
          {
            type: "button",
            "aria-pressed": selected,
            onClick,
            style: {
              display: "inline-flex",
              alignItems: "center",
              height: 24,
              gap: 5,
              font: "inherit",
              fontSize: 11.5,
              lineHeight: "18px",
              fontWeight: selected ? 500 : 400,
              padding: "0 10px",
              borderRadius: 12,
              border: selected ? "none" : borderHairline,
              background: selected ? brandAccent : surfaceSubtle,
              color: selected ? "#FFFFFF" : textTertiary,
              cursor: "pointer",
              transition: "all 0.14s ease",
              whiteSpace: "nowrap",
            },
            children: [
              selected
                ? jsx("span", {
                    style: { fontSize: 10.5, lineHeight: 1 },
                    children: "✓",
                  })
                : null,
              jsx("span", { children: \`\${label} (\${count})\` }),
            ],
          },
          key
        );

      // Official DSH Tag sizing (.X_2TxG_statusTag / .X_2TxG_attemptBadge):
      // height: 18px; padding: 0 7px; font-size: 11px; line-height: 18px
      const tagStyle = (highlighted = false) => ({
        display: "inline-flex",
        alignItems: "center",
        height: 18,
        padding: "0 7px",
        borderRadius: 5,
        border: highlighted ? "none" : borderHairline,
        background: highlighted ? brandAccent : surfaceSubtle,
        color: highlighted ? "#FFFFFF" : textTertiary,
        fontSize: 11,
        lineHeight: "18px",
        fontWeight: highlighted ? 500 : 400,
        whiteSpace: "nowrap",
        cursor: "pointer",
        transition: "all 0.14s ease",
      });

      return jsxs("section", {
        ref: sectionRef,
        "aria-label": t("title"),
        style: {
          display: "flex",
          flexDirection: "column",
          gap: 24,
          maxWidth: 960,
          padding: "4px 0 24px 0",
          color: textPrimary,
          fontSize: 13,
          lineHeight: "20px",
        },
        children: [
          // Section 1: Global Directory Sync (matching Screenshot 2 "允许 Agent 为子智能体选择模型" toggleRow)
          jsxs("div", {
            style: {
              display: "flex",
              flexDirection: "column",
              gap: 8,
            },
            children: [
              jsxs("div", {
                style: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                },
                children: [
                  jsx("h4", {
                    style: sectionHeadingStyle,
                    children: t("syncSectionTitle"),
                  }),
                  // Right: "已自定义" badge + "恢复默认" link (matching Screenshot 2 "已覆盖  恢复默认")
                  jsxs("div", {
                    style: {
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 10,
                    },
                    children: [
                      jsx("span", {
                        style: {
                          fontSize: 12,
                          lineHeight: "18px",
                          color: textTertiary,
                        },
                        children: isZh
                          ? \`已启用 \${state.enabledCount} / \${state.totalCount} 个技能\`
                          : \`\${state.enabledCount} / \${state.totalCount} enabled\`,
                      }),
                      state.customized
                        ? jsx("span", {
                            style: {
                              ...tagStyle(false),
                              cursor: "default",
                              borderRadius: 999,
                              padding: "0 8px",
                            },
                            children: t("overriddenTag"),
                          })
                        : null,
                      jsx("button", {
                        type: "button",
                        disabled,
                        onClick: () => props.resetDefaults(),
                        style: {
                          font: "inherit",
                          fontSize: 12,
                          lineHeight: "18px",
                          padding: 0,
                          border: "none",
                          background: "transparent",
                          color: textTertiary,
                          cursor: disabled ? "not-allowed" : "pointer",
                        },
                        children: t("resetDefaults"),
                      }),
                    ],
                  }),
                ],
              }),

              // Toggle row + 12px tertiary subtitle (exact Screenshot 2 .UPHdGa_toggleRow + .UPHdGa_notice)
              jsxs("div", {
                style: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  padding: "12px 16px",
                  borderRadius: "var(--dsw-radius-lg, 10px)",
                  border: borderHairline,
                  background: surfaceCard,
                },
                children: [
                  jsxs("div", {
                    style: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 },
                    children: [
                      jsx("span", {
                        style: {
                          fontSize: 13,
                          fontWeight: 400,
                          lineHeight: "20px",
                          color: textPrimary,
                        },
                        children: t("syncTitle"),
                      }),
                      jsx("span", {
                        style: {
                          fontSize: 12,
                          fontWeight: 400,
                          lineHeight: "18px",
                          color: textTertiary,
                        },
                        children: t("syncDesc"),
                      }),
                    ],
                  }),
                  jsx(Switch, {
                    checked: values.linkToDshSkills,
                    disabled,
                    ariaLabel: t("syncTitle"),
                    onChange: (next) => props.setField("linkToDshSkills", next),
                  }),
                ],
              }),
            ],
          }),

          // Section 2: 4 Skill Bucket Cards (2x2 Grid with 13px heading, 13px card title, 12px description)
          jsxs("div", {
            style: { display: "flex", flexDirection: "column", gap: 10 },
            children: [
              jsxs("div", {
                style: { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" },
                children: [
                  jsx("h4", {
                    style: sectionHeadingStyle,
                    children: t("bucketSectionTitle"),
                  }),
                  jsx("span", {
                    style: { fontSize: 12, lineHeight: "18px", color: textTertiary },
                    children: t("bucketSectionHint"),
                  }),
                ],
              }),
              jsx("div", {
                style: {
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                  gap: 12,
                },
                children: BUCKETS.map((b) =>
                  jsxs(
                    "div",
                    {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        gap: 8,
                        padding: "14px 16px",
                        borderRadius: "var(--dsw-radius-lg, 10px)",
                        border: borderHairline,
                        background: surfaceCard,
                      },
                      children: [
                        jsxs("div", {
                          style: {
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                          },
                          children: [
                            jsxs("div", {
                              style: { display: "flex", alignItems: "center", gap: 8 },
                              children: [
                                jsx("span", {
                                  style: {
                                    fontSize: 13,
                                    fontWeight: 500,
                                    lineHeight: "20px",
                                    color: textPrimary,
                                  },
                                  children: isZh ? b.titleZh : b.titleEn,
                                }),
                                jsx("span", {
                                  style: {
                                    ...tagStyle(false),
                                    cursor: "default",
                                  },
                                  children: \`\${b.count}\${t("skillCountSuffix")}\`,
                                }),
                              ],
                            }),
                            jsx(Switch, {
                              checked: Boolean(values[b.field]),
                              disabled,
                              ariaLabel: isZh ? b.titleZh : b.titleEn,
                              onChange: (next) => props.setField(b.field, next),
                            }),
                          ],
                        }),
                        jsx("p", {
                          style: {
                            margin: 0,
                            fontSize: 12,
                            lineHeight: "18px",
                            color: textTertiary,
                          },
                          children: isZh ? b.descZh : b.descEn,
                        }),
                      ],
                    },
                    b.id
                  )
                ),
              }),
            ],
          }),

          // Section 3: Skill Directory & English Prompt Preview
          jsxs("div", {
            style: { display: "flex", flexDirection: "column", gap: 12 },
            children: [
              jsx("h4", {
                style: sectionHeadingStyle,
                children: t("directorySectionTitle"),
              }),

              // Primary Filter Bar: Pill Tabs (matching Screenshot 1/3) + Search Field (matching Screenshot 1 .t-XoWW_searchField)
              jsxs("div", {
                style: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 12,
                },
                children: [
                  jsx("div", {
                    role: "tablist",
                    style: {
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: 3,
                      borderRadius: 18,
                      border: borderHairline,
                      background: surfaceCard,
                    },
                    children: [
                      { id: "all", label: t("tabAll") },
                      { id: "engineering", label: t("tabEngineering") },
                      { id: "productivity", label: t("tabProductivity") },
                      { id: "extensions", label: t("tabExtensions") },
                    ].map((tab) => {
                      const selected = activeTab === tab.id;
                      return jsx(
                        "button",
                        {
                          type: "button",
                          role: "tab",
                          "aria-selected": selected,
                          onClick: () => setActiveTab(tab.id),
                          style: {
                            display: "inline-flex",
                            alignItems: "center",
                            height: 28,
                            font: "inherit",
                            fontSize: 12.5,
                            lineHeight: "20px",
                            fontWeight: selected ? 500 : 400,
                            padding: "0 12px",
                            borderRadius: 14,
                            border: "none",
                            cursor: "pointer",
                            background: selected ? surfaceHover : "transparent",
                            color: selected ? textPrimary : textTertiary,
                            transition: "all 0.14s ease",
                          },
                          children: tab.label,
                        },
                        tab.id
                      );
                    }),
                  }),

                  // Official Search Field (.t-XoWW_searchField: height 36px, border 0.5px, border-radius 12px, leading search icon)
                  jsxs("div", {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flex: "1 1 260px",
                      minWidth: 220,
                      height: 36,
                      padding: "0 12px",
                      borderRadius: 12,
                      border: borderHairline,
                      background: "transparent",
                    },
                    children: [
                      jsx(SearchGlyph, {}),
                      jsx("input", {
                        type: "search",
                        value: searchQuery,
                        onChange: (e) => setSearchQuery(e.target.value),
                        placeholder: t("searchPlaceholder"),
                        style: {
                          width: "100%",
                          border: "none",
                          background: "transparent",
                          font: "inherit",
                          fontSize: 13,
                          lineHeight: "20px",
                          color: textPrimary,
                          outline: "none",
                        },
                      }),
                    ],
                  }),
                ],
              }),

              // Secondary Multi-Select Filter Bar (11.5px chips, 12px group labels)
              jsxs("div", {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  padding: "12px 14px",
                  borderRadius: "var(--dsw-radius-lg, 10px)",
                  border: borderHairline,
                  background: surfaceCard,
                },
                children: [
                  jsxs("div", {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 8,
                    },
                    children: [
                      jsxs("div", {
                        style: {
                          display: "flex",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 6,
                        },
                        children: [
                          jsx("span", {
                            style: {
                              fontSize: 11.5,
                              lineHeight: "18px",
                              color: textTertiary,
                              minWidth: 80,
                              fontWeight: 500,
                            },
                            children: t("filterTriggerLabel"),
                          }),
                          renderFilterChip({
                            key: "trigger-user",
                            label: t("badgeUserCommand"),
                            count: facetCounts.user,
                            selected: selectedTriggers.includes("user"),
                            onClick: () =>
                              setSelectedTriggers((prev) => toggleInArray(prev, "user")),
                          }),
                          renderFilterChip({
                            key: "trigger-auto",
                            label: t("badgeAutoLoad"),
                            count: facetCounts.auto,
                            selected: selectedTriggers.includes("auto"),
                            onClick: () =>
                              setSelectedTriggers((prev) => toggleInArray(prev, "auto")),
                          }),
                          jsx("span", {
                            style: {
                              width: 1,
                              height: 12,
                              margin: "0 4px",
                              background: "var(--dsw-alias-border-l2, #262B36)",
                            },
                          }),
                          renderFilterChip({
                            key: "state-enabled",
                            label: t("badgeEnabled"),
                            count: facetCounts.enabled,
                            selected: selectedStates.includes("enabled"),
                            onClick: () =>
                              setSelectedStates((prev) => toggleInArray(prev, "enabled")),
                          }),
                          renderFilterChip({
                            key: "state-disabled",
                            label: t("badgeDisabled"),
                            count: facetCounts.disabled,
                            selected: selectedStates.includes("disabled"),
                            onClick: () =>
                              setSelectedStates((prev) => toggleInArray(prev, "disabled")),
                          }),
                        ],
                      }),

                      activeFilterCount > 0
                        ? jsxs("div", {
                            style: {
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                            },
                            children: [
                              jsx("span", {
                                style: {
                                  fontSize: 11.5,
                                  lineHeight: "18px",
                                  color: textTertiary,
                                },
                                children: isZh
                                  ? \`匹配 \${filteredSkills.length} / \${bucketScopedSkills.length} 项\`
                                  : \`Matched \${filteredSkills.length} / \${bucketScopedSkills.length}\`,
                              }),
                              jsx("button", {
                                type: "button",
                                onClick: clearAllFilters,
                                style: {
                                  font: "inherit",
                                  fontSize: 11.5,
                                  lineHeight: "18px",
                                  padding: "2px 8px",
                                  borderRadius: 6,
                                  border: borderHairline,
                                  background: "transparent",
                                  color: textSecondary,
                                  cursor: "pointer",
                                },
                                children: t("filterClear"),
                              }),
                            ],
                          })
                        : null,
                    ],
                  }),

                  jsxs("div", {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 6,
                    },
                    children: [
                      jsx("span", {
                        style: {
                          fontSize: 11.5,
                          lineHeight: "18px",
                          color: textTertiary,
                          minWidth: 80,
                          fontWeight: 500,
                        },
                        children: t("filterSubcatLabel"),
                      }),
                      ...SUBCATEGORIES.map((sc) =>
                        renderFilterChip({
                          key: \`subcat-\${sc.id}\`,
                          label: isZh ? sc.labelZh : sc.labelEn,
                          count: facetCounts.subcats[sc.id] || 0,
                          selected: selectedSubcats.includes(sc.id),
                          onClick: () =>
                            setSelectedSubcats((prev) => toggleInArray(prev, sc.id)),
                        })
                      ),
                    ],
                  }),
                ],
              }),

              // Skill Rows Container Card (matching Screenshot 2 .UPHdGa_models: 0.5px border, 13px name, 11px tags, 12px desc)
              jsx("div", {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: "var(--dsw-radius-lg, 10px)",
                  border: borderHairline,
                  background: surfaceCard,
                  overflow: "hidden",
                },
                children:
                  filteredSkills.length === 0
                    ? jsx("div", {
                        style: {
                          padding: "36px 20px",
                          textAlign: "center",
                          fontSize: 13,
                          color: textTertiary,
                        },
                        children: t("emptySearch"),
                      })
                    : filteredSkills.map((skill, idx) => {
                        const bucketOn = isBucketEnabled(skill.bucket);
                        const skillEnabled = bucketOn && !disabledSet.has(skill.name);
                        const isExpanded = expandedSkill === skill.name;
                        const displayName = skill.userOnly ? \`/\${skill.name}\` : skill.name;
                        const triggerKey = skill.userOnly ? "user" : "auto";
                        const triggerText = skill.userOnly
                          ? t("badgeUserCommand")
                          : t("badgeAutoLoad");
                        const subcatText = isZh ? skill.subCategoryZh : skill.subCategoryEn;
                        const triggerHighlighted = selectedTriggers.includes(triggerKey);
                        const subcatHighlighted = selectedSubcats.includes(skill.subCategory);

                        return jsxs(
                          "div",
                          {
                            style: {
                              display: "flex",
                              flexDirection: "column",
                              padding: "11px 16px",
                              borderTop: idx === 0 ? "none" : borderDivider,
                            },
                            children: [
                              jsxs("div", {
                                style: {
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 12,
                                  flexWrap: "wrap",
                                },
                                children: [
                                  jsxs("div", {
                                    style: {
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                      flex: "1 1 420px",
                                      minWidth: 0,
                                      flexWrap: "wrap",
                                    },
                                    children: [
                                      // Skill Name: 13px / 500 / 20px (matching Screenshot 2 "gpt-6-astra")
                                      jsx("span", {
                                        style: {
                                          fontFamily:
                                            "var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
                                          fontSize: 13,
                                          fontWeight: 500,
                                          lineHeight: "20px",
                                          color: bucketOn ? textPrimary : textTertiary,
                                        },
                                        children: displayName,
                                      }),
                                      // Trigger Badge: 11px / 18px height (matching Screenshot 2/3 tags)
                                      jsx("button", {
                                        type: "button",
                                        onClick: () =>
                                          setSelectedTriggers((prev) =>
                                            toggleInArray(prev, triggerKey)
                                          ),
                                        style: {
                                          ...tagStyle(triggerHighlighted),
                                          fontFamily: "inherit",
                                        },
                                        children: triggerText,
                                      }),
                                      // Sub-category Badge: 11px / 18px height
                                      jsx("button", {
                                        type: "button",
                                        onClick: () =>
                                          setSelectedSubcats((prev) =>
                                            toggleInArray(prev, skill.subCategory)
                                          ),
                                        style: {
                                          ...tagStyle(subcatHighlighted),
                                          fontFamily: "inherit",
                                        },
                                        children: subcatText,
                                      }),
                                      // Skill Summary: 12px / 18px / tertiary (matching Screenshot 2/3 secondary text)
                                      jsx("span", {
                                        style: {
                                          fontSize: 12,
                                          lineHeight: "18px",
                                          color: textTertiary,
                                        },
                                        children:
                                          (isZh ? skill.descriptionZh : skill.descriptionEn) +
                                          (!bucketOn ? t("bucketDisabledHint") : ""),
                                      }),
                                    ],
                                  }),
                                  jsxs("div", {
                                    style: {
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 12,
                                      flexShrink: 0,
                                    },
                                    children: [
                                      jsx("button", {
                                        type: "button",
                                        onClick: () =>
                                          setExpandedSkill(isExpanded ? null : skill.name),
                                        style: {
                                          display: "inline-flex",
                                          alignItems: "center",
                                          height: 24,
                                          font: "inherit",
                                          fontSize: 11.5,
                                          lineHeight: "18px",
                                          padding: "0 10px",
                                          borderRadius: 6,
                                          border: borderHairline,
                                          background: isExpanded ? surfaceSubtle : "transparent",
                                          color: isExpanded ? textPrimary : textTertiary,
                                          cursor: "pointer",
                                        },
                                        children: isExpanded
                                          ? t("previewClose")
                                          : t("previewOpen"),
                                      }),
                                      jsx(Switch, {
                                        checked: skillEnabled,
                                        disabled: disabled || !bucketOn,
                                        ariaLabel: displayName,
                                        onChange: () => props.toggleSkill(skill.name),
                                      }),
                                    ],
                                  }),
                                ],
                              }),

                              // Collapsible English Original SKILL.md Drawer (11px header, 12px/18px monospace code)
                              isExpanded
                                ? jsxs("div", {
                                    style: {
                                      marginTop: 10,
                                      borderRadius: 8,
                                      border: borderHairline,
                                      background: surfaceSubtle,
                                      overflow: "hidden",
                                    },
                                    children: [
                                      jsxs("div", {
                                        style: {
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          flexWrap: "wrap",
                                          gap: 8,
                                          padding: "7px 14px",
                                          borderBottom: borderDivider,
                                          fontFamily:
                                            "var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
                                          fontSize: 11,
                                          lineHeight: "16px",
                                          color: textTertiary,
                                        },
                                        children: [
                                          jsx("span", {
                                            children: \`assets/\${skill.bucket}/\${skill.name}/SKILL.md  ·  \${t(
                                              "promptLabel"
                                            )}\`,
                                          }),
                                          skill.supportingFiles.length > 0
                                            ? jsx("span", {
                                                children: \`\${t("supportingFilesLabel")}: \${skill.supportingFiles.join(
                                                  ", "
                                                )}\`,
                                              })
                                            : null,
                                        ],
                                      }),
                                      jsx("pre", {
                                        style: {
                                          margin: 0,
                                          padding: "12px 14px",
                                          maxHeight: 240,
                                          overflowY: "auto",
                                          whiteSpace: "pre-wrap",
                                          wordBreak: "break-word",
                                          fontFamily:
                                            "var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
                                          fontSize: 12,
                                          lineHeight: "18px",
                                          color: textSecondary,
                                        },
                                        children: skill.content,
                                      }),
                                      skill.leadingWords.length > 0
                                        ? jsx("div", {
                                            style: {
                                              padding: "6px 14px 8px 14px",
                                              borderTop: borderDivider,
                                              fontFamily:
                                                "var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
                                              fontSize: 11,
                                              lineHeight: "16px",
                                              color: textTertiary,
                                            },
                                            children: \`\${t("leadingWordsLabel")}: \${skill.leadingWords
                                              .map((w) => \`"\${w}"\`)
                                              .join(", ")}\`,
                                          })
                                        : null,
                                    ],
                                  })
                                : null,
                            ],
                          },
                          skill.name
                        );
                      }),
              }),
            ],
          }),
        ],
      });
    }

    function apply(ctx) {
      ctx.effect(
        () => ctx.locale.register(LOCALE_NS, { zh, en }),
        "mattpocock-skills: copy dictionaries"
      );
      const controller = new MattPocockSkillsController(ctx.configForms.get(SETTINGS_NS));
      ctx.effect(() => () => controller.unsubscribe(), "mattpocock-skills: settings subscription");
      const face = controller.inject();

      ctx.slots.inject("plugins.bundle.config", () =>
        ctx.slots.register(
          {
            name: "plugins.bundle.config",
            key: "dsh-mattpocock-skills",
            locale: LOCALE_NS,
            inject: () => face,
          },
          MattPocockSkillsConfig
        )
      );

      ctx.slots.inject("plugins.row.config", () =>
        ctx.slots.register(
          {
            name: "plugins.row.config",
            key: "dsh-mattpocock-skills#mattpocock-skills",
            locale: LOCALE_NS,
            inject: () => face,
          },
          MattPocockSkillsConfig
        )
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
`;

writeFileSync(CLIENT_JS_PATH, clientSource, "utf8");
console.log(`[build-client] Wrote ${CLIENT_JS_PATH} with ${catalog.length} skills.`);
