#!/usr/bin/env bash

# ==============================================================================
# SynDocs Local Installer
# ==============================================================================
#
# Builds and installs SynDocs from the directory containing this script.
# Run this after cloning or checking out the repository on any branch:
#
#   git clone https://github.com/piedpipr/SynDocs.git
#   cd SynDocs
#   ./install.sh
#
# This script is also called automatically by quickinstall.sh after it
# clones the repository — you do not need to invoke it manually in that case.
#
# Commands:
#
#   ./install.sh install      # Build and link SynDocs (default)
#   ./install.sh reinstall    # Clean rebuild — wipes dist dirs and rebuilds
#   ./install.sh uninstall    # Remove the binary symlink only
#
# Options:
#
#   -y, --yes                 # Skip interactive confirmation prompts
#
# Note:
#   "update" is intentionally not supported here. To update a local
#   checkout run: git pull && ./install.sh install
#
# ==============================================================================

set -Eeuo pipefail

# Directory containing this script = the repo root we build from
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BIN_DIR="${HOME}/.local/bin"
SYNDOCS_BIN="${BIN_DIR}/syndocs"

VERSION="0.2.0"
PATH_NEEDS_UPDATE=0   # set by configure_path, read by do_install

# ==============================================================================
# Argument parsing
# ==============================================================================

ACTION="install"
AUTO_YES="n"

while [[ $# -gt 0 ]]; do
    case "$1" in
        install|reinstall|uninstall)
            ACTION="$1"
            shift
            ;;
        -y|--yes)
            AUTO_YES="y"
            shift
            ;;
        -h|--help|help)
            echo "SynDocs Local Installer (v${VERSION})"
            echo ""
            echo "Usage:"
            echo "  install.sh [command] [options]"
            echo ""
            echo "Commands:"
            echo "  install      Build and install SynDocs from this directory (default)"
            echo "  reinstall    Clean rebuild — removes dist dirs then rebuilds"
            echo "  uninstall    Remove the SynDocs binary symlink"
            echo ""
            echo "Options:"
            echo "  -y, --yes    Skip interactive confirmation prompts"
            echo "  -h, --help   Show this help message"
            echo ""
            echo "To update: git pull && ./install.sh install"
            echo ""
            exit 0
            ;;
        *)
            shift
            ;;
    esac
done

# ==============================================================================
# Terminal colours
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
# Set SYNDOCS_NO_BANNER=1 to suppress (used by quickinstall.sh to avoid
# printing the banner twice).
# ==============================================================================

print_banner() {
    [[ "${SYNDOCS_NO_BANNER:-0}" == "1" ]] && return

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
        node scripts/copy-web-assets.js
    )

    CLI_ENTRY="${INSTALL_DIR}/packages/cli/dist/index.js"
    [[ -f "${CLI_ENTRY}" ]] || die "CLI build completed but ${CLI_ENTRY} was not created."

    WEB_ASSET="${INSTALL_DIR}/packages/cli/dist/web/assets/shell.html"
    [[ -f "${WEB_ASSET}" ]] || die "CLI build completed but Web UI assets were not copied to dist/web/assets."

    chmod +x "${CLI_ENTRY}"
    success "syndocs CLI built successfully"

    title "Installing command executable"
    mkdir -p "${BIN_DIR}"
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
# Verify installation
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

    # Remove binary symlink only — in a local checkout the source directory
    # belongs to the user, so we never touch it here.
    if [[ -e "${SYNDOCS_BIN}" || -L "${SYNDOCS_BIN}" ]]; then
        info "Removing binary symlink: ${SYNDOCS_BIN}"
        rm -f "${SYNDOCS_BIN}"
        success "Binary symlink removed"
        removed_anything=1
    else
        detail "No binary symlink found at ${SYNDOCS_BIN}"
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
        warn "No SynDocs binary symlink was found to remove."
    fi

    echo ""
    detail "Source directory preserved: ${INSTALL_DIR}"
    detail "If you have PATH configurations in your shell rc files (.bashrc, .zshrc),"
    detail "you may manually remove the line: export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
}

do_reinstall() {
    title "Reinstalling SynDocs (Clean Build)"

    # Wipe compiled output so we get a guaranteed-clean rebuild.
    for pkg in core graph cli; do
        local dist_dir="${INSTALL_DIR}/packages/${pkg}/dist"
        if [[ -d "${dist_dir}" ]]; then
            info "Removing packages/${pkg}/dist"
            rm -rf "${dist_dir}"
            success "Removed packages/${pkg}/dist"
        fi
    done

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
    reinstall)
        do_reinstall
        ;;
    install)
        do_install "install"
        ;;
    *)
        error "Unknown action: ${ACTION}"
        die "Supported commands: install, reinstall, uninstall"
        ;;
esac
