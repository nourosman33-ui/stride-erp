import { apiFetch } from "./client";
import type { User } from "./types";

export interface CreateUserInput {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
  roleNames: string[];
  storeId?: string;
}

export function listUsers() {
  return apiFetch<User[]>("/users");
}

export function createUser(input: CreateUserInput) {
  return apiFetch<User>("/users", { method: "POST", body: input });
}
