export type MatchScoreBand = 'strong' | 'partial' | 'poor'

export function scoreBand(score: number): MatchScoreBand {
  if (score >= 80) return 'strong'
  if (score >= 50) return 'partial'
  return 'poor'
}
