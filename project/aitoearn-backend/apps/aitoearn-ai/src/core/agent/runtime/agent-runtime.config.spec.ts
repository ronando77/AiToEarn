import { agentConfigSchema } from '../../../config'

describe('agent runtime config', () => {
  it('defaults to the Claude runtime', () => {
    const parsed = agentConfigSchema.parse({
      baseUrl: 'http://localhost',
      apiKey: 'test-key',
    })

    expect(parsed.runtime).toBe('claude')
  })

  it('accepts the Codex runtime', () => {
    const parsed = agentConfigSchema.parse({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      runtime: 'codex',
      models: ['gpt-5.3-codex'],
      defaultModel: 'gpt-5.3-codex',
      backgroundModel: 'gpt-5.3-codex',
      thinkModel: 'gpt-5.3-codex',
    })

    expect(parsed.runtime).toBe('codex')
  })
})
