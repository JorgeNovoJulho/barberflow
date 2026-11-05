export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'PROFESSIONAL' | 'CLIENT';

export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'SUSPENDED';

export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export type PaymentMethod = 'PIX' | 'CREDIT_CARD' | 'BANK_TRANSFER' | 'CASH';

export type ThemeName = 
  | 'classic-grid'
  | 'barber-noir'
  | 'urban-steel'
  | 'vintage-cut'
  | 'fresh-mint'
  | 'midnight-blue'
  | 'rose-gold'
  | 'carbon-fiber'
  | 'sunset-barber'
  | 'forest-green';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  barbershopId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Barbershop {
  id: string;
  name: string;
  slug: string;
  cnpj?: string;
  address?: string;
  phone?: string;
  email?: string;
  description?: string;
  logoUrl?: string;
  bannerUrl?: string;
  themeId: ThemeName;
  workingHours?: WorkingHours;
  subscriptionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkingHours {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
}

export interface DaySchedule {
  open: string;
  close: string;
  closed: boolean;
  breaks?: Break[];
}

export interface Break {
  start: string;
  end: string;
}

export interface Professional {
  id: string;
  barbershopId: string;
  userId?: string;
  name: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  commissionType: 'PERCENTAGE' | 'FIXED';
  commissionValue: number;
  canViewAllAgenda: boolean;
  workingHours?: WorkingHours;
  services: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Service {
  id: string;
  barbershopId: string;
  name: string;
  description?: string;
  category: 'CORTE' | 'BARBA' | 'HIDRATACAO' | 'COMBO' | 'OUTRO';
  duration: number;
  price: number;
  imageUrl?: string;
  professionals: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Client {
  id: string;
  barbershopId: string;
  userId?: string;
  name: string;
  email?: string;
  phone?: string;
  birthday?: Date;
  notes?: string;
  tags: string[];
  loyaltyStamps: number;
  lastVisit?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Appointment {
  id: string;
  barbershopId: string;
  professionalId: string;
  serviceId: string;
  clientId: string;
  startTime: Date;
  endTime: Date;
  status: AppointmentStatus;
  notes?: string;
  price: number;
  commission?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Theme {
  id: string;
  name: ThemeName;
  displayName: string;
  primary: string;
  secondary: string;
  accent: string;
  cssVars: Record<string, string>;
}

export interface SocialLinks {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  youtube?: string;
  website?: string;
  whatsapp?: string;
}

export interface LoyaltyConfig {
  stampsRequired: number;
  rewardType: 'FREE_SERVICE' | 'DISCOUNT_PERCENTAGE' | 'DISCOUNT_FIXED';
  rewardValue: number;
  active: boolean;
}

export interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
  maxProfessionals?: number;
  trialDays: number;
  active: boolean;
}

export interface Subscription {
  id: string;
  barbershopId: string;
  planId: string;
  status: SubscriptionStatus;
  trialEndsAt?: Date;
  currentPeriodEnd?: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  id: string;
  subscriptionId: string;
  amount: number;
  method: PaymentMethod;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REFUNDED';
  pixQrCode?: string;
  pixCode?: string;
  receiptUrl?: string;
  confirmedAt?: Date;
  createdAt: Date;
}

export interface Notification {
  id: string;
  barbershopId: string;
  userId?: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  read: boolean;
  channel: ('IN_APP' | 'EMAIL' | 'WHATSAPP' | 'PUSH')[];
  sentAt?: Date;
  createdAt: Date;
}

export interface AuditLog {
  id: string;
  barbershopId?: string;
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
}
