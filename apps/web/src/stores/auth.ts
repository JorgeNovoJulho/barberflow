import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Barbershop, ThemeName } from '@barberflow/shared';

interface AuthState {
  user: User | null;
  token: string | null;
  barbershop: Barbershop | null;
  setAuth: (user: User, token: string, barbershop?: Barbershop) => void;
  logout: () => void;
  updateBarbershop: (barbershop: Barbershop) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      barbershop: null,
      setAuth: (user, token, barbershop) => set({ user, token, barbershop }),
      logout: () => set({ user: null, token: null, barbershop: null }),
      updateBarbershop: (barbershop) => set({ barbershop }),
    }),
    { name: 'barberflow-auth' }
  )
);
