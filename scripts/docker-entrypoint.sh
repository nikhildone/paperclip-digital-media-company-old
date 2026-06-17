#!/bin/sh
set -e

# Render runs this image as the non-root node user because the Dockerfile has USER node.
# In that case, switching again with gosu causes: failed switching to "node": operation not permitted.
# If the container is ever started as root, keep the old safe behavior and drop to node.
if [ "$(id -u)" = "0" ]; then
  PUID=${USER_UID:-1000}
  PGID=${USER_GID:-1000}
  changed=0

  if [ "$(id -u node)" -ne "$PUID" ]; then
    echo "Updating node UID to $PUID"
    usermod -o -u "$PUID" node
    changed=1
  fi

  if [ "$(id -g node)" -ne "$PGID" ]; then
    echo "Updating node GID to $PGID"
    groupmod -o -g "$PGID" node
    usermod -g "$PGID" node
    changed=1
  fi

  if [ "$changed" = "1" ]; then
    chown -R node:node /paperclip
  fi

  exec gosu node "$@"
fi

exec "$@"
