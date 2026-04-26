<!-- OPENSPEC:START -->
# OpenSDD Instructions
当前项目是OpenSDD项目（原OpenSpec项目的汉化版），当前项目名叫@studyzy/opensdd，只有在命令行下是执行opensdd命令，而不是openspec命令了，但是在AI编辑器中使用子命令时仍然是/openspec:XXX 而不是/opensdd:XXX，新建的目录也还是叫openspec，对应的SKILL也是保持openspec-XXX不变，不用变成opensdd-XXX。

在汉化过程中Schema作为特殊计算机词汇，不需要翻译成中文，保持不变即可。

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'opensdd update' can refresh the instructions.

<!-- OPENSPEC:END -->