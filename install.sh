#!/usr/bin/env bash

# ==============================================================================
# SynDocs Installer & Manager
# ==============================================================================
#
# One-line install:
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/piedpipr/SynDocs/main/install.sh)
#
# Commands:
#
#   ./install.sh install      # Install or update SynDocs (default)
#   ./install.sh reinstall    # Clean reinstall from scratch
#   ./install.sh update       # Update existing installation to latest main
#   ./install.sh uninstall    # Remove binary symlink and installation dir
#
# Environment:
#
#   SYNDOCS_DIR=/custom/path  # Defaults to ~/.syndocs
#
# ==============================================================================

set -Eeuo pipefail

REPO="https://github.com/piedpipr/SynDocs.git"
INSTALL_DIR="${SYNDOCS_DIR:-${HOME}/.syndocs}"
BIN_DIR="${HOME}/.local/bin"
SYNDOCS_BIN="${BIN_DIR}/syndocs"

VERSION="0.2.0"

# ==============================================================================
# Argument parsing
# ==============================================================================

ACTION="install"
AUTO_YES="n"

while [[ $# -gt 0 ]]; do
    case "$1" in
        install|reinstall|update|uninstall)
            ACTION="$1"
            shift
            ;;
        -y|--yes)
            AUTO_YES="y"
            shift
            ;;
        -h|--help|help)
            echo "SynDocs Installer & Manager (v${VERSION})"
            echo ""
            echo "Usage:"
            echo "  install.sh [command] [options]"
            echo ""
            echo "Commands:"
            echo "  install      Install SynDocs (default if omitted)"
            echo "  reinstall    Clean reinstall (removes previous install and rebuilds)"
            echo "  update       Update existing installation from git and rebuild"
            echo "  uninstall    Remove SynDocs binary and installation directory"
            echo ""
            echo "Options:"
            echo "  -y, --yes    Skip interactive confirmation prompts"
            echo "  -h, --help   Show this help message"
            echo ""
            exit 0
            ;;
        *)
            # Ignore unknown options or treat as extra args
            shift
            ;;
    esac
done

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
    error "Operation failed (${ACTION})."
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

print_banner() {
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
}

# ==============================================================================
# Environment validation
# ==============================================================================

check_environment() {
    title "Environment"

    info "Operating system : $(uname -s)"
    info "Architecture     : $(uname -m)"
    info "Shell            : ${SHELL:-unknown}"
    info "User             : $(id -un)"
    info "Home             : ${HOME}"
    info "Install          : ${INSTALL_DIR}"
    info "Binary directory : ${BIN_DIR}"
    info "Action           : ${ACTION}"

    echo ""

    [[ -n "${HOME:-}" ]] || die "\$HOME is not set."
    [[ "${HOME}" != "/" ]] || die "HOME=/ is not a valid user home directory."
    mkdir -p "${HOME}" || die "Cannot access home directory: ${HOME}"
}

# ==============================================================================
# Prerequisites
# ==============================================================================

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

check_prerequisites() {
    title "Checking prerequisites"

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
}

# ==============================================================================
# Prepare directories & clone/update repo
# ==============================================================================

prepare_and_download() {
    title "Preparing installation"

    if [[ -e "${INSTALL_DIR}" && ! -d "${INSTALL_DIR}/.git" ]]; then
        die "Installation directory already exists but is not a SynDocs repository:

    ${INSTALL_DIR}

Move it away or remove it, then run the installer again."
    fi

    mkdir -p "$(dirname "${INSTALL_DIR}")"
    mkdir -p "${BIN_DIR}"

    success "Installation directories are ready"

    title "Downloading SynDocs"

    if [[ -d "${INSTALL_DIR}/.git" ]]; then
        info "Existing SynDocs installation detected"
        detail "Location: ${INSTALL_DIR}"

        OLD_COMMIT="$(git -C "${INSTALL_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)"

        info "Fetching latest version..."
        git -C "${INSTALL_DIR}" remote set-url origin "${REPO}" 2>/dev/null || git -C "${INSTALL_DIR}" remote add origin "${REPO}"
        git -C "${INSTALL_DIR}" fetch origin main
        git -C "${INSTALL_DIR}" reset --hard origin/main

        NEW_COMMIT="$(git -C "${INSTALL_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)"

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

        COMMIT="$(git -C "${INSTALL_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
        echo ""
        success "Repository downloaded"
        detail "Commit: ${COMMIT}"
    fi
}

# ==============================================================================
# Build & link packages
# ==============================================================================

build_and_link() {
    cd "${INSTALL_DIR}"

    title "Verifying SynDocs source"

    [[ -f "package.json" ]] || die "package.json was not found."
    [[ -d "packages/core" ]] || die "packages/core was not found."
    [[ -d "packages/graph" ]] || die "packages/graph was not found."
    [[ -d "packages/cli" ]] || die "packages/cli was not found."

    success "Repository structure looks valid"

    title "Installing dependencies"
    info "Running npm install"
    detail "This may take a moment on the first installation."
    echo ""

    npm install

    echo ""
    success "Dependencies installed"

    title "Building @syndocs/core"
    (
        cd packages/core
        npm exec tsc -- --noEmitOnError
    )
    success "@syndocs/core built successfully"

    title "Building @syndocs/graph"
    (
        cd packages/graph
        npm exec tsc -- --noEmitOnError
    )
    success "@syndocs/graph built successfully"

    title "Building syndocs CLI"
    (
        cd packages/cli
        npm exec tsc -- --noEmitOnError
    )

    CLI_ENTRY="${INSTALL_DIR}/packages/cli/dist/index.js"
    [[ -f "${CLI_ENTRY}" ]] || die "CLI build completed but ${CLI_ENTRY} was not created."

    chmod +x "${CLI_ENTRY}"
    success "syndocs CLI built successfully"

    title "Installing command executable"
    rm -f "${SYNDOCS_BIN}"
    ln -s "${CLI_ENTRY}" "${SYNDOCS_BIN}"

    [[ -x "${SYNDOCS_BIN}" ]] || die "Could not create executable: ${SYNDOCS_BIN}"

    success "Created user-local command"
    detail "${SYNDOCS_BIN} → ${CLI_ENTRY}"
}

# ==============================================================================
# Configure PATH
# ==============================================================================

configure_path() {
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

    export PATH="${BIN_DIR}:${PATH}"
}

# ==============================================================================
# Verify Command
# ==============================================================================

verify_installation() {
    title "Verifying installation"

    if ! command -v syndocs >/dev/null 2>&1; then
        warn "syndocs is installed but is not visible through PATH yet."
        echo ""
        info "The executable is here:"
        detail "${SYNDOCS_BIN}"
        echo ""

        if [[ -n "${SHELL_RC:-}" ]]; then
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
}

# ==============================================================================
# CodeGraph Integration
# ==============================================================================

check_codegraph() {
    echo ""
    title "CodeGraph Integration"

    if command -v codegraph >/dev/null 2>&1; then
        success "CodeGraph is installed and detected"
    else
        info "CodeGraph is required for full functionality:"
        detail "• AST-exact micro-doc boundaries"
        detail "• Symbol impact and downstream blast-radius analysis"
        detail "• Automated wiki-links and symbol call graphs"
        echo ""

        install_cg="y"
        if [[ -t 0 && "${AUTO_YES}" != "y" ]]; then
            printf '  %bWould you like to install CodeGraph globally via npm now? [Y/n]: %b' "${BOLD}${YELLOW}" "${RESET}"
            read -r reply || reply=""
            case "$reply" in
                [nN][oO]|[nN]) install_cg="n" ;;
                *) install_cg="y" ;;
            esac
        elif [[ "${CI:-}" == "true" || "${DEBIAN_FRONTEND:-}" == "noninteractive" || "${AUTO_YES}" == "y" ]]; then
            install_cg="n"
        fi

        if [[ "$install_cg" == "y" ]]; then
            info "Installing @colbymchenry/codegraph globally via npm..."
            if npm install -g @colbymchenry/codegraph; then
                success "CodeGraph installed successfully"
            else
                warn "Could not install CodeGraph globally (permission or network error)."
                detail "You can install it manually later: npm install -g @colbymchenry/codegraph"
            fi
        else
            info "Skipping CodeGraph installation."
            detail "SynDocs will use regex boundaries for micro-docs and blast-radius analysis will be disabled."
            detail "You can install CodeGraph at any time with: npm install -g @colbymchenry/codegraph"
        fi
    fi
}

# ==============================================================================
# ACTIONS
# ==============================================================================

do_uninstall() {
    title "Uninstalling SynDocs"

    local removed_anything=0

    # 1. Remove binary symlink
    if [[ -e "${SYNDOCS_BIN}" || -L "${SYNDOCS_BIN}" ]]; then
        info "Removing binary symlink: ${SYNDOCS_BIN}"
        rm -f "${SYNDOCS_BIN}"
        success "Binary symlink removed"
        removed_anything=1
    else
        detail "No binary symlink found at ${SYNDOCS_BIN}"
    fi

    # 2. Remove installation directory
    if [[ -d "${INSTALL_DIR}" ]]; then
        if [[ "${AUTO_YES}" != "y" && -t 0 ]]; then
            echo ""
            printf '  %bAre you sure you want to remove the installation directory?%b\n' "${BOLD}${YELLOW}" "${RESET}"
            detail "Location: ${INSTALL_DIR}"
            printf '  %bProceed? [y/N]: %b' "${BOLD}${YELLOW}" "${RESET}"
            read -r reply || reply=""
            case "$reply" in
                [yY][eE][sS]|[yY]) ;;
                *)
                    info "Preserved installation directory: ${INSTALL_DIR}"
                    echo ""
                    return 0
                    ;;
            esac
        fi

        info "Removing installation directory: ${INSTALL_DIR}"
        cd "${HOME}"
        rm -rf "${INSTALL_DIR}"
        success "Installation directory removed"
        removed_anything=1
    else
        detail "No installation directory found at ${INSTALL_DIR}"
    fi

    echo ""
    line
    if (( removed_anything == 1 )); then
        printf '%b\n' "${GREEN}${BOLD}"
        echo "  ╔══════════════════════════════════════════════════════════════════╗"
        echo "  ║                                                                  ║"
        echo "  ║             ✓ SynDocs uninstalled successfully                   ║"
        echo "  ║                                                                  ║"
        echo "  ╚══════════════════════════════════════════════════════════════════╝"
        printf '%b\n' "${RESET}"
    else
        warn "No SynDocs installation was found to remove."
    fi

    echo ""
    detail "Note: If you have PATH configurations in your shell rc files (.bashrc, .zshrc),"
    detail "you may manually remove the line: export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
}

do_update() {
    title "Updating SynDocs"

    if [[ ! -d "${INSTALL_DIR}" ]]; then
        warn "SynDocs installation not found at ${INSTALL_DIR}"
        info "Switching to full installation..."
        do_install "install"
        return
    fi

    check_environment
    check_prerequisites

    title "Updating SynDocs repository"
    OLD_COMMIT="$(git -C "${INSTALL_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)"

    info "Fetching latest code from ${REPO}..."
    git -C "${INSTALL_DIR}" remote set-url origin "${REPO}" 2>/dev/null || git -C "${INSTALL_DIR}" remote add origin "${REPO}"
    git -C "${INSTALL_DIR}" fetch origin main
    git -C "${INSTALL_DIR}" reset --hard origin/main
    NEW_COMMIT="$(git -C "${INSTALL_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)"

    if [[ "${OLD_COMMIT}" == "${NEW_COMMIT}" ]]; then
        success "Already up to date (${NEW_COMMIT})"
    else
        success "Updated repository: ${OLD_COMMIT} → ${NEW_COMMIT}"
    fi

    build_and_link
    configure_path
    verify_installation

    echo ""
    printf '%b\n' "${GREEN}${BOLD}"
    echo "  ╔══════════════════════════════════════════════════════════════════╗"
    echo "  ║                                                                  ║"
    echo "  ║                ✓ SynDocs updated successfully                    ║"
    echo "  ║                                                                  ║"
    echo "  ╚══════════════════════════════════════════════════════════════════╝"
    printf '%b\n' "${RESET}"
    echo ""
    printf '  %bInstallation:%b %s\n' "${BOLD}" "${RESET}" "${INSTALL_DIR}"
    printf '  %bCommand:%b      %s\n' "${BOLD}" "${RESET}" "${SYNDOCS_BIN}"
    printf '  %bVersion:%b      %s (%s)\n' "${BOLD}" "${RESET}" "${VERSION}" "${NEW_COMMIT}"
    echo ""
}

do_reinstall() {
    title "Reinstalling SynDocs (Clean Reinstall)"

    if [[ -d "${INSTALL_DIR}" ]]; then
        info "Removing previous installation directory: ${INSTALL_DIR}"
        cd "${HOME}"
        rm -rf "${INSTALL_DIR}"
        success "Previous installation directory removed"
    fi

    if [[ -e "${SYNDOCS_BIN}" || -L "${SYNDOCS_BIN}" ]]; then
        info "Removing old binary symlink: ${SYNDOCS_BIN}"
        rm -f "${SYNDOCS_BIN}"
        success "Old binary symlink removed"
    fi

    do_install "reinstall"
}

do_install() {
    local mode="${1:-install}"

    check_environment
    check_prerequisites
    prepare_and_download
    build_and_link
    configure_path
    verify_installation
    check_codegraph

    echo ""
    printf '%b\n' "${GREEN}${BOLD}"
    echo "  ╔══════════════════════════════════════════════════════════════════╗"
    echo "  ║                                                                  ║"
    if [[ "${mode}" == "reinstall" ]]; then
        echo "  ║             ✓ SynDocs reinstalled successfully                   ║"
    else
        echo "  ║              ✓ SynDocs installed successfully                    ║"
    fi
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

    if (( PATH_NEEDS_UPDATE == 1 )) && [[ -n "${SHELL_RC:-}" ]]; then
        echo ""
        printf '%bOne final step:%b\n' "${YELLOW}${BOLD}" "${RESET}"
        printf '  Run:\n\n'
        printf '    %bsource %s%b\n' "${CYAN}" "${SHELL_RC}" "${RESET}"
        echo ""
    fi

    echo ""
    printf '%bHappy documenting! 🚀%b\n' "${BOLD}" "${RESET}"
    echo ""
}

# ==============================================================================
# Main execution
# ==============================================================================

print_banner

case "${ACTION}" in
    uninstall)
        do_uninstall
        ;;
    update)
        do_update
        ;;
    reinstall)
        do_reinstall
        ;;
    install)
        do_install "install"
        ;;
    *)
        error "Unknown action: ${ACTION}"
        die "Supported commands: install, reinstall, update, uninstall"
        ;;
esac
