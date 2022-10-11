export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (error !== null && typeof error === "object" && "message" in error)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return String((error as any).message);
  return String(error);
};
