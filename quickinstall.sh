#!/usr/bin/env bash

# ==============================================================================
# SynDocs Quick Installer
# ==============================================================================
#
# One-line install (replace "main" in the URL with your branch):
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/piedpipr/SynDocs/dev-pre/quickinstall.sh)
#
# ┌─────────────────────────────────────────────────────────────────────┐
# │  Per-branch configuration — the ONLY section you need to update     │
# │  when cutting this file for a different branch:                     │
# └─────────────────────────────────────────────────────────────────────┘
#
#   BRANCH="dev-pre"   ← change this
#
# (The curl URL in your docs/README also needs updating to match.)
#
# Commands:
#
#   ./quickinstall.sh install      # Install or update SynDocs (default)
#   ./quickinstall.sh reinstall    # Clean reinstall from scratch
#   ./quickinstall.sh update       # Update existing installation to latest
#   ./quickinstall.sh uninstall    # Remove binary symlink and installation dir
#
# Options:
#
#   -y, --yes                      # Skip interactive confirmation prompts
#
# Environment:
#
#   SYNDOCS_DIR=/custom/path       # Defaults to ~/.syndocs
#
# ==============================================================================

set -Eeuo pipefail

# ╔══════════════════════════════════════════════════════════════════════╗
# ║  Branch configuration — change BRANCH per release / feature branch  ║
# ╚══════════════════════════════════════════════════════════════════════╝
REPO="https://github.com/piedpipr/SynDocs.git"
BRANCH="dev-pre"
# ══════════════════════════════════════════════════════════════════════

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
  install | reinstall | update | uninstall)
    ACTION="$1"
    shift
    ;;
  -y | --yes)
    AUTO_YES="y"
    shift
    ;;
  -h | --help | help)
    echo "SynDocs Quick Installer (v${VERSION})"
    echo ""
    echo "Usage:"
    echo "  quickinstall.sh [command] [options]"
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
# Download — clone or update the repository
# ==============================================================================

prepare_and_download() {
  title "Preparing installation"

  command -v git >/dev/null 2>&1 || die "git is required to download SynDocs. Please install git and try again."

  if [[ -e "${INSTALL_DIR}" && ! -d "${INSTALL_DIR}/.git" ]]; then
    die "Installation directory already exists but is not a SynDocs repository:

    ${INSTALL_DIR}

Move it away or remove it, then run the installer again."
  fi

  mkdir -p "$(dirname "${INSTALL_DIR}")"
  mkdir -p "${BIN_DIR}"

  success "Installation directories are ready"

  title "Downloading SynDocs (branch: ${BRANCH})"

  if [[ -d "${INSTALL_DIR}/.git" ]]; then
    info "Existing SynDocs installation detected"
    detail "Location: ${INSTALL_DIR}"

    OLD_COMMIT="$(git -C "${INSTALL_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)"

    info "Fetching latest version from branch '${BRANCH}'..."
    git -C "${INSTALL_DIR}" remote set-url origin "${REPO}" 2>/dev/null || git -C "${INSTALL_DIR}" remote add origin "${REPO}"
    git -C "${INSTALL_DIR}" fetch origin "${BRANCH}"
    git -C "${INSTALL_DIR}" reset --hard "origin/${BRANCH}"

    NEW_COMMIT="$(git -C "${INSTALL_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)"

    if [[ "${OLD_COMMIT}" == "${NEW_COMMIT}" ]]; then
      success "Already up to date (${NEW_COMMIT})"
    else
      success "Updated ${OLD_COMMIT} → ${NEW_COMMIT}"
    fi
  else
    info "Cloning repository (branch: ${BRANCH}):"
    detail "${REPO}"
    echo ""

    git clone --depth=1 --branch "${BRANCH}" "${REPO}" "${INSTALL_DIR}"

    COMMIT="$(git -C "${INSTALL_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
    echo ""
    success "Repository downloaded"
    detail "Branch : ${BRANCH}"
    detail "Commit : ${COMMIT}"
  fi
}

# ==============================================================================
# Delegate build + link to install.sh inside the cloned repo
# ==============================================================================

run_local_installer() {
  local mode="${1:-install}"
  local installer="${INSTALL_DIR}/install.sh"

  [[ -f "${installer}" ]] || die "install.sh not found at ${installer} — the repository may be incomplete."
  chmod +x "${installer}"

  local args=("${mode}")
  [[ "${AUTO_YES}" == "y" ]] && args+=("-y")

  echo ""
  info "Handing off to local installer (install.sh)..."
  echo ""

  # SYNDOCS_NO_BANNER=1 suppresses the duplicate banner inside install.sh.
  # The `|| exit $?` pattern lets install.sh's own error trap handle failures
  # cleanly without also firing this script's trap.
  SYNDOCS_NO_BANNER=1 bash "${installer}" "${args[@]}" || exit $?
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
      [yY][eE][sS] | [yY]) ;;
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
  if ((removed_anything == 1)); then
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
  if [[ ! -d "${INSTALL_DIR}" ]]; then
    warn "SynDocs installation not found at ${INSTALL_DIR}"
    info "Switching to full installation..."
    do_install "install"
    return
  fi

  prepare_and_download
  run_local_installer "install"
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

  prepare_and_download
  run_local_installer "${mode}"
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
