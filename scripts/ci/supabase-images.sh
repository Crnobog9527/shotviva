#!/usr/bin/env bash
# The Docker images of the local Supabase stack, kept in the Actions cache (T88) so a run does
# not depend on the registry, whose 5xx used to fail the "supabase db tests" job. One tar per
# image, loaded four at a time: a single `docker load` of the whole set is slower than pulling.
#
#   scripts/ci/supabase-images.sh load <dir>   load <dir>/*.tar, then pull (with retries) any
#                                              image in <dir>/images.txt still missing
#   scripts/ci/supabase-images.sh list         "<image> <image id>" for every Supabase image on
#                                              this machine, sorted: what `supabase start` pulled
#                                              (it pulls some services it then does not start),
#                                              and the cache key's input
#   scripts/ci/supabase-images.sh save <dir> <list>   one tar per listed image, and the list
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)

case "${1:-}" in
  load)
    dir=${2:?dir}
    find "$dir" -name '*.tar' -print0 | xargs -0 -r -P 4 -n 1 docker load --quiet --input
    while read -r image _; do
      [ -n "$image" ] || continue
      docker image inspect "$image" > /dev/null 2>&1 || "$here/retry.sh" "$here/docker-pull.sh" "$image"
    done < "$dir/images.txt"
    ;;
  list)
    docker images --format '{{.Repository}}:{{.Tag}}' \
      | grep -E '^(public\.ecr\.aws/supabase|supabase|postgrest)/[^:]+:[^<]+$' \
      | sort -u \
      | while read -r image; do echo "$image $(docker image inspect --format '{{.Id}}' "$image")"; done
    ;;
  save)
    dir=${2:?dir}
    list=${3:?list file}
    mkdir -p "$dir"
    cp "$list" "$dir/images.txt"
    cut -d' ' -f1 "$list" \
      | xargs -r -P 4 -I '{}' sh -c 'docker save --output "$1/$(printf %s "$2" | tr "/:" "__").tar" "$2"' _ "$dir" '{}'
    ;;
  *)
    echo "usage: supabase-images.sh load <dir> | list | save <dir> <list>" >&2
    exit 64
    ;;
esac
