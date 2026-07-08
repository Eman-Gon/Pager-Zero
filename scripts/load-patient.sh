#!/usr/bin/env bash
# Load a patient repo into target-repo (the single repo the sensor scans).
#
#   scripts/load-patient.sh <name>
#
# Copies the patient's clean source/tests into target-repo, then commits and
# (re)tags `good` so the sensor starts from a healthy baseline. From there,
# the UI "Break production" button (POST /demo/break) injects that patient's
# scripted bug and "Restore" (POST /demo/reset) resets to `good`.
#
# NOTE: the sensor builds its code graph once, at startup. After loading a new
# patient you MUST restart the sensor so it re-analyzes the new source tree.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
name="${1:-}"
patients_dir="$root/patients"
dst="$root/target-repo"

if [ -z "$name" ] || [ ! -d "$patients_dir/$name" ]; then
  echo "Usage: scripts/load-patient.sh <name>"
  echo "Available patients:"
  for d in "$patients_dir"/*/; do
    [ -d "$d" ] && echo "  - $(basename "$d")"
  done
  exit 1
fi

src="$patients_dir/$name"

echo "Loading patient '$name' into target-repo…"

# Clear the working tree but keep git history and installed deps.
find "$dst" -mindepth 1 -maxdepth 1 \
  ! -name '.git' ! -name 'node_modules' ! -name 'package-lock.json' \
  -exec rm -rf {} +

# Copy the patient's tracked files (skip its own .git / node_modules).
for item in src test package.json tsconfig.json .gitignore; do
  [ -e "$src/$item" ] && cp -R "$src/$item" "$dst/"
done

cd "$dst"
git add -A
git -c user.name='PagerZero' -c user.email='demo@pagerzero.local' \
  commit -q -m "load patient: $name (clean baseline)" || echo "  (no changes to commit)"
git tag -f good >/dev/null
echo "  target-repo is now '$name' at tag good ($(git rev-parse --short HEAD))."

# Deps: reuse if the same major toolchain is already installed, else reinstall.
if [ ! -x "$dst/node_modules/.bin/vitest" ]; then
  echo "  installing deps…"
  (cd "$dst" && npm install --no-audit --no-fund --silent)
fi

echo
echo "Done. Next steps:"
echo "  1. Restart the sensor so it rebuilds the code graph for '$name':"
echo "       docker compose restart sensor      # docker stack"
echo "       (or restart your native sensor process)"
echo "  2. For the ship step to open a real PR, point the responder at the"
echo "     matching GitHub repo for this patient:"
echo "       GITHUB_REPO=Eman-Gon/patient-$name"
echo "       GITHUB_TOKEN=<a token with repo scope>"
echo "  3. In Mission Control, click 'Break production' to inject the bug,"
echo "     then watch detect → diagnose → verify → ship. 'Restore' resets to good."
