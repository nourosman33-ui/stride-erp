import { apiFetch } from "./client";
import type { LoginResponse } from "./types";

export function login(email: string, password: string) {
  return apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
    skipAuth: true,
  });
}
