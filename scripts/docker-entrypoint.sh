#!/bin/sh
set -eu

if [ -z "${SESSION_SECRET:-}" ] || [ "$SESSION_SECRET" = "replace-with-long-random-value" ]; then
  echo "SESSION_SECRET must be set to a random value before starting MeetingLoop AI." >&2
  exit 1
fi

if [ "${#SESSION_SECRET}" -lt 32 ]; then
  echo "SESSION_SECRET must contain at least 32 characters." >&2
  exit 1
fi

exec "$@"
