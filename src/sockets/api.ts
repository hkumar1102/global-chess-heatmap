import type { ServerSnapshotDTO } from './types'
import { getMockChessServer } from './mockServer'

export async function fetchServerSnapshot(): Promise<ServerSnapshotDTO> {
  return getMockChessServer().fetchSnapshot()
}

export function openServerSocket() {
  return getMockChessServer().connect()
}

