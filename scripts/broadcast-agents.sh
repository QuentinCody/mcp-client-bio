#!/usr/bin/env bash
# broadcast-agents.sh - Broadcast messages to all AI agent tmux panes
#
# Usage:
#   ./broadcast-agents.sh "Your message here"    # Send message to all panes
#   ./broadcast-agents.sh --file kickoff.md      # Send contents of a file
#   ./broadcast-agents.sh --sync                 # Enable synchronize-panes mode
#   ./broadcast-agents.sh --unsync               # Disable synchronize-panes mode
#
# Based on Jeffrey Emanuel's (@doodlestein) multi-agent workflow:
# https://x.com/Dicklesworthstone/status/1929001122598002733

set -euo pipefail

SESSION_NAME="${AGENT_SESSION:-agents}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if tmux session exists
check_session() {
    if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        log_error "tmux session '$SESSION_NAME' not found"
        log_info "Create one with: tmux new-session -s $SESSION_NAME"
        exit 1
    fi
}

# Get list of all panes in the session
list_panes() {
    tmux list-panes -t "$SESSION_NAME" -F "#{pane_id}:#{pane_current_command}" 2>/dev/null
}

# Send text to a specific pane
send_to_pane() {
    local pane_id="$1"
    local text="$2"
    tmux send-keys -t "$pane_id" "$text"
}

# Broadcast message to all panes in session
broadcast_message() {
    local message="$1"
    local panes
    panes=$(tmux list-panes -t "$SESSION_NAME" -F "#{pane_id}" 2>/dev/null)

    if [[ -z "$panes" ]]; then
        log_error "No panes found in session '$SESSION_NAME'"
        exit 1
    fi

    local count=0
    for pane in $panes; do
        send_to_pane "$pane" "$message"
        ((count++))
    done

    log_success "Broadcast to $count pane(s) in session '$SESSION_NAME'"
}

# Enable synchronize-panes (keystrokes go to all panes)
enable_sync() {
    check_session
    tmux setw -t "$SESSION_NAME" synchronize-panes on
    log_success "Synchronize-panes ENABLED for session '$SESSION_NAME'"
    log_info "All keystrokes will now be sent to all panes"
    log_info "Disable with: $0 --unsync"
}

# Disable synchronize-panes
disable_sync() {
    check_session
    tmux setw -t "$SESSION_NAME" synchronize-panes off
    log_success "Synchronize-panes DISABLED for session '$SESSION_NAME'"
}

# Show status of all panes
show_status() {
    check_session
    log_info "Panes in session '$SESSION_NAME':"
    tmux list-panes -t "$SESSION_NAME" -F "  Pane #{pane_index}: #{pane_current_command} (#{pane_width}x#{pane_height})"

    local sync_status
    sync_status=$(tmux show-window-options -t "$SESSION_NAME" synchronize-panes 2>/dev/null | grep -o 'on\|off' || echo "off")
    log_info "Synchronize-panes: $sync_status"
}

# Create a new agent session with multiple panes
create_session() {
    local num_panes="${1:-4}"

    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        log_warn "Session '$SESSION_NAME' already exists"
        read -p "Kill and recreate? [y/N] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            tmux kill-session -t "$SESSION_NAME"
        else
            exit 0
        fi
    fi

    # Create session with first pane
    tmux new-session -d -s "$SESSION_NAME" -c "$(pwd)"

    # Add additional panes in a grid layout
    for ((i=1; i<num_panes; i++)); do
        if ((i % 2 == 1)); then
            tmux split-window -h -t "$SESSION_NAME"
        else
            tmux split-window -v -t "$SESSION_NAME"
        fi
    done

    # Even out the layout
    tmux select-layout -t "$SESSION_NAME" tiled

    log_success "Created session '$SESSION_NAME' with $num_panes panes"
    log_info "Attach with: tmux attach -t $SESSION_NAME"
}

# Print usage
usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS] [MESSAGE]

Broadcast messages to AI agent tmux panes for multi-agent coordination.

Options:
  -f, --file FILE     Read message from FILE
  -s, --sync          Enable synchronize-panes mode
  -u, --unsync        Disable synchronize-panes mode
  -l, --status        List panes and status
  -c, --create [N]    Create new session with N panes (default: 4)
  -n, --session NAME  Use session NAME (default: agents, or \$AGENT_SESSION)
  -e, --enter         Add Enter key after message
  -h, --help          Show this help

Examples:
  # Broadcast a message to all agent panes
  $(basename "$0") "Check your inbox and coordinate on remaining tasks"

  # Send kickoff message from file with Enter
  $(basename "$0") --file agent-kickoff.md --enter

  # Enable synchronized typing (all keystrokes go to all panes)
  $(basename "$0") --sync

  # Create a 6-pane session for agents
  $(basename "$0") --create 6

Environment:
  AGENT_SESSION    tmux session name (default: agents)

Workflow (Jeffrey Emanuel style):
  1. Create session:     $(basename "$0") --create 4
  2. Attach and start agents in each pane (codex, claude, etc.)
  3. Register with Agent Mail and read AGENTS.md
  4. Broadcast kickoff:  $(basename "$0") -f scripts/agent-kickoff.md -e
  5. Let agents coordinate via Agent Mail for hours!

EOF
}

# Main
main() {
    local message=""
    local from_file=""
    local add_enter=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -f|--file)
                from_file="$2"
                shift 2
                ;;
            -s|--sync)
                enable_sync
                exit 0
                ;;
            -u|--unsync)
                disable_sync
                exit 0
                ;;
            -l|--status)
                show_status
                exit 0
                ;;
            -c|--create)
                if [[ -n "${2:-}" && "$2" =~ ^[0-9]+$ ]]; then
                    create_session "$2"
                    shift 2
                else
                    create_session
                    shift
                fi
                exit 0
                ;;
            -n|--session)
                SESSION_NAME="$2"
                shift 2
                ;;
            -e|--enter)
                add_enter=true
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            -*)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
            *)
                message="$1"
                shift
                ;;
        esac
    done

    check_session

    # Read message from file if specified
    if [[ -n "$from_file" ]]; then
        if [[ ! -f "$from_file" ]]; then
            log_error "File not found: $from_file"
            exit 1
        fi
        message=$(cat "$from_file")
    fi

    if [[ -z "$message" ]]; then
        log_error "No message provided"
        usage
        exit 1
    fi

    # Broadcast the message
    broadcast_message "$message"

    # Optionally send Enter key
    if [[ "$add_enter" == true ]]; then
        sleep 0.1
        broadcast_message "Enter"
        log_info "Sent Enter key to execute"
    fi
}

main "$@"
