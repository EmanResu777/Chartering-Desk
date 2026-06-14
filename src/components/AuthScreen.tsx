import React, { useState } from 'react';
import { Ship, Mail, ArrowRight, ShieldCheck, ChevronRight } from 'lucide-react';
import { loginWithGoogle, loginWithApple } from '../lib/firebase';
import { motion } from 'motion/react';

export const AuthScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!showPassword) {
      if (!email || !email.includes('@')) {
        setErrorMsg("Please enter a valid email address.");
        return;
      }
      setShowPassword(true);
      setErrorMsg('');
      return;
    }

    if (!password) {
      setErrorMsg("Please enter a password.");
      return;
    }

    setLoading(true);
    setErrorMsg('');
    
    try {
      const { signInWithEmailAndPassword, createUserWithEmailAndPassword } = await import('firebase/auth');
      const { auth } = await import('../lib/firebase');
      
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
         setErrorMsg("Invalid email or password. If you don't have an account, click the Register link below.");
      } else if (err.code === 'auth/email-already-in-use') {
         setErrorMsg("Email is already in use. Please sign in instead.");
      } else if (err.code === 'auth/weak-password') {
         setErrorMsg("Password is too weak. Must be at least 6 characters.");
      } else if (err.code === 'auth/operation-not-allowed') {
         setErrorMsg("Email/Password login is not enabled in Firebase. Please enable it in the Firebase Console under Authentication > Sign-in method.");
      } else {
         setErrorMsg(err.message || 'An error occurred during authentication.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Left side - Branded presentation (hidden on mobile, visible on lg) */}
      <div className="hidden lg:flex w-1/2 bg-surface-container border-r border-outline/20 flex-col relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
          <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-primary/5 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] bg-tertiary/5 blur-[120px] rounded-full" />
        </div>
        
        <div className="p-12 relative z-10">
          <div className="flex items-center gap-3 mb-24">
            <div className="w-10 h-10 bg-primary/10 rounded-sm flex items-center justify-center">
              <Ship className="w-6 h-6 text-primary" />
            </div>
            <span className="font-display font-light text-xl tracking-tight text-on-surface">Chartering Desk</span>
          </div>

          <div className="max-w-lg mt-10">
            <h1 className="text-5xl font-display font-light text-on-surface leading-[1.1] mb-6 tracking-tight">
              The premier platform for fixing charter contracts.
            </h1>
            <p className="text-on-surface-variant font-sans text-lg mb-12 font-light leading-relaxed">
              Connect your desk to the global network. Automate your workflow with AI, share open positions securely, and speed up negotiations.
            </p>

            <div className="space-y-6">
              {[
                "Automated inbox parsing for Cargo and Tonnage",
                "Secure, private Desk Network matching",
                "Instant P5 urgent deals & Hot Opps generation",
                "Zero manual data entry with our advanced AI parser"
              ].map((text, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="text-on-surface-variant text-sm font-medium">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="absolute bottom-12 left-12 right-12 z-10 flex justify-between items-end border-t border-outline/20 pt-8">
           <div className="text-[10px] text-on-surface-variant font-mono uppercase tracking-widest opacity-60">
             Trusted by elite brokers globally
           </div>
           <div className="text-xs text-on-surface-variant opacity-60">
              © {new Date().getFullYear()} OceanPact
           </div>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 relative bg-surface">
        <div className="w-full max-w-sm flex flex-col">
          {/* Mobile branding */}
          <div className="flex lg:hidden items-center gap-3 mb-12 mx-auto">
            <div className="w-10 h-10 bg-primary/10 rounded-sm flex items-center justify-center">
              <Ship className="w-6 h-6 text-primary" />
            </div>
            <span className="font-display font-light text-xl tracking-tight text-on-surface">Chartering Desk</span>
          </div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <h2 className="text-3xl font-display font-bold text-on-surface mb-2">Welcome</h2>
            <p className="text-on-surface-variant text-sm mb-10 font-sans">
              Enter your email to sign in or create an account
            </p>

            <form onSubmit={handleEmailSubmit} className="space-y-4 mb-6">
              {errorMsg && (
                <div className="text-error text-xs font-medium bg-error/10 p-3 rounded-sm">
                  {errorMsg}
                </div>
              )}
              
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1.5 ml-1">Work Email</label>
                <input 
                  type="email" 
                  required
                  value={email}
                  disabled={loading || showPassword}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="broker@company.com" 
                  className="w-full px-4 py-3 bg-surface-container-low border border-outline/50 rounded-sm text-sm focus:outline-none focus:border-primary transition-colors text-on-surface disabled:opacity-50"
                />
              </div>

              {showPassword && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5 ml-1">Password</label>
                  <input 
                    type="password" 
                    required
                    value={password}
                    disabled={loading}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••" 
                    className="w-full px-4 py-3 bg-surface-container-low border border-outline/50 rounded-sm text-sm focus:outline-none focus:border-primary transition-colors text-on-surface mb-2"
                  />
                  <div className="flex justify-end mb-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => { setIsSignUp(!isSignUp); setErrorMsg(''); }}
                      className="text-xs text-primary hover:text-primary/80 transition-colors bg-transparent border-none p-0 cursor-pointer"
                    >
                      {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Register'}
                    </button>
                  </div>
                </motion.div>
              )}

              <button 
                type="submit" 
                disabled={loading}
                className="w-full py-3 bg-on-surface text-surface font-medium uppercase tracking-widest text-[11px] hover:bg-on-surface/90 transition-all rounded-sm shadow-md flex items-center justify-center gap-2 group disabled:opacity-70"
              >
                {loading ? 'Processing...' : (showPassword ? (isSignUp ? 'Create Account' : 'Sign In') : 'Continue with Email')}
                {!loading && <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />}
              </button>
            </form>

            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 h-px bg-outline/30"></div>
              <span className="text-xs text-on-surface-variant font-medium uppercase tracking-wider">or connect</span>
              <div className="flex-1 h-px bg-outline/30"></div>
            </div>

            <div className="space-y-3">
              <button 
                onClick={() => {
                   setLoading(true);
                   loginWithGoogle().finally(() => setLoading(false));
                }}
                disabled={loading}
                className="w-full py-3 bg-surface-container border border-outline hover:bg-surface-container-high transition-all rounded-sm flex items-center justify-center gap-3 text-sm font-medium text-on-surface shadow-sm disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
              
              {import.meta.env.VITE_APPLE_AUTH_ENABLED === 'true' ? (
                <button 
                  onClick={() => {
                     setLoading(true);
                     loginWithApple().finally(() => setLoading(false));
                  }}
                  disabled={loading}
                  className="w-full py-3 bg-surface-container border border-outline hover:bg-surface-container-high transition-all rounded-sm flex items-center justify-center gap-3 text-sm font-medium text-on-surface shadow-sm disabled:opacity-50"
                >
                  <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16.365 14.731c-.007-2.316 1.884-3.415 1.97-3.468-1.07-1.571-2.738-1.785-3.344-1.815-1.428-.145-2.781.84-3.504.84-.716 0-1.838-.824-3.003-.801-1.503.023-2.89.874-3.66 2.215-1.558 2.697-.398 6.69 1.116 8.875.733 1.055 1.6 2.232 2.744 2.188 1.1-.046 1.517-.714 2.846-.714 1.321 0 1.706.714 2.863.691 1.173-.023 1.92-1.077 2.645-2.133.84-1.228 1.185-2.418 1.2-2.482-.027-.01-2.327-.893-2.334-3.396" />
                    <path d="M14.613 6.012c.607-.736.998-1.761.885-2.788-.871.036-1.927.581-2.551 1.309-.49.566-.948 1.606-.814 2.618.973.076 1.874-.401 2.48-1.139" />
                  </svg>
                  Continue with Apple
                </button>
              ) : (
                <div className="hidden">
                  {/* Apple Sign-In is hidden because VITE_APPLE_AUTH_ENABLED is not set to 'true'. */}
                </div>
              )}
            </div>

            <div className="mt-12 text-center">
               <p className="text-[10px] text-on-surface-variant leading-relaxed">
                 By continuing, you agree to Chartering Desk's <br />
                 <a href="#" className="underline hover:text-on-surface">Terms of Service</a> and <a href="#" className="underline hover:text-on-surface">Privacy Policy</a>
               </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};
