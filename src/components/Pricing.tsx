import React, { useState, useEffect } from 'react';
import { Check, Shield, Zap, Sparkles, Building2, User, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import { useAuth } from '../lib/firebase';
import { AdminPanel } from './AdminPanel';

export const Pricing: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [usage, setUsage] = useState<any>(null);
  const [loadingUsage, setLoadingUsage] = useState(true);

  useEffect(() => {
     const fetchUsage = async () => {
        if (!user) return;
        try {
           const token = await user.getIdToken();
           const res = await fetch('/api/usage/summary', {
              headers: { 'Authorization': `Bearer ${token}` }
           });
           if (res.ok) {
              const data = await res.json();
              setUsage(data);
           }
        } catch (e) {
           console.error("Failed to load usage summary", e);
        } finally {
           setLoadingUsage(false);
        }
     };
     fetchUsage();
  }, [user]);

  const handleSubscribe = async (planId: 'solo' | 'desk') => {
    if (!user) {
      setError("You must be logged in to subscribe.");
      return;
    }
    
    setLoading(planId);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ planId }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else if (data.demoMode) {
        alert("Real payment checkout requires Stripe API Keys.\nPlease configure STRIPE_SECRET_KEY and STRIPE_PRICE_ID_* in AI Studio.");
        setLoading(null);
      } else {
        throw new Error(data.error || 'Failed to initialize checkout');
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(null);
    }
  };

  const handleManageBilling = async () => {
    if (!user) return;
    setLoading('manage');
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/billing/create-portal-session', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Failed to initialize portal');
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(null);
    }
  };

  const currentPlanId = usage?.planId || 'trial';

  const plans = [
    {
      id: 'solo',
      name: 'Solo',
      price: '$99',
      period: '/mo',
      description: 'Perfect for independent brokers and operators.',
      icon: User,
      features: [
        '3,000 AI Credits included',
        'Advanced parsing',
        'Standard support',
        'Single user'
      ],
      color: 'bg-surface-container-high border-outline text-on-surface'
    },
    {
      id: 'desk',
      name: 'Desk',
      price: '$299',
      period: '/mo',
      description: 'Built for teams scaling their operations.',
      icon: Zap,
      features: [
        '12,000 AI Credits included',
        'Up to 3 users',
        'Priority support',
        'Shared analytics'
      ],
      color: 'bg-primary/5 border-primary text-primary',
      popular: true
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 'Custom',
      period: '',
      description: 'Dedicated infrastructure for large organizations.',
      icon: Building2,
      features: [
        'Custom AI limits',
        'Unlimited users',
        'Dedicated account manager',
        'API access'
      ],
      color: 'bg-tertiary/10 border-tertiary text-tertiary',
      isCustom: true
    }
  ];

  return (
    <div className="w-full h-full overflow-y-auto bg-surface p-8 no-scrollbar">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-display font-medium text-primary mb-4">Plans & Billing</h2>
          <p className="text-on-surface-variant max-w-2xl mx-auto">Scale your AI operations securely.</p>
        </div>

        {loadingUsage ? (
           <div className="flex justify-center items-center h-24 mb-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary opacity-50" />
           </div>
        ) : usage ? (
           <div className="mb-12 p-6 border bg-surface-container-low flex flex-col md:flex-row justify-between items-center gap-6">
              <div>
                 <div className="text-sm text-on-surface-variant mb-1 uppercase tracking-wider font-bold">Current Plan</div>
                 <div className="flex items-center gap-3">
                    <span className="text-2xl font-display uppercase font-bold text-primary">{usage.planId}</span>
                    <span className={cn(
                       "text-xs px-2 py-1 font-bold uppercase tracking-widest",
                       usage.billingStatus === 'active' ? "bg-green-500/10 text-green-600" :
                       usage.billingStatus === 'admin_test' || usage.billingStatus === 'test_grant' ? "bg-tertiary/10 text-tertiary" :
                       usage.billingStatus === 'past_due' ? "bg-red-500/10 text-red-600" :
                       "bg-outline/20 text-on-surface"
                    )}>
                       {usage.billingStatus?.replace('_', ' ')}
                    </span>
                 </div>
                 {usage.resetAt && (
                    <div className="text-xs text-on-surface-variant mt-2">
                       Period ends: {new Date(usage.resetAt).toLocaleDateString()}
                    </div>
                 )}
              </div>
              
              <div className="flex-1 max-w-md w-full">
                 <div className="flex justify-between text-sm mb-2">
                    <span className="text-on-surface-variant font-medium tracking-wide uppercase">AI Credits Remaining</span>
                    <span className="font-mono font-medium">{usage.creditsRemaining?.toLocaleString()} / {usage.creditsIncluded?.toLocaleString()}</span>
                 </div>
                 <div className="h-2 w-full bg-surface-container-high overflow-hidden">
                    <div 
                      className={cn("h-full transition-all duration-500", 
                        (usage.creditsUsed / usage.creditsIncluded) > 0.9 ? "bg-red-500" : "bg-primary"
                      )} 
                      style={{ width: `${Math.min(100, Math.max(0, (usage.creditsUsed / usage.creditsIncluded) * 100))}%` }} 
                    />
                 </div>
                 <div className="text-xs text-on-surface-variant mt-2 text-right">
                    {usage.creditsUsed?.toLocaleString()} credits used
                 </div>
              </div>

              <div>
                 <button
                    onClick={handleManageBilling}
                    disabled={loading === 'manage' || usage.planId === 'trial' || usage.planId === 'free'}
                    className={cn(
                      "px-6 py-3 font-medium text-sm tracking-wide transition-colors uppercase tracking-widest",
                      usage.planId === 'trial' || usage.planId === 'free' ? "opacity-30 cursor-not-allowed bg-surface-container" : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                    )}
                 >
                    {loading === 'manage' ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Manage Billing"}
                 </button>
              </div>
           </div>
        ) : null}
        
        {usage && (!usage.billingStatus || usage.billingStatus === 'error') && (
           <div className="mb-8 p-4 bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center justify-center">
             Credit usage temporarily unavailable.
           </div>
        )}

        {usage && (
           <div className="mb-12">
             <h3 className="text-sm font-bold uppercase tracking-widest text-on-surface mb-4">Usage Breakdown</h3>
             {usage.breakdown && Object.keys(usage.breakdown).length > 0 ? (
               <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                 {Object.entries(usage.breakdown).map(([op, cost]) => (
                   <div key={op} className="bg-surface-container border border-outline/50 p-4">
                     <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">{op.replace(/_/g, ' ')}</div>
                     <div className="font-mono text-lg text-on-surface font-light">{(cost as number).toLocaleString()}</div>
                   </div>
                 ))}
               </div>
             ) : (
               <div className="p-6 bg-surface-container border border-outline border-dashed text-center text-sm text-on-surface-variant uppercase tracking-widest">
                 No usage recorded for this period yet.
               </div>
             )}
           </div>
        )}

        {error && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center justify-center">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan) => (
             <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className={cn(
                  "relative flex flex-col p-8 border rounded-none transition-all duration-300",
                  plan.color,
                  currentPlanId === plan.id ? "ring-2 ring-primary bg-primary/5" : ""
                )}
             >
                {plan.popular && (
                  <div className="absolute top-0 right-8 -translate-y-1/2 bg-primary text-on-primary text-[9px] font-bold tracking-widest uppercase py-1 px-3">
                    Most Popular
                  </div>
                )}
                {currentPlanId === plan.id && (
                  <div className="absolute top-4 right-4 text-xs font-bold uppercase tracking-widest opacity-50 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Current
                  </div>
                )}
                
                <plan.icon className="w-10 h-10 mb-6 opacity-80" />
                <h3 className="text-xl font-display font-medium mb-2">{plan.name}</h3>
                <p className="text-sm opacity-70 mb-6 min-h-[40px]">{plan.description}</p>
                
                <div className="mb-8">
                  <span className="text-4xl font-display font-medium">{plan.price}</span>
                  <span className="text-sm opacity-60">{plan.period}</span>
                </div>

                <ul className="space-y-4 mb-10 flex-1">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start text-sm">
                      <Check className="w-4 h-4 mr-3 shrink-0 opacity-50 mt-1" />
                      <span className="opacity-80">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => !plan.isCustom && handleSubscribe(plan.id as any)}
                  disabled={loading === plan.id || currentPlanId === plan.id || plan.isCustom}
                  className={cn(
                    "w-full py-4 text-[10px] font-bold tracking-widest uppercase transition-colors flex justify-center items-center min-h-[50px]",
                    currentPlanId === plan.id
                      ? "bg-transparent border opacity-50 cursor-not-allowed"
                      : plan.isCustom
                      ? "bg-surface-container border text-on-surface cursor-not-allowed"
                      : "bg-primary text-black hover:bg-primary/90 shadow-[0_0_20px_rgba(197,168,128,0.3)]"
                  )}
                >
                  {loading === plan.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : currentPlanId === plan.id ? (
                    'Current Plan'
                  ) : plan.isCustom ? (
                    'Contact Sales'
                  ) : (
                    `Upgrade to ${plan.name}`
                  )}
                </button>
             </motion.div>
          ))}
        </div>
        
        {usage?.planId === 'admin_test' && (
           <AdminPanel />
        )}
      </div>
    </div>
  );
};
