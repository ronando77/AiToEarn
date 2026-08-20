import { resolve } from 'node:path'
import { FileUtil } from '@yikart/common'
import { vi } from 'vitest'

FileUtil.init({
  endpoint: 'https://s3.example.com',
  cdnEndpoint: 'https://cdn.example.com',
})

vi.mock('commander', () => {
  const command = {
    name: vi.fn().mockReturnThis(),
    description: vi.fn().mockReturnThis(),
    version: vi.fn().mockReturnThis(),
    option: vi.fn().mockReturnThis(),
    requiredOption: vi.fn().mockReturnThis(),
    argument: vi.fn().mockReturnThis(),
    action: vi.fn().mockReturnThis(),
    parse: vi.fn().mockReturnThis(),
    parseAsync: vi.fn().mockResolvedValue(undefined),
    opts: vi.fn().mockReturnValue({
      config: resolve(__dirname, '../config/config.yaml'),
    }),
    args: [],
  }

  return {
    Command: vi.fn(() => command),
    program: command,
  }
})

vi.mock('@nestjs/mongoose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs/mongoose')>()
  const createSchema = () => ({
    index: vi.fn().mockReturnThis(),
    pre: vi.fn().mockReturnThis(),
    post: vi.fn().mockReturnThis(),
    virtual: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    plugin: vi.fn().mockReturnThis(),
  })

  return {
    ...actual,
    Prop: () => () => {},
    Schema: () => (target: unknown) => target,
    SchemaFactory: {
      createForClass: createSchema,
    },
  }
})

vi.mock('@anthropic-ai/claude-agent-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@anthropic-ai/claude-agent-sdk')>()

  return {
    ...actual,
    createSdkMcpServer: (config: { name: string, version: string, tools: unknown[] }) => ({
      ...config,
      instance: {},
    }),
  }
})
