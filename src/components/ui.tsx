import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

// Glass Panel Component
interface GlassPanelProps {
    children: React.ReactNode;
    className?: string;
}

export function GlassPanel({ children, className }: GlassPanelProps) {
    return (
        <div
            className={cn(
                "glass rounded-2xl",
                className
            )}
        >
            {children}
        </div>
    );
}

// Status Indicator
interface StatusIndicatorProps {
    status: "OFFLINE" | "READY" | "PREPARING" | "SCANNING" | "COMPLETE";
    label?: string;
}

export function StatusIndicator({ status, label }: StatusIndicatorProps) {
    const colors = {
        OFFLINE: "bg-red-500",
        READY: "bg-emerald-500",
        PREPARING: "bg-amber-500",
        SCANNING: "bg-amber-500 animate-pulse",
        COMPLETE: "bg-cyan-500",
    };

    return (
        <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full", colors[status])} />
            <span className="text-[10px] font-bold text-gray-400 tracking-wider">
                {label || status}
            </span>
        </div>
    );
}

// Tech Input
interface TechInputProps {
    label: string;
    value: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    readOnly?: boolean;
}

export function TechInput({ label, value, onChange, placeholder, readOnly }: TechInputProps) {
    return (
        <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                {label}
            </label>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange?.(e.target.value)}
                placeholder={placeholder}
                readOnly={readOnly}
                className={cn(
                    "h-12 px-4 bg-black/40 border border-white/10 rounded-xl",
                    "text-sm font-mono text-gray-300",
                    "placeholder:text-gray-600",
                    "focus:outline-none focus:border-cyan-500/50",
                    "transition-colors",
                    readOnly && "cursor-default opacity-70"
                )}
            />
        </div>
    );
}
