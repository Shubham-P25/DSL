export function apiErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "SignalPath could not complete that request.";
}
