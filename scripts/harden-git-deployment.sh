#!/bin/sh
# Security report A-05. Run once, from the module's root, ONLY if it was deployed by cloning this Git
# repository directly under the web root (never do this in production — see README.md > Installation >
# Déploiement et sécurité). .git/ cannot carry its own tracked .htaccess: it is the repository's own
# metadata, outside of anything a commit in this repository can ever place inside it.
set -e
cd "$(dirname "$0")/.."
if [ ! -d .git ]; then
  echo "No .git/ here — nothing to harden (this deployment was not made by cloning the repo). Exiting." >&2
  exit 0
fi
cat > .git/.htaccess <<'EOF'
<IfModule mod_authz_core.c>
    Require all denied
</IfModule>
<IfModule !mod_authz_core.c>
    Order allow,deny
    Deny from all
</IfModule>
EOF
echo "Wrote .git/.htaccess (requires AllowOverride All on this directory to take effect)."
