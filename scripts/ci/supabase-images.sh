#!/usr/bin/env bash
# The Docker images of the local Supabase stack, kept in the Actions cache (T88) so a run does
# not pull them from the registry, whose 5xx used to fail the "supabase db tests" job.
#
#   scripts/ci/supabase-images.sh load <dir>          docker load <dir>/images.tar, then pull
#                                                     (with retries) any listed image still missing
#   scripts/ci/supabase-images.sh list <project id>   "<image> <image id>" per running container
#                                                     of that stack, sorted: the cache key's input
#   scripts/ci/supabase-images.sh save <dir> <list>   docker save every image in the list to
#                                                     <dir>/images.tar, and the list to images.txt
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)

case "${1:-}" in
  load)
    dir=${2:?dir}
    docker load --quiet --input "$dir/images.tar"
    while read -r image _; do
      [ -n "$image" ] || continue
      docker image inspect "$image" > /dev/null 2>&1 || "$here/retry.sh" "$here/docker-pull.sh" "$image"
    done < "$dir/images.txt"
    ;;
  list)
    project=${2:?project id}
    docker ps --filter "label=com.supabase.cli.project=$project" --format '{{.Image}}' \
      | sort -u \
      | while read -r image; do echo "$image $(docker image inspect --format '{{.Id}}' "$image")"; done
    ;;
  save)
    dir=${2:?dir}
    list=${3:?list file}
    mkdir -p "$dir"
    cp "$list" "$dir/images.txt"
    # shellcheck disable=SC2046 # one argument per image
    docker save --output "$dir/images.tar" $(cut -d' ' -f1 "$list")
    ;;
  *)
    echo "usage: supabase-images.sh load <dir> | list <project id> | save <dir> <list>" >&2
    exit 64
    ;;
esac
