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

export interface AppVersion {
  id: string;
  version: string;
  htmlCode: string;
  summary: string;
  createdAt: number;
  sourceType?: 'image-to-prompt' | 'manual-edit';
  promptSnapshot?: string;
  imageRefs?: string[];
}

export interface ProjectPage {
  id: string;
  name: string;
  description: string;
  components: string[];
  needsAuth: boolean;
  referenceImageIndex: number | null;
  prompt: string;
}

export interface ProjectSpec {
  appName: string;
  appDescription: string;
  primaryColor: string;
  theme: 'light' | 'dark';
  pages: ProjectPage[];
  sharedComponents: string[];
  globalState: Record<string, any>;
}

export interface GenerationTask {
  taskId: string;
  appId: string;
  status: 'queued' | 'generating' | 'complete' | 'error';
  totalPages: number;
  completedPages: string[];
  currentPage: string;
  pageStatuses: Record<string, 'pending' | 'generating' | 'generated' | 'error'>;
  createdAt: number;
  updatedAt: number;
  error?: string;
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
    status: 'generating' | 'ready' | 'error';
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

export interface AppAuthUser {
  authUserId: string;
  email: string;
  displayName?: string;
  createdAt: number;
  lastLoginAt: number;
  metadata?: any;
}

export interface ProdData {
  storage: Record<string, { content: string; mimeType: string; createdAt: number }>;
  data: Record<string, any>;
}
