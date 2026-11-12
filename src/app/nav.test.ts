import { describe, expect, it } from 'vitest'
import type { Role } from '@/lib/supabase'
import { canUse, homeFor, navFor, SCREENS } from './nav'

const labels = (role: Role) => navFor(role).map((s) => s.label)

describe('navigation', () => {
  it('shows a student only their own screens', () => {
    expect(labels('student')).toEqual(['Today', 'My week', 'Settings'])
  })

  it('shows a viewer the overview, struggles and settings', () => {
    expect(labels('viewer')).toEqual(['Overview', 'Struggles', 'Settings'])
  })

  it('shows the admin every admin screen built so far', () => {
    expect(labels('admin')).toEqual([
      'Overview',
      'Struggles',
      'Retry queue',
      'Plan',
      'Tasks',
      'Settings',
    ])
  })

  it('keeps an unbuilt screen out of the nav, but still at its address', () => {
    expect(SCREENS.filter((s) => !s.built).map((s) => s.label)).toEqual([
      'Trackers',
      'People',
      'Export',
    ])
    expect(canUse('admin', 'people')).toBe(true)
  })

  it('keeps pacing and admin screens away from students', () => {
    for (const path of [
      'overview',
      'struggles',
      'retries',
      'plan',
      'tasks',
      'builder',
      'people',
      'export',
    ]) {
      expect(canUse('student', path), path).toBe(false)
    }
  })

  it('keeps logging to students', () => {
    expect(canUse('student', 'log')).toBe(true)
    expect(canUse('admin', 'log')).toBe(false)
    expect(canUse('viewer', 'log')).toBe(false)
  })

  it.each<Role>(['student', 'admin', 'viewer'])('lands %s on a screen they can use', (role) => {
    expect(canUse(role, homeFor(role).slice(1))).toBe(true)
  })
})
