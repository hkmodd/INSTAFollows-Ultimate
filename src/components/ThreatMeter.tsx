import { motion } from "framer-motion";
import { Shield, AlertTriangle } from "lucide-react";
import { useTranslation } from "../i18n";

interface ThreatMeterProps {
    integrity: number; // 0-100
    isScanning: boolean;
}

export function ThreatMeter({ integrity, isScanning }: ThreatMeterProps) {
    const { t } = useTranslation();

    // Color based on integrity level
    const getColor = () => {
        if (integrity >= 80) return { stroke: "#10b981", glow: "rgba(16, 185, 129, 0.4)" }; // Emerald
        if (integrity >= 50) return { stroke: "#f59e0b", glow: "rgba(245, 158, 11, 0.4)" }; // Amber
        if (integrity >= 20) return { stroke: "#f97316", glow: "rgba(249, 115, 22, 0.4)" }; // Orange
        return { stroke: "#ef4444", glow: "rgba(239, 68, 68, 0.4)" }; // Red
    };

    const colors = getColor();
    const circumference = 2 * Math.PI * 54; // radius = 54
    const strokeDashoffset = circumference - (integrity / 100) * circumference;

    const getStatusText = () => {
        if (isScanning) return t('threat.scanning');
        if (integrity >= 80) return t('threat.optimal');
        if (integrity >= 50) return t('threat.caution');
        if (integrity >= 20) return t('threat.risk');
        return t('threat.danger');
    };

    return (
        <div className="relative flex flex-col items-center justify-center p-6">
            {/* SVG Gauge */}
            <div className="relative w-36 h-36">
                {/* Background Ring */}
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                    <circle
                        cx="60"
                        cy="60"
                        r="54"
                        stroke="rgba(255,255,255,0.1)"
                        strokeWidth="8"
                        fill="none"
                    />
                    {/* Animated Progress Ring */}
                    <motion.circle
                        cx="60"
                        cy="60"
                        r="54"
                        stroke={colors.stroke}
                        strokeWidth="8"
                        fill="none"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        initial={{ strokeDashoffset: circumference }}
                        animate={{ strokeDashoffset }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        style={{
                            filter: `drop-shadow(0 0 8px ${colors.glow})`,
                        }}
                    />
                </svg>

                {/* Center Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {integrity < 20 ? (
                        <motion.div
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ repeat: Infinity, duration: 1 }}
                        >
                            <AlertTriangle className="w-8 h-8 text-red-500" />
                        </motion.div>
                    ) : (
                        <Shield
                            className="w-8 h-8"
                            style={{ color: colors.stroke }}
                        />
                    )}
                    <span
                        className="text-2xl font-black mt-1"
                        style={{ color: colors.stroke }}
                    >
                        {integrity}%
                    </span>
                </div>
            </div>

            {/* Status Label */}
            <div className="mt-4 text-center">
                <motion.p
                    className="text-xs font-bold tracking-widest"
                    style={{ color: colors.stroke }}
                    animate={isScanning ? { opacity: [0.5, 1, 0.5] } : {}}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                >
                    {getStatusText()}
                </motion.p>
                <p className="text-[10px] text-gray-500 mt-1">{t('threat.capacity')}</p>
                <p className="text-[9px] text-gray-600 mt-0.5 max-w-[140px]">
                    {integrity >= 80
                        ? t('threat.safeDesc')
                        : integrity >= 50
                            ? t('threat.cautionDesc')
                            : integrity >= 20
                                ? t('threat.riskDesc')
                                : t('threat.waitDesc')}
                </p>
            </div>

            {/* Warning Banner */}
            {integrity < 20 && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 px-4 py-2 bg-red-500/20 border border-red-500/50 rounded-lg"
                >
                    <p className="text-[10px] text-red-400 font-bold text-center">
                        ⚠️ {t('threat.disabled')}
                    </p>
                </motion.div>
            )}
        </div>
    );
}
