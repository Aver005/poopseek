---
alwaysApply: true
scene: git_message
---

Type must be one of: feat, fix, hotfix, chore, refactor, release, docs, test, build, ci, style, perf. Scope is optional and if present must be in parentheses immediately after the type and contain only lowercase letters, digits, dots or hyphens (pattern: [a-z0-9.-]+). A breaking-change marker (!) is optional and allowed immediately after the type or after the closing scope. The separator is a colon and a space after the type/scope/optional !. Immediately after the colon and space include a single emoji (any Unicode emoji) followed by a space and then a short descriptive subject. The full message must match the regular expression: \A(feat|fix|hotfix|chore|refactor|release|docs|test|build|ci|style|perf)(([a-z0-9.-]+))?!?: .+

Examples feat(ui): 😊 add new toolbar fix: 🔧 correct nil pointer on login refactor(auth)!: ♻️ remove legacy token flow docs(readme): 📝 update setup instructions