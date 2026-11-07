// The one class that hides an element from Session Replay (T70): put it on every <img> that
// shows a user's own photo or work. Replay draws an empty box of the same size instead. Not
// PostHog's ph-no-capture, which would also stop click autocapture on those photos.
export const REPLAY_BLOCK_CLASS = 'sv-replay-block'
