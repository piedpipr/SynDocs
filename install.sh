```bash
#!/usr/bin/env bash

# ==============================================================================
# SynDocs Installer
# ==============================================================================
#
# One-line install:
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/piedpipr/SynDocs/main/install.sh)
#
# Or:
#
#   curl -fsSL https://raw.githubusercontent.com/piedpipr/SynDocs/main/install.sh | bash
#
# Environment:
#
#   SYNDOCS_DIR=/custom/path
#
# ==============================================================================

set -Eeuo pipefail

REPO="https://github.com/piedpipr/SynDocs.git"
INSTALL_DIR="${SYNDOCS_DIR:-${HOME}/.syndocs}"
BIN_DIR="${HOME}/.local/bin"

VERSION="0.2.0"

# ==============================================================================
# Terminal
# ==============================================================================

if [[ -t 1 ]]; then
    BOLD="\033[1m"
    DIM="\033[2m"
    RED="\033[31m"
    GREEN="\033[32m"
    YELLOW="\033[33m"
    BLUE="\033[34m"
    MAGENTA="\033[35m"
    CYAN="\033[36m"
    WHITE="\033[37m"
    RESET="\033[0m"
else
    BOLD=""
    DIM=""
    RED=""
    GREEN=""
    YELLOW=""
    BLUE=""
    MAGENTA=""
    CYAN=""
    WHITE=""
    RESET=""
fi

# ==============================================================================
# Output helpers
# ==============================================================================

line() {
    printf '%b\n' "${DIM}────────────────────────────────────────────────────────────────────────${RESET}"
}

title() {
    echo ""
    printf '%b\n' "${BOLD}${CYAN}▸ $1${RESET}"
    line
}

info() {
    printf '  %b %s\n' "${CYAN}●${RESET}" "$*"
}

success() {
    printf '  %b %s\n' "${GREEN}✓${RESET}" "$*"
}

warn() {
    printf '  %b %s\n' "${YELLOW}⚠${RESET}" "$*"
}

error() {
    printf '  %b %s\n' "${RED}✗${RESET}" "$*" >&2
}

detail() {
    printf '    %b%s%b\n' "${DIM}" "$*" "${RESET}"
}

die() {
    echo ""
    error "$*"
    echo ""
    exit 1
}

# ==============================================================================
# Error handler
# ==============================================================================

on_error() {
    local exit_code=$?
    local line_no=$1

    echo ""
    error "Installation failed."
    detail "Exit code : ${exit_code}"
    detail "Line      : ${line_no}"
    detail "Directory : ${PWD}"
    detail "Home      : ${HOME}"
    echo ""
    detail "If this is a bug, please report it:"
    detail "https://github.com/piedpipr/SynDocs/issues"
    echo ""

    exit "${exit_code}"
}

trap 'on_error $LINENO' ERR

# ==============================================================================
# Banner
# ==============================================================================

clear 2>/dev/null || true

echo ""
printf '%b\n' "${CYAN}${BOLD}"
echo "   ███████╗██╗   ██╗███╗   ██╗██████╗  ██████╗  ██████╗███████╗"
echo "   ██╔════╝╚██╗ ██╔╝████╗  ██║██╔══██╗██╔═══██╗██╔════╝██╔════╝"
echo "   ███████╗ ╚████╔╝ ██╔██╗ ██║██║  ██║██║   ██║██║     ███████╗"
echo "   ╚════██║  ╚██╔╝  ██║╚██╗██║██║  ██║██║   ██║██║     ╚════██║"
echo "   ███████║   ██║   ██║ ╚████║██████╔╝╚██████╔╝╚██████╗███████║"
echo "   ╚══════╝   ╚═╝   ╚═╝  ╚═══╝╚═════╝  ╚═════╝  ╚═════╝╚══════╝"
printf '%b\n' "${RESET}"

echo ""
printf '   %b%s%b\n' "${BOLD}" "Developer documentation that stays in sync." "${RESET}"
echo ""
line

# ==============================================================================
# Environment
# ==============================================================================

title "Environment"

info "Operating system : $(uname -s)"
info "Architecture     : $(uname -m)"
info "Shell            : ${SHELL:-unknown}"
info "User             : $(id -un)"
info "Home             : ${HOME}"
info "Install          : ${INSTALL_DIR}"
info "Binary directory : ${BIN_DIR}"

echo ""

# ==============================================================================
# Validate HOME
# ==============================================================================

title "Checking user environment"

[[ -n "${HOME:-}" ]] || die "\$HOME is not set."

[[ "${HOME}" != "/" ]] || die "HOME=/ is not a valid user home directory."

mkdir -p "${HOME}" || die "Cannot access home directory: ${HOME}"

success "User home directory is available"

# ==============================================================================
# Dependencies
# ==============================================================================

title "Checking prerequisites"

check_command() {
    local command_name="$1"
    local description="$2"

    if command -v "${command_name}" >/dev/null 2>&1; then
        success "${description}: $(command -v "${command_name}")"
    else
        error "${description} not found"
        die "Please install ${description} and run the installer again."
    fi
}

check_command node "Node.js"
check_command npm "npm"
check_command git "git"

NODE_VERSION="$(node --version)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"

success "Node.js version: ${NODE_VERSION}"

if (( NODE_MAJOR < 18 )); then
    die "Node.js 18 or newer is required. Found ${NODE_VERSION}."
fi

if (( NODE_MAJOR < 22 )); then
    warn "Node.js 22.5+ enables additional graph features."
    detail "Core SynDocs functionality works with ${NODE_VERSION}."
else
    success "Node.js version is suitable for all SynDocs features"
fi

NPM_VERSION="$(npm --version)"
GIT_VERSION="$(git --version | awk '{print $3}')"

info "npm version : ${NPM_VERSION}"
info "git version : ${GIT_VERSION}"

# ==============================================================================
# Existing installation
# ==============================================================================

title "Preparing installation"

if [[ -e "${INSTALL_DIR}" && ! -d "${INSTALL_DIR}/.git" ]]; then
    die "Installation directory already exists but is not a SynDocs repository:

    ${INSTALL_DIR}

Move it away or remove it, then run the installer again."
fi

mkdir -p "$(dirname "${INSTALL_DIR}")"
mkdir -p "${BIN_DIR}"

success "Installation directories are ready"

# ==============================================================================
# Clone / Update
# ==============================================================================

title "Downloading SynDocs"

if [[ -d "${INSTALL_DIR}/.git" ]]; then

    info "Existing SynDocs installation detected"
    detail "Location: ${INSTALL_DIR}"

    OLD_COMMIT="$(git -C "${INSTALL_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)"

    info "Fetching latest version..."

    git -C "${INSTALL_DIR}" remote set-url origin "${REPO}"
    git -C "${INSTALL_DIR}" fetch origin main

    info "Updating working tree..."

    git -C "${INSTALL_DIR}" reset --hard origin/main

    NEW_COMMIT="$(git -C "${INSTALL_DIR}" rev-parse --short HEAD)"

    if [[ "${OLD_COMMIT}" == "${NEW_COMMIT}" ]]; then
        success "Already up to date (${NEW_COMMIT})"
    else
        success "Updated ${OLD_COMMIT} → ${NEW_COMMIT}"
    fi

else

    info "Cloning repository:"
    detail "${REPO}"
    echo ""

    git clone --depth=1 "${REPO}" "${INSTALL_DIR}"

    COMMIT="$(git -C "${INSTALL_DIR}" rev-parse --short HEAD)"

    echo ""
    success "Repository downloaded"
    detail "Commit: ${COMMIT}"
fi

cd "${INSTALL_DIR}"

# ==============================================================================
# Verify repository
# ==============================================================================

title "Verifying SynDocs source"

[[ -f "package.json" ]] || die "package.json was not found."
[[ -d "packages/core" ]] || die "packages/core was not found."
[[ -d "packages/graph" ]] || die "packages/graph was not found."
[[ -d "packages/cli" ]] || die "packages/cli was not found."

success "Repository structure looks valid"

# ==============================================================================
# Dependencies
# ==============================================================================

title "Installing dependencies"

info "Running npm install"
detail "This may take a moment on the first installation."
echo ""

npm install

echo ""
success "Dependencies installed"

# ==============================================================================
# Build core
# ==============================================================================

title "Building @syndocs/core"

(
    cd packages/core
    npm exec tsc -- --noEmitOnError
)

success "@syndocs/core built successfully"

# ==============================================================================
# Build graph
# ==============================================================================

title "Building @syndocs/graph"

(
    cd packages/graph
    npm exec tsc -- --noEmitOnError
)

success "@syndocs/graph built successfully"

# ==============================================================================
# Build CLI
# ==============================================================================

title "Building syndocs CLI"

(
    cd packages/cli
    npm exec tsc -- --noEmitOnError
)

CLI_ENTRY="${INSTALL_DIR}/packages/cli/dist/index.js"

[[ -f "${CLI_ENTRY}" ]] || die "CLI build completed but ${CLI_ENTRY} was not created."

chmod +x "${CLI_ENTRY}"

success "syndocs CLI built successfully"

# ==============================================================================
# Install executable
# ==============================================================================

title "Installing command"

SYNDOCS_BIN="${BIN_DIR}/syndocs"

rm -f "${SYNDOCS_BIN}"

ln -s "${CLI_ENTRY}" "${SYNDOCS_BIN}"

[[ -x "${SYNDOCS_BIN}" ]] || die "Could not create executable: ${SYNDOCS_BIN}"

success "Created user-local command"
detail "${SYNDOCS_BIN}"

# ==============================================================================
# PATH
# ==============================================================================

title "Configuring PATH"

PATH_NEEDS_UPDATE=0

case ":${PATH}:" in
    *":${BIN_DIR}:"*)
        success "${BIN_DIR} is already on PATH"
        ;;
    *)
        PATH_NEEDS_UPDATE=1
        warn "${BIN_DIR} is not currently on PATH"
        ;;
esac

SHELL_NAME="$(basename "${SHELL:-bash}")"

case "${SHELL_NAME}" in

    zsh)
        SHELL_RC="${HOME}/.zshrc"
        PATH_LINE='export PATH="$HOME/.local/bin:$PATH"'
        ;;

    bash)
        if [[ -f "${HOME}/.bashrc" ]]; then
            SHELL_RC="${HOME}/.bashrc"
        else
            SHELL_RC="${HOME}/.bash_profile"
        fi
        PATH_LINE='export PATH="$HOME/.local/bin:$PATH"'
        ;;

    fish)
        SHELL_RC="${HOME}/.config/fish/config.fish"
        PATH_LINE='fish_add_path "$HOME/.local/bin"'
        ;;

    *)
        SHELL_RC=""
        PATH_LINE='export PATH="$HOME/.local/bin:$PATH"'
        ;;
esac

if (( PATH_NEEDS_UPDATE == 1 )); then

    if [[ -n "${SHELL_RC}" ]]; then

        mkdir -p "$(dirname "${SHELL_RC}")"
        touch "${SHELL_RC}"

        if ! grep -Fq "${PATH_LINE}" "${SHELL_RC}" 2>/dev/null; then

            {
                echo ""
                echo "# SynDocs"
                echo "${PATH_LINE}"
            } >> "${SHELL_RC}"

            success "Added ~/.local/bin to ${SHELL_RC}"
        else
            success "PATH configuration already exists in ${SHELL_RC}"
        fi

    else

        warn "Could not automatically determine your shell configuration."
        detail "Add ~/.local/bin to PATH manually."
    fi
fi

# Make available immediately.
export PATH="${BIN_DIR}:${PATH}"

# ==============================================================================
# Verify command
# ==============================================================================

title "Verifying installation"

if ! command -v syndocs >/dev/null 2>&1; then

    warn "syndocs is installed but is not visible through PATH yet."
    echo ""

    info "The executable is here:"
    detail "${SYNDOCS_BIN}"
    echo ""

    if [[ -n "${SHELL_RC}" ]]; then
        info "Restart your shell or run:"
        echo ""
        printf '    %bsource %s%b\n' "${CYAN}" "${SHELL_RC}" "${RESET}"
        echo ""
    fi

else

    success "syndocs command is available"

    if SYNDOCS_VERSION="$(syndocs --version 2>/dev/null)"; then
        success "Version: ${SYNDOCS_VERSION}"
    fi

    info "Command:"
    detail "$(command -v syndocs)"
fi

# ==============================================================================
# Optional CodeGraph
# ==============================================================================

echo ""

if command -v codegraph >/dev/null 2>&1; then
    success "CodeGraph detected"
else
    warn "CodeGraph is not installed"
    detail "Optional: graph, wiki-link and blast-radius features may use CodeGraph."
    echo ""
    detail "Install with:"
    printf '    %bnpm install -g @colbymchenry/codegraph%b\n' "${CYAN}" "${RESET}"
fi

# ==============================================================================
# Final summary
# ==============================================================================

echo ""
printf '%b\n' "${GREEN}${BOLD}"
echo "  ╔══════════════════════════════════════════════════════════════════╗"
echo "  ║                                                                  ║"
echo "  ║              ✓ SynDocs installed successfully                   ║"
echo "  ║                                                                  ║"
echo "  ╚══════════════════════════════════════════════════════════════════╝"
printf '%b\n' "${RESET}"

echo ""
printf '  %bInstallation:%b %s\n' "${BOLD}" "${RESET}" "${INSTALL_DIR}"
printf '  %bCommand:%b      %s\n' "${BOLD}" "${RESET}" "${SYNDOCS_BIN}"
printf '  %bNode.js:%b      %s\n' "${BOLD}" "${RESET}" "${NODE_VERSION}"

echo ""
printf '%bGet started%b\n' "${BOLD}" "${RESET}"
line

printf '  %b1.%b Go to your project:\n' "${CYAN}" "${RESET}"
printf '     %bcd your-project%b\n' "${CYAN}" "${RESET}"

printf '  %b2.%b Initialize SynDocs:\n' "${CYAN}" "${RESET}"
printf '     %bsyndocs init%b\n' "${CYAN}" "${RESET}"

printf '  %b3.%b Check documentation drift:\n' "${CYAN}" "${RESET}"
printf '     %bsyndocs check%b\n' "${CYAN}" "${RESET}"

printf '  %b4.%b Start the web UI:\n' "${CYAN}" "${RESET}"
printf '     %bsyndocs serve%b\n' "${CYAN}" "${RESET}"

echo ""
printf '  %bWeb UI:%b http://localhost:4748\n' "${BOLD}" "${RESET}"
printf '  %bDocs:%b   https://github.com/piedpipr/SynDocs#readme\n' "${BOLD}" "${RESET}"

if (( PATH_NEEDS_UPDATE == 1 )) && [[ -n "${SHELL_RC}" ]]; then
    echo ""
    printf '%bOne final step:%b\n' "${YELLOW}${BOLD}" "${RESET}"
    printf '  Run:\n\n'
    printf '    %bsource %s%b\n' "${CYAN}" "${SHELL_RC}" "${RESET}"
    echo ""
fi

echo ""
printf '%bHappy documenting! 🚀%b\n' "${BOLD}" "${RESET}"
echo ""
```
