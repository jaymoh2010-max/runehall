import { create } from "zustand";
import type { PublicUser } from "../shared/types";
import { api, ApiError } from "./api";
import { disconnectSocket } from "./socket";

interface SessionState {
  user: PublicUser | null;
  ready: boolean;
  busy: boolean;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (
    username: string,
    displayName: string,
    password: string,
    inviteCode?: string,
    bootstrapToken?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: PublicUser | null) => void;
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  ready: false,
  busy: false,
  refresh: async () => {
    try {
      const result = await api<{ user: PublicUser | null }>("/api/auth/me");
      set({ user: result.user, ready: true });
    } catch {
      set({ user: null, ready: true });
    }
  },
  login: async (username, password) => {
    set({ busy: true });
    try {
      const result = await api<{ user: PublicUser }>("/api/auth/login", {
        method: "POST",
        body: { username, password },
      });
      set({ user: result.user, ready: true });
    } finally {
      set({ busy: false });
    }
  },
  register: async (username, displayName, password, inviteCode, bootstrapToken) => {
    set({ busy: true });
    try {
      const result = await api<{ user: PublicUser }>("/api/auth/register", {
        method: "POST",
        body: { username, displayName, password, inviteCode, bootstrapToken },
      });
      set({ user: result.user, ready: true });
    } finally {
      set({ busy: false });
    }
  },
  logout: async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // clearing the local session is still the right move
    }
    disconnectSocket();
    set({ user: null });
  },
  setUser: (user) => set({ user }),
}));

export type ToastKind = "info" | "success" | "error";
export interface Toast {
  id: string;
  message: string;
  kind: ToastKind;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, kind?: ToastKind) => void;
  remove: (id: string) => void;
}

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message, kind = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    set((state) => ({ toasts: [...state.toasts.slice(-3), { id, message, kind }] }));
    window.setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
    }, 5000);
  },
  remove: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
