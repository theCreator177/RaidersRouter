---
name: superfile
description: >
  Install, configure, and drive superfile (spf) — a modern terminal file manager — and
  use it as the standard way to manage and organize the user's files from the terminal.
  Use this when the user wants to browse/organize files in a TUI, set up superfile, wants
  a "file manager in the terminal", asks to clean up / reorganize a directory, or references
  superfile / spf. Superfile is an interactive TUI (no headless mode), so this skill covers
  installing it, authoring its config/hotkey/theme files, wiring cd-on-quit into the shell,
  and performing the actual reorganizing with fast CLI tools when a non-interactive action is needed.
when_to_use: >
  User asks to install or configure superfile/spf; wants a terminal file manager; asks Claude
  to organize, sort, tidy, or restructure a folder; or wants shell integration for superfile.
---

# superfile (spf) — terminal file manager control & organization

**Upstream:** https://github.com/yorukot/superfile · MIT · Go / Bubble Tea TUI · launch command `spf`
**Docs:** https://superfile.dev

Superfile is a full-screen, human-driven TUI file manager. It has **no headless/scripting API** — an
agent cannot "pilot" the interactive UI. So this skill splits into what an agent *can* do well:

1. **Install** superfile.
2. **Configure** it (config, hotkeys, theme) by editing its plain-text config files — this is where
   Claude adds the most value ("manage and organize it").
3. **Integrate** it into the terminal (cd-on-quit, aliases).
4. **Do the actual file organizing** with fast CLI tools when the user wants Claude to reorganize a
   directory, then hand the tidied tree back to the user to browse in `spf`.

## 1. Install

```bash
# macOS / Linux
bash -c "$(curl -sLo- https://superfile.dev/install.sh)"

# Windows
winget install --id yorukot.superfile      # or: scoop install superfile
# PowerShell installer:  powershell -c "irm https://superfile.dev/install.ps1 | iex"

# From source (Go toolchain)
git clone https://github.com/yorukot/superfile && cd superfile && ./build.sh
```

Verify: `spf --version`. Launch: `spf` (or `spf /path/to/start/dir`).

## 2. Configure (Claude's main job here)

Config lives under the OS config dir. Resolve it first:

```bash
# Linux:   ${XDG_CONFIG_HOME:-~/.config}/superfile/
# macOS:   ~/.config/superfile/   (or ~/Library/Application Support/superfile)
# Windows: %LOCALAPPDATA%\superfile\
spf path-list --lastdir-file   # prints the lastdir file path; sibling files live in the same tree
```

Key files to edit:

| File | Purpose |
| --- | --- |
| `config.toml` | Behavior: editor, default sort, show hidden, metadata, plugins (Zoxide, metadata, nerdfont) |
| `hotkeys.toml` | Keybindings (vim-style by default) |
| `theme/<name>.toml` | Colors; set `theme = "<name>"` in config.toml |

Safe editing rules:
- **Back up before writing:** `cp config.toml config.toml.bak`.
- Use `spf --fix-config-file` / `spf --fix-hotkeys` to backfill any fields a version bump added
  (prevents "missing key" errors after an edit).
- Point `--config-file` / `--hotkey-file` at a repo-local copy when setting up a project-specific
  layout so you don't clobber the user's global config.

Common requests and the edit that satisfies them:
- "Show hidden files by default" → set the show-hidden flag in `config.toml`.
- "Use nvim/VS Code as the editor" → set the editor field in `config.toml`.
- "Vim keys / rebind X" → edit `hotkeys.toml`.
- "Dark theme / match my terminal" → add a `theme/*.toml` and set `theme` in `config.toml`.

Always confirm the resolved config path with the user before writing, and show a diff.

## 3. Terminal integration — cd on quit

Superfile can't change the parent shell's directory itself; wire it via `--print-last-dir`:

```bash
# bash / zsh  (add to ~/.bashrc or ~/.zshrc)
spf() {
  local dir
  dir="$(command spf --print-last-dir "$@")"
  [ -n "$dir" ] && [ -d "$dir" ] && cd "$dir"
}
```

Other useful flags: `--chooser-file <path>` (write the chosen file's path and exit — for "pick a file"
shell wrappers), `--config-file`, `--hotkey-file`, `--debug-info`.

## 4. Organizing files (when the user asks Claude to tidy a directory)

An agent reorganizes faster with direct CLI tools than by driving a TUI. Preferred, reversible flow:

1. **Survey** — never mutate before you understand the tree:
   ```bash
   ls -la; find . -maxdepth 2 -type f | head -50   # or: fd . -t f | head -50 ; eza --tree --level=2
   ```
2. **Propose a scheme** (by type, by date, by project) and show it to the user before moving anything.
3. **Move safely** — create targets, use `-n` (no-clobber), never overwrite blindly:
   ```bash
   mkdir -p sorted/{images,docs,archives,code}
   mv -n *.png *.jpg *.jpeg sorted/images/ 2>/dev/null
   mv -n *.pdf *.md *.docx  sorted/docs/   2>/dev/null
   ```
4. **Report** what moved (a table of from → to) so the change is auditable and undoable.
5. Hand back: tell the user to run `spf` in the tidied directory to browse the result.

Guardrails: confirm before any destructive op, prefer `mv` over `rm`, keep a record of moves so the
reorganization can be reversed, and never touch `.git/`, `node_modules/`, or dotfiles unless asked.
