import { Node, mk } from "./model";

const t = (text: string, ...children: Node[]): Node => ({ ...mk(text), children });
const todo = (text: string): Node => ({ ...mk(text), progress: 0 });

/** Starter maps for "New from template". `build` returns fresh topics (new ids) every time. */
export const TEMPLATES: { name: string; build: () => Node }[] = [
  {
    name: "Brainstorm",
    build: () => ({
      ...t("Topic",
        t("Ideas", t("Idea 1"), t("Idea 2"), t("Idea 3")),
        t("Questions", t("Who?"), t("Why?"), t("How?")),
        t("Resources", t("People"), t("Tools")),
        t("Next steps", todo("First step"), todo("Second step"))),
      layout: "map",
    }),
  },
  {
    name: "Project plan",
    build: () => ({
      ...t("Project name",
        t("Discover", t("Goals"), t("Stakeholders")),
        t("Plan", t("Scope"), t("Milestones")),
        t("Build", todo("Task 1"), todo("Task 2")),
        t("Launch", t("Checklist")),
        t("Review", t("What went well"), t("What to change"))),
      layout: "line",
    }),
  },
  {
    name: "SWOT analysis",
    build: () => ({
      ...t("SWOT",
        t("Strengths", t("…"), t("…")),
        t("Weaknesses", t("…"), t("…")),
        t("Opportunities", t("…"), t("…")),
        t("Threats", t("…"), t("…"))),
      layout: "matrix",
    }),
  },
  {
    name: "Cause and effect",
    build: () => ({
      ...t("Problem",
        t("People", t("Skills"), t("Workload")),
        t("Process", t("Handoffs"), t("Approvals")),
        t("Tools", t("Software"), t("Equipment")),
        t("Environment", t("Location"), t("Timing")),
        t("Materials", t("Quality"), t("Supply")),
        t("Measurement", t("Metrics"), t("Reporting"))),
      layout: "fish",
    }),
  },
  {
    name: "Meeting notes",
    build: () => ({
      ...t("Meeting: title, date",
        t("Agenda", t("Item 1"), t("Item 2")),
        t("Notes"),
        t("Decisions"),
        t("Actions", todo("Who: what, by when"))),
      layout: "tree",
    }),
  },
  {
    name: "Org chart",
    build: () => ({
      ...t("Director", t("Team A", t("Member"), t("Member")), t("Team B", t("Member"), t("Member")), t("Team C", t("Member"))),
      layout: "down",
    }),
  },
  {
    name: "Weekly plan",
    build: () => ({
      ...t("Week of …",
        ...["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((d) => t(d, todo("Morning"), todo("Afternoon")))),
      layout: "matrix",
    }),
  },
  {
    name: "Pros and cons",
    build: () => ({
      ...t("Decision", t("Pros", t("…"), t("…")), t("Cons", t("…"), t("…")), t("Verdict")),
      layout: "brace",
    }),
  },
];
