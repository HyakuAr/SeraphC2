/**
 * Custom error types for SeraphC2
 */

export interface SeraphError extends Error {
  error?: string;
  operatorId?: string;
  implantId?: string;
  taskId?: string;
  executionId?: string;
  query?: any;
  data?: any;
  body?: any;
  eventType?: string;
  commandId?: string;
  moduleId?: string;
  method?: string;
  incidentId?: string;
  [key: string]: any;
}

export class SeraphC2Error extends Error implements SeraphError {
  public error?: string;
  public operatorId?: string;
  public implantId?: string;
  public taskId?: string;
  public executionId?: string;
  public query?: any;
  public data?: any;
  public body?: any;
  public eventType?: string;
  public commandId?: string;
  public moduleId?: string;
  public method?: string;
  public incidentId?: string;

  constructor(message: string, properties?: Partial<SeraphError>) {
    super(message);
    this.name = 'SeraphC2Error';

    if (properties) {
      Object.assign(this, properties);
    }
  }
}

export function createErrorWithContext(
  error: unknown,
  context: Partial<SeraphError> = {}
): SeraphError {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  const seraphError = new SeraphC2Error(errorMessage, context);

  // Preserve original stack trace if available
  if (error instanceof Error && error.stack) {
    seraphError.stack = error.stack;
  }

  return seraphError;
}
