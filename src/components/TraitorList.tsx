import { useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Ghost, ExternalLink } from "lucide-react";
import { ProxiedAvatar } from "./ProxiedAvatar";

export interface Profile {
    id: string;
    username: string;
    full_name: string;
    profile_pic_url: string;
    profile_pic_url_hd?: string;
    is_verified: boolean;
    is_private: boolean;
    is_business_account: boolean;
    is_professional_account: boolean;
    category_name?: string;
}

interface TraitorListProps {
    traitors: Profile[];
    onUnfollow?: (profile: Profile) => void;
}

export function TraitorList({ traitors, onUnfollow }: TraitorListProps) {
    const parentRef = useRef<HTMLDivElement>(null);

    // Force re-render on resize to recalculate virtualization
    useEffect(() => {
        const observer = new ResizeObserver(() => {
            // Just trigger a re-measure by the virtualizer
            if (parentRef.current) {
                parentRef.current.dispatchEvent(new Event("scroll"));
            }
        });

        if (parentRef.current) {
            observer.observe(parentRef.current);
        }

        return () => observer.disconnect();
    }, []);

    const virtualizer = useVirtualizer({
        count: traitors.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 72,
        overscan: 5,
    });

    if (traitors.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                    <Ghost className="w-10 h-10 text-emerald-500" />
                </div>
                <h3 className="text-lg font-bold text-gray-300 mb-2">No Traitors Found</h3>
                <p className="text-sm text-gray-500 max-w-xs">
                    Everyone you follow is following you back. Perfect loyalty!
                </p>
            </div>
        );
    }

    return (
        <div
            ref={parentRef}
            className="absolute inset-0 overflow-y-auto"
            style={{ contain: "strict" }}
        >
            <div
                style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative",
                }}
            >
                {virtualizer.getVirtualItems().map((virtualItem) => {
                    const profile = traitors[virtualItem.index];
                    const avatarUrl = profile.profile_pic_url_hd || profile.profile_pic_url;

                    return (
                        <div
                            key={profile.id}
                            style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                height: `${virtualItem.size}px`,
                                transform: `translateY(${virtualItem.start}px)`,
                            }}
                            className="px-4 py-2"
                        >
                            <div className="flex items-center gap-4 p-3 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-pink-500/30 rounded-xl transition-all group">
                                {/* Avatar with Glow Ring */}
                                <div className="relative shrink-0">
                                    <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-pink-500/50 group-hover:ring-pink-500 transition-all">
                                        <ProxiedAvatar
                                            url={avatarUrl}
                                            username={profile.username}
                                            className="w-full h-full object-cover bg-gray-800"
                                        />
                                    </div>
                                    {profile.is_verified && (
                                        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                                            </svg>
                                        </div>
                                    )}
                                </div>

                                {/* User Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-white truncate">
                                            @{profile.username}
                                        </span>
                                        {profile.is_private && (
                                            <span className="text-[9px] px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded">
                                                🔒
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500 truncate">
                                        {profile.full_name || "No name"}
                                    </p>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 shrink-0">
                                    <a
                                        href={`https://instagram.com/${profile.username}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-2 text-gray-500 hover:text-cyan-400 transition-colors"
                                        title="View Profile"
                                    >
                                        <ExternalLink size={16} />
                                    </a>
                                    <button
                                        onClick={() => onUnfollow?.(profile)}
                                        className="px-3 py-1.5 text-xs font-bold text-red-400 hover:text-white hover:bg-red-500 border border-red-500/50 hover:border-red-500 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        <Ghost size={14} className="inline mr-1" />
                                        UNFOLLOW
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

