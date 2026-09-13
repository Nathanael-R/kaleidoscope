export type HarnessToolHandler = (args: Record<string, unknown>) => Promise<unknown> | unknown;

export interface HarnessScenario {
  readonly id: string;
  readonly initialInput: Record<string, unknown>;
  createInitialResult(): unknown;
  readonly toolHandlers: ReadonlyMap<string, HarnessToolHandler>;
}
