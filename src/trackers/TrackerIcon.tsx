import {
  BookOpen,
  Brain,
  Calculator,
  Circle,
  Code,
  Dumbbell,
  Languages,
  ListChecks,
  Music,
  Palette,
  PenLine,
  type LucideIcon,
} from 'lucide-react'

/**
 * The icons a tracker's `icon` may name. A fixed set (like the six accents), bundled so
 * cards draw offline; anything else shows a plain circle. The tracker builder picks
 * from this list.
 */
export const TRACKER_ICONS: Record<string, LucideIcon> = {
  calculator: Calculator,
  music: Music,
  'book-open': BookOpen,
  'pen-line': PenLine,
  brain: Brain,
  languages: Languages,
  palette: Palette,
  code: Code,
  dumbbell: Dumbbell,
  'list-checks': ListChecks,
  circle: Circle,
}

export function TrackerIcon({ name, className }: { name: string; className?: string }) {
  const Icon = TRACKER_ICONS[name] ?? Circle
  return <Icon aria-hidden className={className} />
}
