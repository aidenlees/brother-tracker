import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { RouteError } from './RouteError'

function failWith(error: unknown) {
  const router = createMemoryRouter([
    {
      path: '/',
      loader: () => {
        throw error
      },
      element: <p>never shown</p>,
      errorElement: <RouteError />,
    },
  ])
  render(<RouterProvider router={router} />)
}

describe('RouteError', () => {
  it('says a screen isn’t on the device when its code couldn’t be fetched offline', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    failWith(
      new TypeError('Failed to fetch dynamically imported module: /src/app/today/TodayPage.tsx'),
    )
    expect(
      await screen.findByRole('heading', { name: 'This screen isn’t on this device yet' }),
    ).toBeVisible()
    expect(screen.getByText(/Anything you saved is still on this device/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible()
  })

  it('keeps other failures plain', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    failWith(new Error('boom'))
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeVisible()
    expect(screen.queryByText('boom')).toBeNull()
  })
})
