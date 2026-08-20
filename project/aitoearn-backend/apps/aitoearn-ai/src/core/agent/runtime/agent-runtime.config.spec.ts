import { agentConfigSchema } from '../../../config'

describe('agent runtime config', () => {
  it('defaults to the Claude runtime', () => {
    const parsed = agentConfigSchema.parse({
      baseUrl: 'http://localhost',
      apiKey: 'test-key',
    })

    expect(parsed.runtime).toBe('claude')
  })
})
