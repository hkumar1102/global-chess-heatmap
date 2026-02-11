import { applyMove } from '../chess/apply'
import { evaluate } from '../chess/eval'
import { getLegalMoves, isInCheck } from '../chess/movegen'
import { positionKey } from '../chess/position'
import { moveToSan } from '../chess/san'
import type { Color, Move, Position } from '../chess/types'

const MATE_SCORE = 100_000

function terminalScore(position: Position): number | null {
  const legal = getLegalMoves(position)
  if (legal.length > 0) return null
  if (isInCheck(position, position.turn)) return position.turn === 'w' ? -MATE_SCORE : MATE_SCORE
  return 0
}

export interface Depth2Reply {
  move: Move
  san: string
  score: number // white perspective
}

export interface Depth2Line {
  move: Move
  san: string
  score: number // white perspective minimax score after best reply
  scoreRelative: number // perspective of side-to-move at root
  reply?: Depth2Reply
}

export interface Depth2Analysis {
  rootTurn: Color
  positionKey: string
  nodes: number
  lines: Depth2Line[]
}

export function analyzeDepth2(position: Position, maxLines = 8): Depth2Analysis {
  const rootTurn = position.turn
  const rootKey = positionKey(position)
  const legal = getLegalMoves(position)

  let nodes = 0
  const lines: Depth2Line[] = []

  for (const rootMove of legal) {
    const rootSan = moveToSan(position, rootMove)
    const { next: afterRoot } = applyMove(position, rootMove)

    const term1 = terminalScore(afterRoot)
    if (term1 !== null) {
      nodes += 1
      lines.push({
        move: rootMove,
        san: rootSan,
        score: term1,
        scoreRelative: rootTurn === 'w' ? term1 : -term1,
      })
      continue
    }

    const replies = getLegalMoves(afterRoot)
    if (replies.length === 0) {
      const checkmate = isInCheck(afterRoot, afterRoot.turn)
      const score = checkmate ? (afterRoot.turn === 'w' ? -MATE_SCORE : MATE_SCORE) : 0
      nodes += 1
      lines.push({
        move: rootMove,
        san: rootSan,
        score,
        scoreRelative: rootTurn === 'w' ? score : -score,
      })
      continue
    }

    const replyTurn = afterRoot.turn
    let bestScore = replyTurn === 'w' ? -Infinity : Infinity
    let bestReplyMove: Move | null = null

    for (const replyMove of replies) {
      const { next: afterReply } = applyMove(afterRoot, replyMove)
      const term2 = terminalScore(afterReply)
      const leafScore = term2 ?? evaluate(afterReply)
      nodes += 1

      if (replyTurn === 'w') {
        if (leafScore > bestScore) {
          bestScore = leafScore
          bestReplyMove = replyMove
        }
      } else {
        if (leafScore < bestScore) {
          bestScore = leafScore
          bestReplyMove = replyMove
        }
      }
    }

    const reply =
      bestReplyMove !== null
        ? { move: bestReplyMove, san: moveToSan(afterRoot, bestReplyMove), score: bestScore }
        : undefined

    lines.push({
      move: rootMove,
      san: rootSan,
      score: bestScore,
      scoreRelative: rootTurn === 'w' ? bestScore : -bestScore,
      reply,
    })
  }

  lines.sort((a, b) => (rootTurn === 'w' ? b.score - a.score : a.score - b.score))
  return { rootTurn, positionKey: rootKey, nodes, lines: lines.slice(0, Math.max(1, maxLines)) }
}

export function pickDepth2Move(position: Position): Move | null {
  const analysis = analyzeDepth2(position, 1)
  return analysis.lines[0]?.move ?? null
}
