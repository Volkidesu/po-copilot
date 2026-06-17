// Single source of truth for the active Claude model — used by the API route
// (to call the model) and the frontend (to display it to the user).
export const ACTIVE_MODEL = {
  id: "claude-haiku-4-5",
  label: "Claude Haiku 4.5",
} as const;
