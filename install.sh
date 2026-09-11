```bash
#!/usr/bin/env bash
# SynDocs installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/piedpipr/SynDocs/main/install.sh | bash
#
# Optional:
#   SYNDOCS_DIR=/some/path curl -fsSL ... | bash
#
set -euo pipefail

REPO="https://github.com/piedpipr/SynDocs.git"
INSTALL_DIR="${SYNDOCS_DIR:-${HOME}/.syndocs}"
BIN_DIR="${HOME}/.local/bin"

# ── Colours ───────────────────────────────────────────────────────────────────

if [ -t 1 ]; then
  BOLD='\033[1m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  RED='\033[0;31m'
  CYAN='\033[0;36m'
  DIM='\033[2m'
  RESET='\033[0m'
else
  BOLD=''
  GREEN=''
  YELLOW=''
  RED=''
  CYAN=''
  DIM=''
  RESET=''
fi

step()  { echo -e "  ${GREEN}▸${RESET} $1"; }
warn()  { echo -e "  ${YELLOW}⚠${RESET}  $1"; }
fatal() { echo -e "\n  ${RED}Error:${RESET} $1\n"; exit 1; }
info()  { echo -e "  ${DIM}$1${RESET}"; }

echo ""
echo -e "  ${BOLD}${CYAN}SynDocs${RESET} installer"
echo ""

# ── Validate environment ──────────────────────────────────────────────────────

if [ -z "${HOME:-}" ]; then
  fatal "\$HOME is not set. Please run this installer from a normal user shell."
fi

case "${HOME}" in
  /home/claude|/home/*|/Users/*|/root|/root/*)
    ;;
  *)
    warn "Using non-standard home directory: ${HOME}"
    ;;
esac

# Don't accidentally install into /
if [ "${HOME}" = "/" ]; then
  fatal "HOME=/ is not a valid user home directory."
fi

# ── Prerequisites ─────────────────────────────────────────────────────────────

command -v node >/dev/null 2>&1 || \
  fatal "Node.js not found. Install from https://nodejs.org"

command -v npm >/dev/null 2>&1 || \
  fatal "npm not found. Install Node.js from https://nodejs.org"

command -v git >/dev/null 2>&1 || \
  fatal "git not found. Install git and retry."

NODE_FULL=$(node -e "process.stdout.write(process.version.slice(1))")
NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")

if [ "${NODE_MAJOR}" -lt 18 ]; then
  fatal "Node.js 18+ required (found v${NODE_FULL}). Upgrade at https://nodejs.org"
fi

step "Node.js v${NODE_FULL}"

if [ "${NODE_MAJOR}" -lt 22 ]; then
  warn "Node.js 22.5+ unlocks graph features (CodeGraph integration, blast-radius)."
  warn "Core features work fine on v${NODE_FULL}."
fi

GIT_VERSION=$(git --version | cut -d' ' -f3)
step "git ${GIT_VERSION}"

echo ""

# ── Clone or update ───────────────────────────────────────────────────────────

if [ -d "${INSTALL_DIR}/.git" ]; then
  EXISTING=$(git -C "${INSTALL_DIR}" rev-parse --short HEAD 2>/dev/null || echo "unknown")

  step "Updating existing install in ${INSTALL_DIR} (was ${EXISTING})"

  git -C "${INSTALL_DIR}" remote set-url origin "${REPO}" 2>/dev/null || true
  git -C "${INSTALL_DIR}" fetch origin main --quiet
  git -C "${INSTALL_DIR}" reset --hard origin/main --quiet

  NEW=$(git -C "${INSTALL_DIR}" rev-parse --short HEAD)

  if [ "${EXISTING}" = "${NEW}" ]; then
    info "Already up to date (${NEW})"
  else
    info "Updated ${EXISTING} → ${NEW}"
  fi
else
  # Refuse to overwrite an unrelated directory.
  if [ -e "${INSTALL_DIR}" ]; then
    fatal "${INSTALL_DIR} already exists and is not a SynDocs git repository."
  fi

  step "Cloning piedpipr/SynDocs → ${INSTALL_DIR}"

  mkdir -p "$(dirname "${INSTALL_DIR}")"

  git clone --depth=1 "${REPO}" "${INSTALL_DIR}" --quiet

  COMMIT=$(git -C "${INSTALL_DIR}" rev-parse --short HEAD)
  info "Cloned at ${COMMIT}"
fi

cd "${INSTALL_DIR}"

# ── Install dependencies ──────────────────────────────────────────────────────

step "Installing dependencies"

npm install --silent 2>/dev/null || npm install

# ── Build packages in dependency order ───────────────────────────────────────

step "Building @syndocs/core"
(
  cd packages/core
  npx tsc --noEmitOnError 2>&1
) || fatal "core build failed — see above"

step "Building @syndocs/graph"
(
  cd packages/graph
  npx tsc --noEmitOnError 2>&1
) || fatal "graph build failed — see above"

step "Building syndocs CLI"
(
  cd packages/cli
  npx tsc --noEmitOnError 2>&1
) || fatal "cli build failed — see above"

chmod +x packages/cli/dist/index.js

# ── Install CLI into the current user's bin ───────────────────────────────────

step "Installing syndocs for current user"

mkdir -p "${BIN_DIR}"

# Remove an old symlink/file if it points to a previous installation.
rm -f "${BIN_DIR}/syndocs"

ln -s "${INSTALL_DIR}/packages/cli/dist/index.js" "${BIN_DIR}/syndocs"

# ── PATH setup ─────────────────────────────────────────────────────────────────

PATH_UPDATED=0

case ":${PATH}:" in
  *":${BIN_DIR}:"*)
    ;;
  *)
    PATH_UPDATED=1
    ;;
esac

# Determine the user's shell config file.
SHELL_RC=""

case "${SHELL:-}" in
  */zsh)
    SHELL_RC="${HOME}/.zshrc"
    ;;
  */fish)
    SHELL_RC="${HOME}/.config/fish/config.fish"
    ;;
  */bash)
    if [ -f "${HOME}/.bashrc" ]; then
      SHELL_RC="${HOME}/.bashrc"
    elif [ -f "${HOME}/.bash_profile" ]; then
      SHELL_RC="${HOME}/.bash_profile"
    else
      SHELL_RC="${HOME}/.bashrc"
    fi
    ;;
esac

# Add ~/.local/bin to the user's shell config if necessary.
if [ "${PATH_UPDATED}" -eq 1 ] && [ -n "${SHELL_RC}" ]; then

  mkdir -p "$(dirname "${SHELL_RC}")"

  if [ "${SHELL##*/}" = "fish" ]; then
    if ! grep -Fq 'fish_add_path "$HOME/.local/bin"' "${SHELL_RC}" 2>/dev/null; then
      {
        echo ""
        echo "# SynDocs"
        echo 'fish_add_path "$HOME/.local/bin"'
      } >> "${SHELL_RC}"
    fi
  else
    if ! grep -Fq 'export PATH="$HOME/.local/bin:$PATH"' "${SHELL_RC}" 2>/dev/null; then
      {
        echo ""
        echo "# SynDocs"
        echo 'export PATH="$HOME/.local/bin:$PATH"'
      } >> "${SHELL_RC}"
    fi
  fi
fi

# Make it available immediately in this installer process.
export PATH="${BIN_DIR}:${PATH}"

# ── Verify ─────────────────────────────────────────────────────────────────────

echo ""

if command -v syndocs >/dev/null 2>&1; then
  VERSION=$(syndocs --version 2>/dev/null || echo "v0.2.0")

  echo -e "  ${GREEN}${BOLD}✓ syndocs ${VERSION} installed${RESET}"
  echo ""
  echo -e "  ${BOLD}Install location:${RESET} ${INSTALL_DIR}"
  echo -e "  ${BOLD}Command:${RESET}         ${BIN_DIR}/syndocs"
  echo ""

  if [ "${PATH_UPDATED}" -eq 1 ]; then
    echo -e "  ${YELLOW}Restart your shell or run:${RESET}"
    echo ""

    if [ -n "${SHELL_RC}" ]; then
      echo -e "    ${CYAN}source ${SHELL_RC}${RESET}"
    else
      echo -e "    ${CYAN}export PATH=\"${BIN_DIR}:\$PATH\"${RESET}"
    fi

    echo ""
  fi

  echo -e "  ${BOLD}Get started:${RESET}"
  echo ""
  echo -e "    ${CYAN}cd your-project${RESET}"
  echo -e "    ${CYAN}syndocs init${RESET}         ← mark files, create mirror docs"
  echo -e "    ${CYAN}syndocs check${RESET}        ← detect drift"
  echo -e "    ${CYAN}syndocs serve${RESET}        ← web UI at http://localhost:4748"
  echo ""
  echo -e "  ${DIM}Full docs: https://github.com/piedpipr/SynDocs#readme${RESET}"
  echo ""
else
  echo -e "  ${GREEN}${BOLD}✓ syndocs installed${RESET}"
  echo ""
  echo -e "  Run it directly with:"
  echo -e "    ${CYAN}${BIN_DIR}/syndocs init${RESET}"
  echo ""
  warn "Could not verify syndocs on PATH."
fi

# ── Optional: CodeGraph prompt ────────────────────────────────────────────────

if ! command -v codegraph >/dev/null 2>&1; then
  echo -e "  ${DIM}Graph features (wiki-links, blast-radius) need CodeGraph:${RESET}"
  echo -e "    ${DIM}npm install -g @colbymchenry/codegraph${RESET}"
  echo ""
fi
```
