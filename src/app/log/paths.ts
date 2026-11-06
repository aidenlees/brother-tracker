/** Where the log flow lives for a plan session, or for one day of a daily tracker. */
export function logPath(assignmentId: string, target: { planItemId: string } | { date: string }) {
  return 'planItemId' in target
    ? `/log/${assignmentId}/${target.planItemId}`
    : `/log/${assignmentId}?date=${target.date}`
}
