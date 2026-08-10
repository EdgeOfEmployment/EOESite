import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  updateGithubUsername: vi.fn(),
}))

import { GithubSettingsForm } from './github-settings-form'

describe('GithubSettingsForm', () => {
  it('renders the input pre-filled with the current username', () => {
    render(<GithubSettingsForm currentUsername="kimminsu-dev" />)
    expect(screen.getByLabelText('내 GitHub 아이디')).toHaveValue('kimminsu-dev')
  })

  it('renders an empty input when no username is registered yet', () => {
    render(<GithubSettingsForm currentUsername={null} />)
    expect(screen.getByLabelText('내 GitHub 아이디')).toHaveValue('')
  })

  it('renders a save button', () => {
    render(<GithubSettingsForm currentUsername={null} />)
    expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument()
  })
})
