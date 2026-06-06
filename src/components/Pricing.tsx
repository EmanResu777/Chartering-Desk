import React, { useState } from 'react';
import { useConfig } from '../lib/ConfigContext';
import { Check, Shield, Zap, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import { useAuth } from '../lib/firebase';

export const Pricing: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const { t, subscription, setSubscription } = useConfig();
  const { user } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<{ url: string, tier: string } | null>(null);

  const handleSubscribe = async (tier: 'basic' | 'premium' | 'maximum') => {
    if (!user) {
      setError("You must be logged in to subscribe.");
      return;
    }
    
    setLoading(tier);
    setError(null);
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tier, userId: user.uid }),
      });

      const data = await response.json();

      if (data.url) {
        setLoading(null);
        setCheckoutUrl({ url: data.url, tier });
      } else if (data.demoMode) {
        // Warn the user that Stripe is not configured
        alert("Real payment checkout requires a STRIPE_SECRET_KEY.\n\nPlease add this API key in the environment variables (Settings -> Secrets) in AI Studio to redirect to actual Stripe checkout.");
        setLoading(null);
      } else {
        throw new Error(data.error || 'Failed to initialize checkout');
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(null);
    }
  };

  const plans = [
    {
      id: 'basic',
      name: t('tier_basic'),
      price: '$99',
      period: '/mo',
      description: t('tier_basic_desc'),
      icon: Shield,
      features: [
        'up_to_10_emails_day',
        'basic_parsing',
        'standard_support',
        'single_user'
      ],
      color: 'bg-surface-container-high border-outline text-on-surface'
    },
    {
      id: 'premium',
      name: t('tier_premium'),
      price: '$299',
      period: '/mo',
      description: t('tier_premium_desc'),
      icon: Zap,
      features: [
        'unlimited_emails',
        'advanced_ai_parsing',
        'priority_support',
        'up_to_5_users',
        'vessel_tracking',
        'automated_drafts'
      ],
      color: 'bg-primary/5 border-primary text-primary',
      popular: true
    },
    {
      id: 'maximum',
      name: t('tier_maximum'),
      price: '$899',
      period: '/mo',
      description: t('tier_maximum_desc'),
      icon: Sparkles,
      features: [
        'everything_in_premium',
        'unlimited_users',
        'dedicated_manager',
        'custom_ai_models',
        'api_access',
        'whitelabel_reports'
      ],
      color: 'bg-tertiary/10 border-tertiary text-tertiary'
    }
  ];

  return (
    <div className="w-full h-full overflow-y-auto bg-surface p-8 no-scrollbar">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-display font-medium text-primary mb-4">{t('pricing_title')}</h2>
          <p className="text-on-surface-variant max-w-2xl mx-auto">{t('pricing_subtitle')}</p>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center justify-center">
            {error} (Make sure STRIPE_SECRET_KEY is added to .env)
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
                  subscription === plan.id ? "ring-2 ring-primary bg-primary/5" : ""
                )}
             >
                {plan.popular && (
                  <div className="absolute top-0 right-8 -translate-y-1/2 bg-primary text-on-primary text-[9px] font-bold tracking-widest uppercase py-1 px-3">
                    Most Popular
                  </div>
                )}
                {subscription === plan.id && (
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
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <Check className="w-4 h-4 shrink-0 mt-0.5 opacity-80" />
                      <span className="opacity-90">{t(feature)}</span>
                    </li>
                  ))}
                </ul>

                {checkoutUrl?.tier === plan.id ? (
                  <a
                    href={checkoutUrl.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-4 text-[10px] font-bold uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 bg-green-500 text-black hover:bg-green-400 shadow-[0_0_20px_rgba(34,197,94,0.3)] animate-pulse"
                  >
                    Proceed to Payment ↗
                  </a>
                ) : (
                  <button
                    onClick={() => handleSubscribe(plan.id as any)}
                    disabled={loading !== null || subscription === plan.id}
                    className={cn(
                      "w-full py-4 text-[10px] font-bold uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2",
                      subscription === plan.id 
                        ? "bg-surface-container border border-outline text-on-surface-variant cursor-not-allowed"
                        : plan.popular 
                          ? "bg-primary text-black hover:bg-primary/90 shadow-[0_0_20px_rgba(197,168,128,0.3)]" 
                          : "bg-surface-container-highest border border-outline hover:border-current"
                    )}
                  >
                    {loading === plan.id ? (
                      <span className="animate-pulse">{t('processing')}</span>
                    ) : subscription === plan.id ? (
                      t('current_plan')
                    ) : (
                      t('upgrade_now')
                    )}
                  </button>
                )}
             </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};
