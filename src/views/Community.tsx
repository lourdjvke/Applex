import { useState, useEffect } from 'react';
import { dbGet, dbPush } from '../lib/firebase';
import { Post } from '../types';
import { useAuth } from '../lib/AuthContext';
import { Heart, MessageCircle, Share2, PlusSquare, Image as ImageIcon, Sparkles, Send } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Community() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPost, setNewPost] = useState('');
  const { profile, user } = useAuth();

  useEffect(() => {
    async function fetchData() {
      const allPosts = await dbGet<Record<string, Post>>('community/posts');
      if (allPosts) {
        setPosts(Object.values(allPosts).sort((a, b) => b.createdAt - a.createdAt));
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  const handlePost = async () => {
    if (!newPost.trim() || !profile || !user) return;
    
    const postData: Omit<Post, 'id'> = {
      uid: user.uid,
      displayName: profile.displayName,
      avatarBase64: profile.avatarBase64,
      content: newPost,
      appId: null,
      imageBase64: null,
      likes: 0,
      createdAt: Date.now()
    };

    const postId = await dbPush('community/posts', postData);
    setPosts([{ ...postData, id: postId }, ...posts]);
    setNewPost('');
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pb-24 grow">
      <div className="py-8">
        <h1 className="font-display font-extrabold text-3xl mb-2">Community</h1>
        <p className="text-text-muted">Connect with creators and discover what's new.</p>
      </div>

      {/* Compose */}
      <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm mb-10 transition-all grow">
        <div className="flex gap-4 mb-4 grow">
           <img src={profile?.avatarBase64 || `https://ui-avatars.com/api/?name=${profile?.displayName}`} className="w-10 h-10 rounded-full border border-border shrink-0" alt="Avatar" />
           <textarea 
             value={newPost}
             onChange={(e) => setNewPost(e.target.value)}
             placeholder="What's on your mind? Share an app you're building..."
             className="flex-1 bg-transparent border-none outline-none resize-none pt-2 text-sm placeholder:text-text-muted grow"
             rows={2}
           />
        </div>
        <div className="flex items-center justify-between pt-4 border-t border-border">
           <div className="flex items-center gap-1">
              <button className="p-2 hover:bg-surface-alt rounded-lg text-text-muted flex items-center gap-2 text-xs font-medium transition-colors">
                <ImageIcon size={18} /> <span className="hidden sm:inline">Image</span>
              </button>
              <button className="p-2 hover:bg-surface-alt rounded-lg text-text-muted flex items-center gap-2 text-xs font-medium transition-colors">
                <PlusSquare size={18} /> <span className="hidden sm:inline">Attach Link</span>
              </button>
           </div>
           <button 
             onClick={handlePost}
             disabled={!newPost.trim()}
             className="px-6 py-2 bg-primary text-white rounded-lg font-display font-bold text-sm shadow-md shadow-primary/20 disabled:opacity-50 transition-all flex items-center gap-2"
           >
             <Send size={16} /> Post
           </button>
        </div>
      </div>

      {/* Feed */}
      <div className="space-y-8 grow">
        {loading ? (
          Array(3).fill(0).map((_, i) => (
             <div key={i} className="bg-surface h-48 rounded-2xl border border-border animate-pulse grow"></div>
          ))
        ) : posts.map((post) => (
           <div key={post.id} className="bg-surface rounded-2xl border border-border p-6 shadow-card transition-all grow">
              <div className="flex items-start gap-4 mb-4">
                 <img src={post.avatarBase64 || `https://ui-avatars.com/api/?name=${post.displayName}`} className="w-10 h-10 rounded-full border border-border shrink-0" alt="Avatar" />
                 <div>
                    <h4 className="font-sans font-bold text-sm">{post.displayName}</h4>
                    <p className="text-[10px] text-text-muted font-mono uppercase tracking-widest">{new Date(post.createdAt).toLocaleDateString()}</p>
                 </div>
              </div>
              <p className="text-text-secondary text-sm leading-relaxed mb-6 whitespace-pre-wrap">{post.content}</p>
              
              <div className="flex items-center gap-6 pt-4 border-t border-border">
                 <button className="flex items-center gap-2 text-text-muted hover:text-primary transition-colors text-xs font-bold">
                    <Heart size={18} /> {post.likes}
                 </button>
                 <button className="flex items-center gap-2 text-text-muted hover:text-primary transition-colors text-xs font-bold">
                    <MessageCircle size={18} /> 0
                 </button>
                 <button className="flex items-center gap-2 text-text-muted hover:text-primary transition-colors text-xs font-bold ml-auto">
                    <Share2 size={18} />
                 </button>
              </div>
           </div>
        ))}
        {posts.length === 0 && !loading && (
           <div className="py-20 text-center opacity-50 space-y-4">
              <Sparkles size={48} className="mx-auto text-primary" />
              <p className="font-display font-bold">Join the conversation</p>
              <p className="text-xs max-w-xs mx-auto">Be the first to share an update in the AIPLEX community.</p>
           </div>
        )}
      </div>
    </div>
  );
}
