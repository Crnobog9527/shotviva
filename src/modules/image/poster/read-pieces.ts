// Shared by the server (the model's event stream) and the editor (the route's NDJSON).

// The body's text in whole pieces: split on separator, the last piece kept until it is complete.
export async function readPieces(body: ReadableStream<Uint8Array>, separator: string, onPiece: (piece: string) => void) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (let done = false; !done;) {
    const chunk = await reader.read()
    done = chunk.done
    buffer += decoder.decode(chunk.value, { stream: !done }).replace(/\r\n?/g, '\n')
    const pieces = buffer.split(separator)
    buffer = done ? '' : pieces.pop() ?? ''
    pieces.forEach(onPiece)
  }
}
