import React, { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, ArrowRight, ArrowLeft, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  {
    key: 'name',
    title: 'Welcome to Connect3',
    subtitle: 'AI-native discovery for everything happening on campus.',
    type: 'text',
    placeholder: 'What should we call you?',
  },
  {
    key: 'university',
    title: 'Where are you studying?',
    subtitle: 'We launch at UMelb and UWA first.',
    type: 'choice',
    options: [
      { value: 'UMelb', label: 'University of Melbourne', emoji: '🏛️' },
      { value: 'UWA', label: 'University of Western Australia', emoji: '🌅' },
    ],
  },
  {
    key: 'year_of_study',
    title: 'What year are you in?',
    type: 'choice',
    options: [
      { value: '1st year', label: '1st year' },
      { value: '2nd year', label: '2nd year' },
      { value: '3rd year', label: '3rd year' },
      { value: '4th year', label: '4th year' },
      { value: 'Honours', label: 'Honours' },
      { value: 'Masters', label: 'Masters' },
      { value: 'PhD', label: 'PhD' },
    ],
  },
  {
    key: 'international',
    title: 'Are you an international student?',
    subtitle: 'We surface clubs that welcome international students.',
    type: 'choice',
    options: [
      { value: true, label: 'Yes, I am', emoji: '🌏' },
      { value: false, label: 'No, domestic', emoji: '🏡' },
    ],
  },
  {
    key: 'interests',
    title: 'What are you into?',
    subtitle: 'Pick anything that sparks your curiosity. Mix it up.',
    type: 'multi',
    options: [
      'Technology', 'Entrepreneurship', 'Art & Design', 'Music', 'Sports',
      'Politics', 'Sustainability', 'Finance', 'Science', 'Gaming',
      'Photography', 'Writing', 'Dance', 'Culture', 'Volunteering',
      'Debate', 'Film', 'Food', 'Wellness', 'Languages',
    ],
  },
  {
    key: 'goals',
    title: 'What are you here to find?',
    subtitle: 'Tell us your why. We tune the feed to match.',
    type: 'multi',
    options: [
      'Make friends', 'Build my resume', 'Find internships', 'Try new things',
      'Compete & win', 'Lead something', 'Find my people', 'Have fun',
    ],
  },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { setProfile } = useOutletContext() || {};
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);

  const current = STEPS[step];
  const value = answers[current.key];
  const canContinue =
    current.type === 'multi'
      ? Array.isArray(value) && value.length > 0
      : value !== undefined && value !== '' && value !== null;

  const next = async () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      await finish();
    }
  };

  const finish = async () => {
    setSaving(true);
    try {
      // Get AI vibe tags from interests + goals
      let vibeTags = [];
      try {
        const aiResult = await base44.integrations.Core.InvokeLLM({
          prompt: `A university student has these interests: ${(answers.interests || []).join(', ')}. Their goals: ${(answers.goals || []).join(', ')}. They are a ${answers.year_of_study} ${answers.international ? 'international' : 'domestic'} student at ${answers.university}. Generate 5 short "vibe tags" (1-2 words each) that capture their personality and what kinds of clubs/events they'd love. Keep them fresh and specific, not generic.`,
          response_json_schema: {
            type: 'object',
            properties: {
              vibe_tags: { type: 'array', items: { type: 'string' } },
            },
          },
        });
        vibeTags = aiResult?.vibe_tags || [];
      } catch (e) {
        vibeTags = (answers.interests || []).slice(0, 5);
      }

      const profileData = {
        display_name: answers.name,
        university: answers.university,
        year_of_study: answers.year_of_study,
        international: answers.international,
        interests: answers.interests || [],
        goals: answers.goals || [],
        vibe_tags: vibeTags,
        onboarding_complete: true,
        demo_role: 'student',
      };

      // Update or create profile
      const existing = await base44.entities.StudentProfile.list();
      let saved;
      if (existing[0]) {
        saved = await base44.entities.StudentProfile.update(existing[0].id, profileData);
      } else {
        saved = await base44.entities.StudentProfile.create(profileData);
      }
      if (setProfile) setProfile(saved);
      navigate('/');
    } catch (e) {
      console.error(e);
      setSaving(false);
    }
  };

  const setValue = (val) => {
    setAnswers((a) => ({ ...a, [current.key]: val }));
  };

  const toggleMulti = (val) => {
    const list = answers[current.key] || [];
    if (list.includes(val)) {
      setValue(list.filter((v) => v !== val));
    } else {
      setValue([...list, val]);
    }
  };

  return (
    <div className="min-h-screen bg-background gradient-mesh flex flex-col">
      {/* Progress bar */}
      <div className="px-6 pt-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Step {step + 1} of {STEPS.length}
            </span>
          </div>
          <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-accent rounded-full"
              initial={false}
              animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-2xl w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
            >
              <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight text-balance mb-3">
                {current.title}
              </h1>
              {current.subtitle && (
                <p className="text-lg text-muted-foreground mb-10 text-balance">
                  {current.subtitle}
                </p>
              )}

              {current.type === 'text' && (
                <Input
                  autoFocus
                  value={value || ''}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={current.placeholder}
                  className="h-14 text-lg rounded-2xl"
                  onKeyDown={(e) => e.key === 'Enter' && canContinue && next()}
                />
              )}

              {current.type === 'choice' && (
                <div className="grid gap-3">
                  {current.options.map((opt) => (
                    <button
                      key={String(opt.value)}
                      onClick={() => setValue(opt.value)}
                      className={cn(
                        'group flex items-center justify-between p-5 rounded-2xl border-2 transition-all text-left',
                        value === opt.value
                          ? 'border-accent bg-accent/5'
                          : 'border-border hover:border-accent/40 bg-card'
                      )}
                    >
                      <div className="flex items-center gap-4">
                        {opt.emoji && <span className="text-2xl">{opt.emoji}</span>}
                        <span className="font-medium text-lg">{opt.label}</span>
                      </div>
                      {value === opt.value && (
                        <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {current.type === 'multi' && (
                <div className="flex flex-wrap gap-2">
                  {current.options.map((opt) => {
                    const selected = (answers[current.key] || []).includes(opt);
                    return (
                      <button
                        key={opt}
                        onClick={() => toggleMulti(opt)}
                        className={cn(
                          'px-4 py-2.5 rounded-full border-2 font-medium text-sm transition-all',
                          selected
                            ? 'border-accent bg-accent text-accent-foreground'
                            : 'border-border bg-card hover:border-accent/40'
                        )}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Nav */}
      <div className="px-6 pb-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0 || saving}
            className="rounded-full"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <Button
            onClick={next}
            disabled={!canContinue || saving}
            size="lg"
            className="rounded-full px-8 bg-primary hover:bg-primary/90"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Tuning your feed</>
            ) : step === STEPS.length - 1 ? (
              <>Finish <Sparkles className="w-4 h-4 ml-2" /></>
            ) : (
              <>Continue <ArrowRight className="w-4 h-4 ml-2" /></>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}