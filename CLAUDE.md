# Caliper

## Claude Design

Product design project — **Освіження дизайну продукту**

- URL: https://claude.ai/design/p/766951e2-fc8b-4e85-8eda-cbb83ce66d8c
- `project_id`: `766951e2-fc8b-4e85-8eda-cbb83ce66d8c`
- Type: `PROJECT_TYPE_PROJECT` (not a design system)

Read the mockups from this project before implementing anything UI-facing:
`mcp__claude-design__list_files` → `mcp__claude-design__read_file` with the `project_id` above.

Because the project type is `PROJECT_TYPE_PROJECT`, the `DesignSync` tool cannot push a local
component library into it — that requires a project created as `PROJECT_TYPE_DESIGN_SYSTEM`.
The flow here is read-only: design → code.
