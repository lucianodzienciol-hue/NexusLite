export interface Product {
  id: string;
  code: string;
  name: string;
  price: number;
  cost: number;
  stock: number;
  category: string;
  source?: 'local' | 'web';
  desc?: string;
  image?: string;
  oferta?: boolean;
  nuevo?: boolean;
  webDesc?: string;
  ofertaPrice?: number;
  fichaTecnica?: string;
  fichaTecnicaFile?: string;
}

export interface Client {
  id: string;
  document: string;
  name: string;
  phone?: string;
  email?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface CompanyConfig {
  companyName: string;
  address: string;
  phone: string;
  email: string;
  hours?: string;
  whatsapp?: string;
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  youtube?: string;
  twitter?: string;
  linkedin?: string;
  backupPassword?: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  requiresCash?: boolean;
  icon?: string;
  adjustment?: number;
}

export interface Sale {
  id: string;
  date: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    price: number;
  }[];
  total: number;
  paymentMethod: string;
  clientId?: string;
  clientName?: string;
  cashReceived?: number;
  change?: number;
}

export interface Provider {
  id: string;
  ruc: string;
  name: string;
  phone?: string;
  email?: string;
}

export interface Purchase {
  id: string;
  date: string;
  providerId: string;
  providerName: string;
  paymentMethod: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    cost: number;
  }[];
  total: number;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  date: string;
  category?: string;
}

export interface Exchange {
  id: string;
  clientId: string;
  clientName: string;
  productId: string;
  productName: string;
  status: 'recibido' | 'esperando' | 'entregado';
  date: string;
  notes?: string;
}

export interface Expense {
  id: string;
  date: string;
  type: 'efectivo' | 'transferencia';
  description: string;
  amount: number;
}

export interface CashRegister {
  cash: number;
  bank: number;
}

export interface WebRepair {
  id: string;
  code: string;
  clientId: string;
  clientName?: string;
  clientPhone?: string;
  equipment: string;
  marca?: string;
  modelo?: string;
  status: string;
  price: number;
  problem: string;
  notes?: string;
  date: string;
  updatedAt?: string;
}

export interface WebClient {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
}

export interface WebService {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface WebConfig {
  companyName?: string;
  address?: string;
  phone?: string;
  email?: string;
  hours?: string;
  whatsapp?: string;
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  youtube?: string;
  twitter?: string;
  linkedin?: string;
  siteTitle?: string;
  metaDescription?: string;
  ga4Id?: string;
  gtmId?: string;
  productLimit?: number;
  randomOrder?: boolean;
  popupActive?: boolean;
  popupAlways?: boolean;
  popupDuration?: number;
  popupDelay?: number;
  popupText?: string;
  popupImage?: string;
  banners?: WebBanner[];
  categories?: WebCategory[];
}

export interface WebBanner {
  image: string;
  title: string;
  link: string;
  description: string;
}

export interface WebCategory {
  id: string;
  name: string;
}
