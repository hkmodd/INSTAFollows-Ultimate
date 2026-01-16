import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Instagram, MousePointer, FileJson, ChevronRight, ChevronLeft, X, Sparkles, CheckCircle2 } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useTranslation } from '../i18n';

interface OnboardingWizardProps {
    visible: boolean;
    onClose: () => void;
    onComplete: () => void;
}

export const OnboardingWizard = ({ visible, onClose, onComplete }: OnboardingWizardProps) => {
    const { t } = useTranslation();
    const [currentStep, setCurrentStep] = useState(0);

    // Reset to step 0 when wizard is opened
    useEffect(() => {
        if (visible) {
            setCurrentStep(0);
        }
    }, [visible]);

    const steps = [
        {
            icon: Download,
            color: 'cyan',
            title: t('onboarding.step1.title'),
            description: t('onboarding.step1.description'),
            action: () => openUrl('https://chromewebstore.google.com/detail/export-cookie-json-file-f/nmckokihipjgplolmcmjakknndddifde'),
            actionLabel: t('onboarding.step1.action'),
        },
        {
            icon: Instagram,
            color: 'pink',
            title: t('onboarding.step2.title'),
            description: t('onboarding.step2.description'),
            action: () => openUrl('https://www.instagram.com/'),
            actionLabel: t('onboarding.step2.action'),
        },
        {
            icon: MousePointer,
            color: 'purple',
            title: t('onboarding.step3.title'),
            description: t('onboarding.step3.description'),
            action: null,
            actionLabel: null,
        },
        {
            icon: FileJson,
            color: 'emerald',
            title: t('onboarding.step4.title'),
            description: t('onboarding.step4.description'),
            action: onComplete,
            actionLabel: t('onboarding.step4.action'),
        },
    ];

    const colorClasses: Record<string, { bg: string; border: string; text: string; glow: string }> = {
        cyan: { bg: 'bg-cyan-500/20', border: 'border-cyan-500/50', text: 'text-cyan-400', glow: 'shadow-[0_0_30px_rgba(6,182,212,0.3)]' },
        pink: { bg: 'bg-pink-500/20', border: 'border-pink-500/50', text: 'text-pink-400', glow: 'shadow-[0_0_30px_rgba(236,72,153,0.3)]' },
        purple: { bg: 'bg-purple-500/20', border: 'border-purple-500/50', text: 'text-purple-400', glow: 'shadow-[0_0_30px_rgba(168,85,247,0.3)]' },
        emerald: { bg: 'bg-emerald-500/20', border: 'border-emerald-500/50', text: 'text-emerald-400', glow: 'shadow-[0_0_30px_rgba(16,185,129,0.3)]' },
    };

    const step = steps[currentStep];
    const colors = colorClasses[step.color];
    const Icon = step.icon;

    const nextStep = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1);
        }
    };

    const prevStep = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-xl"
                >
                    <motion.div
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.95, y: 10 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                        className={`relative w-[90%] max-w-xl bg-black/95 border rounded-3xl p-8 ${colors.border} ${colors.glow}`}
                    >
                        {/* Close Button */}
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
                        >
                            <X size={20} />
                        </button>

                        {/* Header */}
                        <div className="flex items-center gap-3 mb-6">
                            <Sparkles className="text-emerald-400" size={20} />
                            <h2 className="text-lg font-bold text-white tracking-wider uppercase">
                                {t('onboarding.title')}
                            </h2>
                        </div>

                        {/* Progress Bar */}
                        <div className="flex gap-2 mb-8">
                            {steps.map((_, i) => (
                                <div
                                    key={i}
                                    className={`flex-1 h-1 rounded-full transition-all duration-300 ${i <= currentStep ? 'bg-emerald-500' : 'bg-white/10'
                                        }`}
                                />
                            ))}
                        </div>

                        {/* Step Content */}
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={currentStep}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.15 }}
                                className="flex flex-col items-center text-center"
                            >
                                {/* Icon */}
                                <div className={`w-24 h-24 rounded-2xl ${colors.bg} ${colors.border} border flex items-center justify-center mb-6 ${colors.glow}`}>
                                    <Icon size={40} className={colors.text} />
                                </div>

                                {/* Step Number */}
                                <div className="text-xs font-bold text-gray-500 tracking-widest mb-2">
                                    {t('onboarding.step')} {currentStep + 1} / {steps.length}
                                </div>

                                {/* Title */}
                                <h3 className={`text-2xl font-bold ${colors.text} mb-4`}>
                                    {step.title}
                                </h3>

                                {/* Description */}
                                <p className="text-gray-400 text-sm leading-relaxed mb-8 max-w-sm">
                                    {step.description}
                                </p>

                                {/* Action Button */}
                                {step.action && (
                                    <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={step.action}
                                        className={`px-8 py-3 rounded-xl ${colors.bg} ${colors.border} border ${colors.text} font-bold tracking-wider uppercase flex items-center gap-2 mb-4 hover:bg-opacity-30 transition-all ${colors.glow}`}
                                    >
                                        {currentStep === steps.length - 1 ? <CheckCircle2 size={18} /> : <Icon size={18} />}
                                        {step.actionLabel}
                                    </motion.button>
                                )}
                            </motion.div>
                        </AnimatePresence>

                        {/* Navigation */}
                        <div className="flex justify-between items-center mt-6 pt-6 border-t border-white/10">
                            <button
                                onClick={prevStep}
                                disabled={currentStep === 0}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${currentStep === 0
                                    ? 'text-gray-600 cursor-not-allowed'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <ChevronLeft size={18} />
                                {t('onboarding.back')}
                            </button>

                            {currentStep < steps.length - 1 ? (
                                <button
                                    onClick={nextStep}
                                    className="flex items-center gap-2 px-6 py-2 bg-emerald-500/20 border border-emerald-500/50 rounded-lg text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all font-bold tracking-wider"
                                >
                                    {t('onboarding.next')}
                                    <ChevronRight size={18} />
                                </button>
                            ) : (
                                <button
                                    onClick={onClose}
                                    className="text-gray-500 hover:text-white transition-colors"
                                >
                                    {t('onboarding.skip')}
                                </button>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
