import type { ClientMessage, ServerMessage } from './types'

type ReadyState = 0 | 1 | 2 | 3

type ServerReceiver = (socket: MockWebSocket, message: ClientMessage) => void

function randomJitterMs(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1))
}

export class MockWebSocket extends EventTarget {
  readonly url: string
  readyState: ReadyState = 0

  onopen: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent<string>) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null

  private receiver: ServerReceiver
  private closed = false

  constructor(url: string, receiver: ServerReceiver) {
    super()
    this.url = url
    this.receiver = receiver
  }

  _open(): void {
    if (this.closed) return
    this.readyState = 1
    const ev = new Event('open')
    this.dispatchEvent(ev)
    this.onopen?.(ev)
  }

  _deliver(serverMessage: ServerMessage): void {
    if (this.closed || this.readyState !== 1) return
    const data = JSON.stringify(serverMessage)
    const ev = new MessageEvent<string>('message', { data })
    this.dispatchEvent(ev)
    this.onmessage?.(ev)
  }

  send(data: string): void {
    if (this.readyState !== 1) throw new Error('MockWebSocket: not open')
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      const ev = new Event('error')
      this.dispatchEvent(ev)
      this.onerror?.(ev)
      return
    }
    this.receiver(this, parsed as ClientMessage)
  }

  close(code = 1000, reason = ''): void {
    if (this.closed) return
    this.closed = true
    this.readyState = 3
    const ev = new CloseEvent('close', { code, reason })
    this.dispatchEvent(ev)
    this.onclose?.(ev)
  }
}

export class MockWebSocketServer {
  private receiver: ServerReceiver
  private sockets = new Set<MockWebSocket>()

  constructor(receiver: ServerReceiver) {
    this.receiver = receiver
  }

  connect(url: string): MockWebSocket {
    const socket = new MockWebSocket(url, this.receiver)
    this.sockets.add(socket)
    setTimeout(() => socket._open(), randomJitterMs(10, 40))
    socket.addEventListener('close', () => this.sockets.delete(socket))
    return socket
  }

  broadcast(message: ServerMessage): void {
    this.broadcastWhere(message, () => true)
  }

  broadcastWhere(message: ServerMessage, predicate: (socket: MockWebSocket) => boolean): void {
    for (const socket of this.sockets) {
      if (!predicate(socket)) continue
      setTimeout(() => socket._deliver(message), randomJitterMs(10, 60))
    }
  }
}
