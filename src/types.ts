/**
 * AIPLEX Data Models
 */

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  bio: string;
  avatarBase64: string;
  role: 'user' | 'creator' | 'admin';
  createdAt: number;
  installedApps?: Record<string, { version: string }>;
  notifications?: Record<string, AppNotification>;
}

export interface AppNotification {
  id: string;
  appId: string;
  appName: string;
  appIcon: string;
  title: string;
  message: string;
  type: 'update' | 'system';
  createdAt: number;
  isRead: boolean;
}

export interface MiniApp {
  id: string;
  meta: {
    name: string;
    tagline: string;
    description: string;
    category: string;
    tags: string[];
    creatorUid: string;
    createdAt: number;
    updatedAt: number;
    version: string;
    iconBase64: string;
    screenshotsBase64: string[];
    isPublished: boolean;
    isOfflineReady: boolean;
    updateSummary?: string;
  };
  stats: {
    installs: number;
    views: number;
    avgRating: number;
    reviewCount: number;
    installedBy?: Record<string, boolean>;
  };
  code: {
    html: string;
    sizeBytes: number;
  };
}

export interface Review {
  id: string;
  appId: string;
  uid: string;
  displayName: string;
  avatarBase64: string;
  rating: number;
  body: string;
  createdAt: number;
  helpful: number;
}

export interface Post {
  id: string;
  uid: string;
  displayName: string;
  avatarBase64: string;
  content: string;
  appId: string | null;
  imageBase64: string | null;
  likes: number;
  createdAt: number;
}

export interface ProdData {
  storage: Record<string, { content: string; mimeType: string; createdAt: number }>;
  data: Record<string, any>;
}
