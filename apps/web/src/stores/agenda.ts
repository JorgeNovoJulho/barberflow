import { create } from 'zustand';
import type { Appointment, Professional, Service } from '@barberflow/shared';

interface AgendaState {
  appointments: Appointment[];
  professionals: Professional[];
  services: Service[];
  selectedDate: Date;
  viewMode: 'day' | 'week' | 'month';
  setAppointments: (appointments: Appointment[]) => void;
  setProfessionals: (professionals: Professional[]) => void;
  setServices: (services: Service[]) => void;
  setSelectedDate: (date: Date) => void;
  setViewMode: (mode: 'day' | 'week' | 'month') => void;
  addAppointment: (appointment: Appointment) => void;
  updateAppointment: (id: string, data: Partial<Appointment>) => void;
  deleteAppointment: (id: string) => void;
}

export const useAgendaStore = create<AgendaState>((set) => ({
  appointments: [],
  professionals: [],
  services: [],
  selectedDate: new Date(),
  viewMode: 'week',
  setAppointments: (appointments) => set({ appointments }),
  setProfessionals: (professionals) => set({ professionals }),
  setServices: (services) => set({ services }),
  setSelectedDate: (selectedDate) => set({ selectedDate }),
  setViewMode: (viewMode) => set({ viewMode }),
  addAppointment: (appointment) => set((state) => ({ appointments: [...state.appointments, appointment] })),
  updateAppointment: (id, data) => set((state) => ({
    appointments: state.appointments.map((a) => (a.id === id ? { ...a, ...data } : a)),
  })),
  deleteAppointment: (id) => set((state) => ({
    appointments: state.appointments.filter((a) => a.id !== id),
  })),
}));